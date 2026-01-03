import { ensureDatabase } from '../lib/ensureDatabase.js';
import { recordQuestionFeedback, getFeedbackInsights } from '../lib/questionFeedback.js';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

const parseJson = (value, fallback) => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed;
  } catch {
    return fallback;
  }
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const resolveUserRole = (user, env) => {
  if (!user?.email) return null;
  const isSuper = env?.SUPERUSER_EMAIL
    ? normalizeEmail(env.SUPERUSER_EMAIL) === normalizeEmail(user.email)
    : false;
  return isSuper ? 'superuser' : 'user';
};

const summarizeQuestionFeedback = (rows) => {
  const issueCounts = new Map();
  let ratingSum = 0;
  let ratingCount = 0;
  let negativeCount = 0;
  let positiveCount = 0;

  rows.forEach((row) => {
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
      const parsed = parseJson(row.issues, []);
      const issues = Array.isArray(parsed) ? parsed : [parsed];
      issues.forEach((issue) => {
        const clean = String(issue || '').trim();
        if (!clean) return;
        issueCounts.set(clean, (issueCounts.get(clean) || 0) + 1);
      });
    }
  });

  const topIssues = Array.from(issueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([issue, count]) => ({ issue, count }));

  return {
    total: rows.length,
    avgRating: ratingCount > 0 ? ratingSum / ratingCount : null,
    positiveCount,
    negativeCount,
    topIssues
  };
};

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await ensureDatabase(env.DB);
    const payload = await request.json();
    const questionId = payload?.questionId;
    if (!questionId) {
      return new Response(JSON.stringify({ success: false, error: 'questionId krävs.' }), {
        status: 400,
        headers: jsonHeaders
      });
    }

    const question = await env.DB.prepare(
      'SELECT id, categories, age_groups, difficulty, target_audience, ai_generation_provider, ai_generation_model, ai_validation_result FROM questions WHERE id = ?'
    ).bind(questionId).first();

    if (!question) {
      return new Response(JSON.stringify({ success: false, error: 'Frågan hittades inte.' }), {
        status: 404,
        headers: jsonHeaders
      });
    }

    const categories = parseJson(question.categories, []);
    const ageGroups = parseJson(question.age_groups, []);
    const category = Array.isArray(categories) ? categories[0] : categories;
    const ageGroup = Array.isArray(ageGroups) ? ageGroups[0] : ageGroups;
    const validationResult = parseJson(question.ai_validation_result, null);
    const validationProvider = payload?.validationProvider
      || validationResult?.validationContext?.validationProvider
      || null;

    const userEmail = normalizeEmail(request.headers.get('x-user-email'));
    const user = userEmail
      ? await env.DB.prepare('SELECT id, email FROM users WHERE email = ?').bind(userEmail).first()
      : null;

    const userRole = resolveUserRole(user, env) || payload?.userRole || null;
    const record = {
      questionId,
      feedbackType: payload?.feedbackType || 'question',
      rating: payload?.rating ?? null,
      verdict: payload?.verdict || null,
      issues: payload?.issues || null,
      comment: payload?.comment || null,
      userId: user?.id || payload?.userId || null,
      userEmail: user?.email || userEmail || null,
      deviceId: payload?.deviceId || null,
      userRole,
      category: category || null,
      ageGroup: ageGroup || null,
      difficulty: question.difficulty || null,
      targetAudience: question.target_audience || null,
      generationProvider: question.ai_generation_provider || null,
      generationModel: question.ai_generation_model || null,
      validationProvider
    };

    const result = await recordQuestionFeedback(env, record);

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      status: 200,
      headers: jsonHeaders
    });
  } catch (error) {
    console.error('[question-feedback] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: jsonHeaders
    });
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await ensureDatabase(env.DB);
    const url = new URL(request.url);
    const questionId = url.searchParams.get('questionId');
    const feedbackType = url.searchParams.get('feedbackType') || 'question';

    if (!questionId) {
      const summary = await getFeedbackInsights(env.DB, { feedbackType });
      return new Response(JSON.stringify({ success: true, summary }), {
        status: 200,
        headers: jsonHeaders
      });
    }

    const { results } = await env.DB.prepare(
      'SELECT rating, verdict, issues FROM question_feedback WHERE question_id = ? AND feedback_type = ?'
    ).bind(questionId, feedbackType).all();

    const summary = summarizeQuestionFeedback(results || []);

    return new Response(JSON.stringify({ success: true, summary }), {
      status: 200,
      headers: jsonHeaders
    });
  } catch (error) {
    console.error('[question-feedback] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: jsonHeaders
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-email'
    }
  });
}
