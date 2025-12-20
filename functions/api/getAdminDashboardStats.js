/**
 * Cloudflare Pages Function: Admin Dashboard Stats
 * Aggregates question, validation, report, provider, task, and answer metrics.
 */
import { ensureDatabase } from '../lib/ensureDatabase.js';

const FINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const safeParseJSON = (value, fallback = null) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const toNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const parseTimestamp = (value) => {
  if (!value) return null;
  const numeric = toNumber(value);
  let date;
  if (numeric !== null) {
    const ms = numeric > 1e12 ? numeric : numeric * 1000;
    date = new Date(ms);
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const toMonthKey = (date) => {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const normalizeText = (value) => {
  if (!value) return '';
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
};

const getBool = (value) => value === 1 || value === true;

const buildSystemSummary = (tasks, matcher) => {
  const filtered = tasks.filter((task) => matcher(task));
  if (filtered.length === 0) {
    return { lastRun: null, status: 'saknas', processed: 0 };
  }
  const latest = filtered.reduce((acc, current) => {
    if (!acc) return current;
    return (current.createdAtMs || 0) > (acc.createdAtMs || 0) ? current : acc;
  }, null);

  const processed =
    typeof latest?.result?.count === 'number'
      ? latest.result.count
      : typeof latest?.progress?.validated === 'number'
        ? latest.progress.validated
        : 0;

  return {
    lastRun: latest?.createdAtIso || null,
    status: latest?.status || 'ok',
    processed,
  };
};

export async function onRequestGet(context) {
  const { env } = context;

  try {
    await ensureDatabase(env.DB);

    const [questionsData, answersData, tasksData] = await Promise.all([
      env.DB.prepare('SELECT * FROM questions').all(),
      env.DB.prepare('SELECT question_id, is_correct FROM answers').all(),
      env.DB.prepare('SELECT * FROM background_tasks ORDER BY created_at DESC LIMIT 250').all(),
    ]);

    const questions = questionsData.results || [];
    const answers = answersData.results || [];
    const tasks = (tasksData.results || []).map((row) => {
      const createdAt = parseTimestamp(row.created_at || row.createdAt);
      return {
        id: row.id,
        taskType: row.task_type || row.taskType || 'task',
        status: row.status,
        label: row.label,
        progress: safeParseJSON(row.progress, null),
        result: safeParseJSON(row.result, null),
        createdAtIso: createdAt ? createdAt.toISOString() : null,
        createdAtMs: createdAt ? createdAt.getTime() : null,
      };
    });

    const totals = {
      total: 0,
      approved: 0,
      rejected: 0,
      reported: 0,
      needsReview: 0,
      autoApproved: 0,
    };
    const validationTotals = { total: 0, passed: 0 };
    const confidence = { sum: 0, count: 0 };
    const confidenceDistribution = { low: 0, mid: 0, high: 0 };
    const duplicateBuckets = new Map();
    const categoryCounts = new Map();
    const reportedCategoryCounts = new Map();
    const generationProviders = new Map();
    const validationProviders = new Map();
    const difficultyByQuestionId = new Map();
    const questionTextById = new Map();
    const monthlyTotals = new Map();
    const monthlyAiTotals = new Map();

    questions.forEach((row) => {
      totals.total += 1;

      const questionSv = row.question_sv || row.question || row.questionSv || '';
      const questionEn = row.question_en || row.questionEn || '';
      const normalized = normalizeText(questionSv || questionEn);
      if (normalized) {
        duplicateBuckets.set(normalized, (duplicateBuckets.get(normalized) || 0) + 1);
      }

      questionTextById.set(row.id, questionSv || questionEn || 'Okänd fråga');

      const categories = safeParseJSON(row.categories, null);
      const categoryArray = Array.isArray(categories)
        ? categories
        : row.category
          ? [row.category]
          : ['Allmän'];

      categoryArray.forEach((category) => {
        if (!category) return;
        categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
      });

      const createdAt = parseTimestamp(row.created_at || row.createdAt);
      const monthKey = toMonthKey(createdAt);
      if (monthKey) {
        monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + 1);
        if (row.ai_generation_provider || row.provider || row.ai_generated || row.aiGenerated) {
          monthlyAiTotals.set(monthKey, (monthlyAiTotals.get(monthKey) || 0) + 1);
        }
      }

      const aiValidated = getBool(row.ai_validated) || getBool(row.aiValidated);
      const manuallyApproved = getBool(row.manually_approved) || getBool(row.manuallyApproved);
      const manuallyRejected = getBool(row.manually_rejected) || getBool(row.manuallyRejected);
      const reportCount = row.report_count || row.reportCount || 0;
      const reported = getBool(row.reported) || reportCount > 0;

      if (reported) {
        totals.reported += 1;
        categoryArray.forEach((category) => {
          if (!category) return;
          reportedCategoryCounts.set(category, (reportedCategoryCounts.get(category) || 0) + 1);
        });
      }

      const validationResult = safeParseJSON(row.ai_validation_result || row.aiValidationResult, null);
      const hasValidationResult = Boolean(validationResult);
      const isValid =
        validationResult?.isValid === true ||
        validationResult?.valid === true ||
        validationResult?.passed === true;

      if (hasValidationResult) {
        validationTotals.total += 1;
        if (isValid) validationTotals.passed += 1;
      }

      const approved = manuallyApproved || aiValidated;
      const rejected = manuallyRejected || (hasValidationResult && !isValid);
      const needsReview = !approved && !rejected && !reported;

      if (approved) totals.approved += 1;
      if (rejected) totals.rejected += 1;
      if (needsReview) totals.needsReview += 1;
      if (aiValidated && !manuallyApproved && !manuallyRejected) totals.autoApproved += 1;

      const confidenceValue = toNumber(validationResult?.confidence);
      if (confidenceValue !== null) {
        confidence.sum += confidenceValue;
        confidence.count += 1;
        if (confidenceValue <= 69) confidenceDistribution.low += 1;
        else if (confidenceValue <= 89) confidenceDistribution.mid += 1;
        else confidenceDistribution.high += 1;
      }

      const generationProvider = row.ai_generation_provider || row.aiGenerationProvider || row.provider;
      if (generationProvider) {
        const key = generationProvider.toLowerCase();
        generationProviders.set(key, (generationProviders.get(key) || 0) + 1);
      }

      const validationProvider = validationResult?.provider;
      if (validationProvider) {
        const key = validationProvider.toLowerCase();
        const entry = validationProviders.get(key) || {
          provider: key,
          validatedCount: 0,
          passed: 0,
          confidenceSum: 0,
          confidenceCount: 0,
        };
        entry.validatedCount += 1;
        if (isValid) entry.passed += 1;
        if (confidenceValue !== null) {
          entry.confidenceSum += confidenceValue;
          entry.confidenceCount += 1;
        }
        validationProviders.set(key, entry);
      }

      if (row.difficulty) {
        difficultyByQuestionId.set(row.id, row.difficulty);
      }
    });

    const duplicateGroups = Array.from(duplicateBuckets.values()).filter((count) => count > 1);
    const duplicateCount = duplicateGroups.reduce((sum, count) => sum + count, 0);

    const difficultyStats = {};
    const popularCount = new Map();
    answers.forEach((row) => {
      const questionId = row.question_id || row.questionId;
      if (!questionId) return;
      popularCount.set(questionId, (popularCount.get(questionId) || 0) + 1);
      const difficulty = difficultyByQuestionId.get(questionId);
      if (!difficulty) return;
      const bucket = difficultyStats[difficulty] || { total: 0, correct: 0 };
      bucket.total += 1;
      if (getBool(row.is_correct)) bucket.correct += 1;
      difficultyStats[difficulty] = bucket;
    });

    const topReportedCategories = Array.from(reportedCategoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([category, count]) => ({ category, count }));

    const categoryDistribution = Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([category, count]) => ({ category, count }));

    const monthlyStats = Array.from(monthlyTotals.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, total]) => ({
        month,
        total,
        aiGenerated: monthlyAiTotals.get(month) || 0,
      }));
    const recentMonthlyStats = monthlyStats.slice(-12);

    const difficultyRates = Object.entries(difficultyStats).map(([difficulty, values]) => ({
      difficulty,
      total: values.total,
      correct: values.correct,
      rate: values.total ? values.correct / values.total : 0,
    }));

    const popularQuestions = Array.from(popularCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([questionId, total]) => ({
        id: questionId,
        text: questionTextById.get(questionId) || 'Okänd fråga',
        totalAnswers: total,
      }));

    const validationProviderStats = Array.from(validationProviders.values()).map((entry) => ({
      provider: entry.provider,
      validatedCount: entry.validatedCount,
      passRate: entry.validatedCount ? entry.passed / entry.validatedCount : 0,
      avgConfidence: entry.confidenceCount ? entry.confidenceSum / entry.confidenceCount : null,
    }));

    const generationProviderStats = Array.from(generationProviders.entries()).map(([provider, count]) => ({
      provider,
      count,
    }));

    const activeTasks = tasks.filter((task) => !FINAL_STATUSES.has(task.status));
    const failedTasks = tasks.filter((task) => task.status === 'failed');

    const alerts = [];
    if (totals.reported > 0) {
      alerts.push({
        type: 'warning',
        message: `${totals.reported} rapporterade frågor kräver granskning`,
      });
    }
    if (failedTasks.length > 0) {
      alerts.push({
        type: 'error',
        message: `${failedTasks.length} bakgrundsjobb misslyckades`,
      });
    }

    const systems = {
      calibration: buildSystemSummary(tasks, (task) => task.taskType === 'calibration'),
      seasonal: buildSystemSummary(tasks, (task) => task.taskType === 'seasonal'),
      monthlyGeneration: buildSystemSummary(tasks, (task) => task.taskType === 'monthly_generation'),
      batchValidation: buildSystemSummary(
        tasks,
        (task) => task.taskType === 'batchvalidation' || task.taskType === 'validation_batch'
      ),
    };

    const stats = {
      generatedAt: new Date().toISOString(),
      overview: {
        totalQuestions: totals.total,
        approvedQuestions: totals.approved,
        rejectedQuestions: totals.rejected,
        reportedQuestions: totals.reported,
        needsReviewQuestions: totals.needsReview,
        autoApprovalRate: totals.approved ? totals.autoApproved / totals.approved : 0,
        avgConfidence: confidence.count ? confidence.sum / confidence.count : null,
        monthlyGeneration: recentMonthlyStats,
      },
      quality: {
        validationPassRate: validationTotals.total ? validationTotals.passed / validationTotals.total : 0,
        confidenceDistribution,
        duplicateRate: totals.total ? duplicateCount / totals.total : 0,
        duplicateCount,
        duplicateGroups: duplicateGroups.length,
        reportedCount: totals.reported,
        quarantinedCount: totals.reported,
      },
      engagement: {
        feedbackRatio: null,
        topReportedCategories,
        successRateByDifficulty: difficultyRates,
        popularQuestions,
      },
      providers: {
        generation: generationProviderStats,
        validation: validationProviderStats,
      },
      systems,
      tasks: {
        active: activeTasks,
        recent: tasks.slice(0, 10),
      },
      alerts,
      categoryDistribution,
    };

    return new Response(
      JSON.stringify({
        success: true,
        stats,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('[getAdminDashboardStats] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stats: null,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-email',
    },
  });
}
