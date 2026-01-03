import { ensureDatabase } from './ensureDatabase.js';

const clampRating = (value) => {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 1) return 1;
  if (numeric > 5) return 5;
  return Math.round(numeric);
};

const normalizeIssues = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

export const recordQuestionFeedback = async (env, feedback) => {
  await ensureDatabase(env.DB);
  const id = crypto.randomUUID();
  const createdAt = Date.now();

  const rating = clampRating(feedback.rating);
  const issues = normalizeIssues(feedback.issues);

  await env.DB.prepare(
    `INSERT INTO question_feedback (
      id,
      question_id,
      feedback_type,
      rating,
      verdict,
      issues,
      comment,
      user_id,
      user_email,
      device_id,
      user_role,
      category,
      age_group,
      difficulty,
      target_audience,
      generation_provider,
      generation_model,
      validation_provider,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    feedback.questionId,
    feedback.feedbackType || 'question',
    rating,
    feedback.verdict || null,
    issues.length > 0 ? JSON.stringify(issues) : null,
    feedback.comment ? String(feedback.comment).trim() : null,
    feedback.userId || null,
    feedback.userEmail || null,
    feedback.deviceId || null,
    feedback.userRole || null,
    feedback.category || null,
    feedback.ageGroup || null,
    feedback.difficulty || null,
    feedback.targetAudience || null,
    feedback.generationProvider || null,
    feedback.generationModel || null,
    feedback.validationProvider || null,
    createdAt
  ).run();

  return { id, createdAt };
};

const buildFeedbackFilters = (filters = {}, tableAlias = '') => {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const clauses = [`${prefix}feedback_type = ?`, `${prefix}created_at >= ?`];
  const params = [filters.feedbackType || 'question', filters.cutoff || 0];

  const addClause = (field, value) => {
    if (!value) return;
    clauses.push(`${prefix}${field} = ?`);
    params.push(value);
  };

  addClause('category', filters.category);
  addClause('age_group', filters.ageGroup);
  addClause('difficulty', filters.difficulty);
  addClause('target_audience', filters.targetAudience);

  return { clauses, params };
};

export const getFeedbackInsights = async (db, filters = {}) => {
  await ensureDatabase(db);
  const cutoff = Number.isFinite(filters.cutoff)
    ? filters.cutoff
    : Date.now() - (filters.limitDays || 90) * 24 * 60 * 60 * 1000;
  const { clauses, params } = buildFeedbackFilters({ ...filters, cutoff }, 'f');

  const { results } = await db.prepare(
    `SELECT f.rating, f.verdict, f.issues FROM question_feedback f WHERE ${clauses.join(' AND ')}`
  ).bind(...params).all();

  const issueCounts = new Map();
  let ratingSum = 0;
  let ratingCount = 0;
  let negativeCount = 0;
  let positiveCount = 0;

  results.forEach((row) => {
    const rating = Number(row.rating);
    if (Number.isFinite(rating)) {
      ratingSum += rating;
      ratingCount += 1;
      if (rating <= 2) {
        negativeCount += 1;
      } else if (rating >= 4) {
        positiveCount += 1;
      }
    } else if (row.verdict === 'reject') {
      negativeCount += 1;
    } else if (row.verdict === 'approve') {
      positiveCount += 1;
    }

    if (row.issues) {
      try {
        const parsed = JSON.parse(row.issues);
        const issues = Array.isArray(parsed) ? parsed : [parsed];
        issues.forEach((issue) => {
          const clean = String(issue || '').trim();
          if (!clean) return;
          issueCounts.set(clean, (issueCounts.get(clean) || 0) + 1);
        });
      } catch {
        const clean = String(row.issues || '').trim();
        if (clean) {
          issueCounts.set(clean, (issueCounts.get(clean) || 0) + 1);
        }
      }
    }
  });

  const topIssues = Array.from(issueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([issue, count]) => ({ issue, count }));

  return {
    total: results.length,
    avgRating: ratingCount > 0 ? ratingSum / ratingCount : null,
    negativeCount,
    positiveCount,
    topIssues
  };
};

export const getProviderFeedbackScores = async (db, filters = {}) => {
  await ensureDatabase(db);
  const cutoff = Number.isFinite(filters.cutoff)
    ? filters.cutoff
    : Date.now() - (filters.limitDays || 180) * 24 * 60 * 60 * 1000;
  const providerField = filters.feedbackType === 'validation'
    ? 'validation_provider'
    : 'generation_provider';

  const { clauses, params } = buildFeedbackFilters({ ...filters, cutoff }, 'f');
  clauses.push(`f.${providerField} IS NOT NULL`);
  clauses.push('f.rating IS NOT NULL');

  const { results } = await db.prepare(
    `SELECT f.${providerField} AS provider, AVG(f.rating) AS avgRating, COUNT(*) AS count
     FROM question_feedback f
     WHERE ${clauses.join(' AND ')}
     GROUP BY f.${providerField}`
  ).bind(...params).all();

  return results.reduce((acc, row) => {
    if (!row.provider) return acc;
    acc.set(String(row.provider).toLowerCase(), {
      avgRating: Number(row.avgRating) || null,
      count: Number(row.count) || 0
    });
    return acc;
  }, new Map());
};

const parseJsonArray = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const formatExampleBlock = (examples, label) => {
  if (!Array.isArray(examples) || examples.length === 0) return '';
  const lines = examples.map((example, index) => {
    const correctText = example.correctAnswer ? `Rätt svar: ${example.correctAnswer}.` : '';
    const issueText = Array.isArray(example.issues) && example.issues.length > 0
      ? `Problem: ${example.issues.join(', ')}.`
      : '';
    return `${index + 1}) ${example.question_sv}${correctText ? ` ${correctText}` : ''}${issueText ? ` ${issueText}` : ''}`;
  });
  return `\n${label}:\n${lines.join('\n')}\n`;
};

export const getFeedbackExamples = async (db, filters = {}, options = {}) => {
  await ensureDatabase(db);
  const cutoff = Number.isFinite(filters.cutoff)
    ? filters.cutoff
    : Date.now() - (filters.limitDays || 180) * 24 * 60 * 60 * 1000;
  const { clauses, params } = buildFeedbackFilters({ ...filters, cutoff }, 'f');

  if (Number.isFinite(options.minRating)) {
    clauses.push('f.rating >= ?');
    params.push(options.minRating);
  }
  if (Number.isFinite(options.maxRating)) {
    clauses.push('f.rating <= ?');
    params.push(options.maxRating);
  }
  clauses.push('f.question_id IS NOT NULL');

  const order = options.order === 'asc' ? 'rating ASC' : 'rating DESC';
  const limit = Number.isFinite(options.limit) ? options.limit : 2;
  const fetchLimit = limit * 3;

  const { results } = await db.prepare(
    `SELECT f.question_id AS questionId, f.rating, f.issues, q.question_sv, q.options_sv, q.correct_option
     FROM question_feedback f
     JOIN questions q ON q.id = f.question_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY ${order}, f.created_at DESC
     LIMIT ${fetchLimit}`
  ).bind(...params).all();

  const seen = new Set();
  const examples = [];
  for (const row of results || []) {
    if (!row.questionId || seen.has(row.questionId)) continue;
    seen.add(row.questionId);
    const options = parseJsonArray(row.options_sv);
    const correctOption = Number.isFinite(row.correct_option) ? row.correct_option : null;
    const correctAnswer = Number.isFinite(correctOption) && Array.isArray(options)
      ? options[correctOption]
      : null;
    const issues = row.issues ? parseJsonArray(row.issues) : [];
    examples.push({
      questionId: row.questionId,
      question_sv: row.question_sv,
      correctAnswer,
      issues
    });
    if (examples.length >= limit) break;
  }

  return examples;
};

export const formatFeedbackPrompt = (insights, title) => {
  if (!insights || !insights.total || insights.total < 3) return '';
  const issues = insights.topIssues || [];
  if (issues.length === 0) return '';
  const issueText = issues
    .map((item) => `${item.issue} (${item.count})`)
    .join(', ');
  const avgRating = insights.avgRating ? insights.avgRating.toFixed(1) : null;
  const ratingLine = avgRating ? `\n- Snittbetyg: ${avgRating}/5 (${insights.total} betyg)` : '';

  return `\n${title ? `${title}\n` : ''}- Vanliga problem: ${issueText}.${ratingLine}\n- Undvik dessa problem i kommande frågor.\n`;
};

export const formatGenerationLearningPrompt = (insights, examples) => {
  const base = formatFeedbackPrompt(insights, 'FEEDBACK FRÅN ANVÄNDARE/SUPERUSER');
  const goodExamples = formatExampleBlock(examples?.good, 'GODA EXEMPEL (efterlikna stil, inte innehåll)');
  const badExamples = formatExampleBlock(examples?.bad, 'DÅLIGA EXEMPEL (undvik)');
  if (!base && !goodExamples && !badExamples) return '';
  return `\nLÄRDOMAR BASERAT PÅ FEEDBACK:\n${base}${goodExamples}${badExamples}`.trimEnd() + '\n';
};

export const formatValidationLearningPrompt = (insights) => {
  const base = formatFeedbackPrompt(insights, 'FEEDBACK PÅ VALIDERING');
  if (!base) return '';
  const issues = insights.topIssues || [];
  const issueLabels = issues.map((item) => String(item.issue || '').toLowerCase());
  const tooStrict = issueLabels.some((label) => label.includes('för_strikt') || label.includes('falsk_underkänn'));
  const tooLenient = issueLabels.some((label) => label.includes('för_slapp') || label.includes('falsk_godkänn'));
  const biasNote = tooStrict
    ? '\n- Feedback visar att valideringen ibland är för strikt. Underkänn bara när du är tydligt säker.'
    : tooLenient
      ? '\n- Feedback visar att valideringen ibland är för slapp. Underkänn när det finns rimlig tvekan.'
      : '';
  return `\n${base}${biasNote}\n`;
};
