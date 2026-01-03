/**
 * Cloudflare Pages Function - Generate AI Questions
 * Generates quiz questions using OpenAI, Gemini, Anthropic, or Mistral
 */

import { AIProviderFactory } from '../lib/ai-providers/index.js';
import { ensureDatabase } from '../lib/ensureDatabase.js';
import { getProviderSettingsSnapshot } from '../lib/providerSettings.js';
import { ensureCategoriesTable, getCategoryByName } from '../lib/categories.js';
import {
  ensureAudienceTables,
  getAgeGroupById,
  getTargetAudienceDetailsForAgeGroup,
  getTargetAudiencesForAgeGroup
} from '../lib/audiences.js';
import {
  filterQuestionsByRules,
  evaluateQuestionRules,
  resolveFreshnessConfig,
  buildFreshnessPrompt,
  buildAnswerInQuestionPrompt
} from '../lib/questionRules.js';
import { getAiRulesConfig } from '../lib/aiRules.js';
import { resolveFreshnessFields, isExpiredByBestBefore } from '../lib/freshness.js';
import { logProviderCall } from '../lib/providerCallLogs.js';
import {
  getFeedbackInsights,
  getProviderFeedbackScores,
  formatGenerationLearningPrompt,
  formatValidationLearningPrompt,
  getFeedbackExamples,
  recordQuestionFeedback
} from '../lib/questionFeedback.js';

const summarizeProgressText = (value, limit = 120) => {
  if (!value) return '';
  const text = String(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…`;
};

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const requestBody = await request.json();
    const {
      amount,
      category,
      ageGroup,
      difficulty,
      provider,
      generateIllustrations,
      mode,
      taskId: continueTaskId
    } = requestBody || {};
    const userEmail = request.headers.get('x-user-email') || 'anonymous';
    const requestUrl = new URL(request.url);

    if (mode === 'continue') {
      if (env.INTERNAL_TASK_SECRET) {
        const incomingSecret = request.headers.get('x-task-secret');
        if (incomingSecret !== env.INTERNAL_TASK_SECRET) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Not authorized'
          }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      if (!continueTaskId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Missing taskId'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const existingTask = await env.DB.prepare(`
        SELECT payload, status, user_id
        FROM background_tasks
        WHERE id = ?
      `).bind(continueTaskId).first();

      if (!existingTask) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Task not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (existingTask.status && ['completed', 'failed', 'cancelled'].includes(existingTask.status)) {
        return new Response(JSON.stringify({
          success: true,
          taskId: continueTaskId,
          message: 'Task already finished'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const payload = existingTask.payload ? JSON.parse(existingTask.payload) : {};

      context.waitUntil(
        generateQuestionsInBackground(env, continueTaskId, {
          ...payload,
          userEmail: existingTask.user_id || userEmail,
          mode: 'continue',
          origin: payload.origin || requestUrl.origin,
          endpointPath: payload.endpointPath || requestUrl.pathname
        })
      );

      return new Response(JSON.stringify({
        success: true,
        taskId: continueTaskId,
        message: 'AI question generation continues in background'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    if (mode === 'validate') {
      if (env.INTERNAL_TASK_SECRET) {
        const incomingSecret = request.headers.get('x-task-secret');
        if (incomingSecret !== env.INTERNAL_TASK_SECRET) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Not authorized'
          }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      if (!continueTaskId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Missing taskId'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const existingTask = await env.DB.prepare(`
        SELECT payload, status, user_id
        FROM background_tasks
        WHERE id = ?
      `).bind(continueTaskId).first();

      if (!existingTask) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Task not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (existingTask.status && ['completed', 'failed', 'cancelled'].includes(existingTask.status)) {
        return new Response(JSON.stringify({
          success: true,
          taskId: continueTaskId,
          message: 'Task already finished'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const payload = existingTask.payload ? JSON.parse(existingTask.payload) : {};
      context.waitUntil(
        continueValidationInBackground(env, continueTaskId, {
          ...payload,
          userEmail: existingTask.user_id || userEmail,
          origin: payload.origin || requestUrl.origin,
          endpointPath: payload.endpointPath || requestUrl.pathname
        })
      );

      return new Response(JSON.stringify({
        success: true,
        taskId: continueTaskId,
        message: 'AI validation continues in background'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    console.log('[generateAIQuestions] Request:', { 
      amount, category, ageGroup, difficulty, provider, generateIllustrations, userEmail 
    });
    
    // Validate required input
    if (!amount || !provider) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required parameters: amount and provider are required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Validate amount
    if (amount < 1 || amount > 50) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Amount must be between 1 and 50' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Create background task
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    const initialProgress = {
      completed: 0,
      total: amount,
      phase: 'Köad',
      details: {
        targetCount: amount
      }
    };

    const payload = {
      amount,
      category,
      ageGroup,
      difficulty: difficulty || 'medium',
      provider,
      origin: requestUrl.origin,
      endpointPath: requestUrl.pathname
    };
    
    await env.DB.prepare(`
      INSERT INTO background_tasks (
        id, user_id, task_type, status, label,
        payload, progress, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      taskId,
      userEmail,
      'generation',
      'processing',
      'AI-generering',
      JSON.stringify(payload),
      JSON.stringify(initialProgress),
      now,
      now
    ).run();
    
    console.log(`[generateAIQuestions] Created task ${taskId}, starting generation...`);
    
    // Start generation asynchronously using waitUntil
    context.waitUntil(
      generateQuestionsInBackground(env, taskId, {
        amount,
        category,
        ageGroup,
        difficulty: difficulty || 'medium',
        provider,
        userEmail,
        origin: requestUrl.origin,
        endpointPath: requestUrl.pathname
      })
    );
    
    // Return immediately with task ID
    return new Response(JSON.stringify({ 
      success: true,
      taskId,
      message: 'AI question generation started in background'
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('[generateAIQuestions] Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Background generation function
async function generateQuestionsInBackground(env, taskId, params) {
  const safeParseJson = (value, fallback) => {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  };

  const taskRow = await env.DB.prepare(`
    SELECT payload, progress, status, user_id
    FROM background_tasks
    WHERE id = ?
  `).bind(taskId).first();

  if (!taskRow) {
    console.error(`[Task ${taskId}] Task not found`);
    return;
  }

  if (taskRow.status && ['completed', 'failed', 'cancelled'].includes(taskRow.status)) {
    console.warn(`[Task ${taskId}] Task already finished (${taskRow.status})`);
    return;
  }

  const payload = safeParseJson(taskRow.payload, {});
  const progressData = safeParseJson(taskRow.progress, {});
  const existingDetails = progressData.details || {};
  let currentDetails = { ...existingDetails };
  const resolvedParams = {
    amount: payload.amount,
    category: payload.category,
    ageGroup: payload.ageGroup,
    difficulty: payload.difficulty,
    provider: payload.provider,
    origin: payload.origin,
    endpointPath: payload.endpointPath,
    ...params
  };

  const amount = Number(resolvedParams.amount);
  const category = resolvedParams.category;
  const ageGroup = resolvedParams.ageGroup;
  const difficulty = resolvedParams.difficulty || 'medium';
  const provider = resolvedParams.provider;
  const taskUserId = taskRow.user_id || resolvedParams.userEmail || 'system';
  const origin = resolvedParams.origin;
  const endpointPath = resolvedParams.endpointPath;
  const progressEvents = Array.isArray(existingDetails.events)
    ? existingDetails.events.slice(-20)
    : [];
  const EVENT_LIMIT = 20;
  const startedAt = Number.isFinite(existingDetails.startedAt) ? existingDetails.startedAt : Date.now();
  let lastProgressAt = Number.isFinite(existingDetails.heartbeatAt) ? existingDetails.heartbeatAt : startedAt;
  let watchdogInterval = null;
  let watchdogTriggered = false;
  let abortGeneration = false;
  let questionIds = Array.isArray(existingDetails.questionIds)
    ? existingDetails.questionIds.slice()
    : [];
  let savedCount = Number.isFinite(existingDetails.savedCount)
    ? existingDetails.savedCount
    : questionIds.length;
  if (questionIds.length > savedCount) {
    savedCount = questionIds.length;
  }
  let generatedCount = Number.isFinite(existingDetails.generatedCount) ? existingDetails.generatedCount : 0;
  let duplicateCount = Number.isFinite(existingDetails.duplicatesBlocked) ? existingDetails.duplicatesBlocked : 0;
  let ruleFilteredCount = Number.isFinite(existingDetails.ruleFiltered) ? existingDetails.ruleFiltered : 0;
  let generationRounds = Number.isFinite(existingDetails.round) ? existingDetails.round : 0;
  let stalledRounds = Number.isFinite(existingDetails.stalledRounds) ? existingDetails.stalledRounds : 0;
  let providerPickIndex = Number.isFinite(existingDetails.providerPickIndex) ? existingDetails.providerPickIndex : 0;
  const providersUsed = new Set(Array.isArray(existingDetails.providersUsed) ? existingDetails.providersUsed : []);
  const modelsUsed = new Set(Array.isArray(existingDetails.modelsUsed) ? existingDetails.modelsUsed : []);
  const defaultBatchSize = 3;
  const maxRounds = Number.isFinite(existingDetails.maxRounds)
    ? existingDetails.maxRounds
    : Math.max(3, Math.ceil(amount / defaultBatchSize) + 2);
  let lastProgressSnapshot = {
    completed: savedCount,
    total: amount,
    phase: progressData.phase || 'Köad',
    details: existingDetails
  };

  const WATCHDOG_IDLE_MS = 120000;
  const WATCHDOG_TOTAL_MS = Math.max(5 * 60 * 1000, amount * 45000);
  const WATCHDOG_CHECK_INTERVAL_MS = 15000;
  const HEARTBEAT_INTERVAL_MS = 30000;
  const debugState = {
    startedAt,
    lastProvider: existingDetails.provider || null,
    lastProviderStartedAt: null,
    lastProviderDurationMs: null,
    lastProviderError: null,
    lastBatchSize: existingDetails.lastBatchSize || null,
    lastBatchRemaining: existingDetails.lastBatchRemaining || null,
    lastRound: generationRounds
  };

  const pushEvent = (message) => {
    if (!message) return;
    progressEvents.push({ at: Date.now(), message });
    if (progressEvents.length > EVENT_LIMIT) {
      progressEvents.shift();
    }
  };

  const getDebugSnapshot = () => ({
    startedAt,
    lastProgressAt,
    lastProvider: debugState.lastProvider,
    lastProviderStartedAt: debugState.lastProviderStartedAt,
    lastProviderDurationMs: debugState.lastProviderDurationMs,
    lastProviderError: debugState.lastProviderError,
    lastBatchSize: debugState.lastBatchSize,
    lastBatchRemaining: debugState.lastBatchRemaining,
    lastRound: debugState.lastRound,
    watchdogIdleMs: WATCHDOG_IDLE_MS,
    watchdogTotalMs: WATCHDOG_TOTAL_MS
  });

  const updateProgress = async (progressValue, phase, details = {}) => {
    if (abortGeneration) return;
    const now = Date.now();
    lastProgressAt = now;
    const isObject = progressValue && typeof progressValue === 'object';
    const completedValue = isObject ? Number(progressValue.completed) : Number(progressValue);
    const totalValue = isObject ? Number(progressValue.total) : Number(amount);
    const resolvedCompleted = Number.isFinite(completedValue) ? completedValue : 0;
    const resolvedTotal = Number.isFinite(totalValue) && totalValue > 0 ? totalValue : amount;
    const resolvedPhase = phase || (isObject && progressValue.phase ? progressValue.phase : '');
    const mergedDetails = {
      ...currentDetails,
      ...details,
      targetCount: amount,
      startedAt,
      heartbeatAt: now,
      providerPickIndex,
      round: generationRounds,
      stalledRounds,
      maxRounds,
      generatedCount,
      duplicatesBlocked: duplicateCount,
      ruleFiltered: ruleFilteredCount,
      acceptedCount: savedCount,
      savedCount,
      questionIds: [...questionIds],
      providersUsed: Array.from(providersUsed),
      modelsUsed: Array.from(modelsUsed)
    };
    currentDetails = mergedDetails;
    lastProgressSnapshot = {
      completed: resolvedCompleted,
      total: resolvedTotal,
      phase: resolvedPhase,
      details: mergedDetails
    };
    await updateTaskProgress(env.DB, taskId, lastProgressSnapshot, resolvedPhase, {
      ...mergedDetails,
      debug: getDebugSnapshot(),
      events: [...progressEvents],
      lastMessage: progressEvents.length > 0 ? progressEvents[progressEvents.length - 1].message : ''
    });
  };

  const recordProviderCall = async (payload) => {
    try {
      await logProviderCall(env.DB, payload);
    } catch (error) {
      console.warn(`[Task ${taskId}] Failed to log provider call:`, error.message);
    }
  };

  let heartbeatInterval = null;
  const startHeartbeat = () => {
    heartbeatInterval = setInterval(async () => {
      if (abortGeneration || watchdogTriggered) return;
      const now = Date.now();
      if (now - lastProgressAt < HEARTBEAT_INTERVAL_MS) return;
      lastProgressAt = now;
      await updateTaskProgress(env.DB, taskId, lastProgressSnapshot, lastProgressSnapshot.phase, {
        ...currentDetails,
        heartbeatAt: now,
        debug: getDebugSnapshot(),
        events: [...progressEvents],
        lastMessage: progressEvents.length > 0 ? progressEvents[progressEvents.length - 1].message : ''
      });
    }, HEARTBEAT_INTERVAL_MS);
  };

  const stopHeartbeat = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };

  const startWatchdog = () => {
    watchdogInterval = setInterval(async () => {
      if (watchdogTriggered || abortGeneration) return;
      const now = Date.now();
      const idleMs = now - lastProgressAt;
      const totalMs = now - startedAt;
      if (idleMs <= WATCHDOG_IDLE_MS && totalMs <= WATCHDOG_TOTAL_MS) {
        return;
      }
      watchdogTriggered = true;
      abortGeneration = true;
      const reason =
        idleMs > WATCHDOG_IDLE_MS
          ? `Watchdog timeout: ingen aktivitet på ${Math.round(idleMs / 1000)}s`
          : `Watchdog timeout: total tid ${Math.round(totalMs / 1000)}s`;
      console.error(`[Task ${taskId}] ${reason}`);
      pushEvent(reason);
      await updateTaskProgress(env.DB, taskId, lastProgressSnapshot, reason, {
        heartbeatAt: now,
        debug: getDebugSnapshot(),
        watchdog: { idleMs, totalMs }
      });
      await failTask(env.DB, taskId, reason, {
        watchdog: { idleMs, totalMs },
        debug: getDebugSnapshot()
      });
    }, WATCHDOG_CHECK_INTERVAL_MS);
  };

  const stopWatchdog = () => {
    if (watchdogInterval) {
      clearInterval(watchdogInterval);
      watchdogInterval = null;
    }
  };

  const withTimeout = (promise, timeoutMs, label) => new Promise((resolve, reject) => {
    let didTimeout = false;
    const timer = setTimeout(() => {
      didTimeout = true;
      reject(new Error(`${label} timeout efter ${timeoutMs} ms`));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        if (didTimeout) return;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        if (didTimeout) return;
        clearTimeout(timer);
        reject(error);
      });
  });

  const scheduleNextBatch = async () => {
    if (!origin) {
      throw new Error('Kan inte fortsatta: saknar origin för batch');
    }
    const url = new URL(endpointPath || '/api/generateAIQuestions', origin);
    const headers = { 'Content-Type': 'application/json' };
    if (env.INTERNAL_TASK_SECRET) {
      headers['x-task-secret'] = env.INTERNAL_TASK_SECRET;
    }
    await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mode: 'continue',
        taskId
      })
    });
  };

  console.log(`[Task ${taskId}] Params received:`, resolvedParams);
  console.log(`[Task ${taskId}] Destructured values:`, { amount, category, ageGroup, difficulty, provider });

  if (!Number.isFinite(amount) || amount <= 0) {
    await failTask(env.DB, taskId, 'Ogiltigt antal frågor');
    return;
  }

  if (!provider) {
    await failTask(env.DB, taskId, 'Ingen provider angiven');
    return;
  }

  let effectiveProvider = provider.toLowerCase();
  let selectedProvider = null;
  let lastError = null;

  try {
    startHeartbeat();
    startWatchdog();
    pushEvent(generationRounds === 0 ? 'Startar generering' : 'Fortsätter generering');
    await updateProgress({ completed: savedCount, total: amount }, `Genererar ${savedCount}/${amount}`, {
      targetCount: amount,
      provider: effectiveProvider,
      model: selectedProvider?.model || null
    });

    await ensureDatabase(env.DB);
    await ensureCategoriesTable(env.DB);
    await ensureAudienceTables(env.DB);

    const rulesConfig = await getAiRulesConfig(env.DB);
    const ageGroupDetails = ageGroup ? await getAgeGroupById(env.DB, ageGroup) : null;
    const targetAudienceDetails = ageGroup
      ? await getTargetAudienceDetailsForAgeGroup(env.DB, ageGroup)
      : [];
    const targetAudiences = ageGroup
      ? await getTargetAudiencesForAgeGroup(env.DB, ageGroup)
      : [];
    if (ageGroup && !ageGroupDetails) {
      console.warn(`[Task ${taskId}] Age group '${ageGroup}' not found in settings, using defaults.`);
    }
    const effectiveTargetAudiences = targetAudiences.length > 0 ? targetAudiences : ['swedish'];
    const targetAudience = effectiveTargetAudiences[0];
    const freshnessConfig = resolveFreshnessConfig(rulesConfig, targetAudience);
    const freshnessPrompt = buildFreshnessPrompt(freshnessConfig, { ageGroup });
    const answerInQuestionPrompt = buildAnswerInQuestionPrompt(rulesConfig?.global?.answerInQuestion);
    const feedbackInsights = await getFeedbackInsights(env.DB, {
      feedbackType: 'question',
      category,
      ageGroup,
      difficulty,
      targetAudience
    });
    const feedbackExamples = {
      good: await getFeedbackExamples(env.DB, {
        feedbackType: 'question',
        category,
        ageGroup,
        difficulty,
        targetAudience
      }, { minRating: 4, limit: 2 }),
      bad: await getFeedbackExamples(env.DB, {
        feedbackType: 'question',
        category,
        ageGroup,
        difficulty,
        targetAudience
      }, { maxRating: 2, limit: 1, order: 'asc' })
    };
    const feedbackPrompt = formatGenerationLearningPrompt(feedbackInsights, feedbackExamples);

    const categoryDetails = category ? await getCategoryByName(env.DB, category) : null;
    if (category && !categoryDetails) {
      console.warn(`[Task ${taskId}] Category '${category}' not found in settings, using default prompt.`);
    }

    const { providerMap } = await getProviderSettingsSnapshot(env, { decryptKeys: true });
    const factory = new AIProviderFactory(env, providerMap);
    const availableProviders = factory.getAvailableProviders('generation');
    const providerScores = await getProviderFeedbackScores(env.DB, {
      feedbackType: 'question',
      category,
      ageGroup,
      difficulty,
      targetAudience
    });
    const preferredProvider = provider.toLowerCase();
    const providerCycle = (() => {
      if (availableProviders.length === 0) {
        return [];
      }
      if (preferredProvider !== 'random' && availableProviders.includes(preferredProvider)) {
        return [
          preferredProvider,
          ...availableProviders.filter((name) => name !== preferredProvider)
        ];
      }
      return [...availableProviders];
    })();

    const pickProviderName = () => {
      if (providerCycle.length === 0) {
        throw new Error('No AI providers are configured');
      }
      const pickWeighted = () => {
        const weights = providerCycle.map((name) => {
          const score = providerScores.get(name)?.avgRating;
          return Number.isFinite(score) ? Math.max(score, 1) : 3;
        });
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        let roll = Math.random() * total;
        for (let i = 0; i < providerCycle.length; i += 1) {
          roll -= weights[i];
          if (roll <= 0) {
            return providerCycle[i];
          }
        }
        return providerCycle[0];
      };
      const chosen = preferredProvider === 'random'
        ? (providerScores.size > 0 ? pickWeighted() : providerCycle[Math.floor(Math.random() * providerCycle.length)])
        : providerCycle[providerPickIndex % providerCycle.length];
      providerPickIndex += 1;
      return chosen;
    };

    const resolveBatchLimit = (providerName, providerInstance) => {
      const providerConfig = providerMap?.[providerName] || {};
      const configuredLimit = Number(providerConfig.maxQuestionsPerRequest);
      if (Number.isFinite(configuredLimit) && configuredLimit > 0) {
        return configuredLimit;
      }
      return defaultBatchSize;
    };

    const generateBatch = async (batchAmount, primaryProvider, primaryInstance, currentRound) => {
      const providerQueue = [
        primaryProvider,
        ...availableProviders.filter((name) => name !== primaryProvider)
      ];

      while (providerQueue.length > 0) {
        if (abortGeneration) {
          throw new Error('Generation avbruten av watchdog');
        }
        const nextProvider = providerQueue.shift();
        let providerInstance = primaryInstance;

        if (nextProvider !== primaryProvider || !providerInstance) {
          try {
            providerInstance = factory.getProvider(nextProvider);
          } catch (error) {
            lastError = error;
            console.warn(`[Task ${taskId}] Failed to load provider ${nextProvider}:`, error.message);
            continue;
          }
        }

        effectiveProvider = nextProvider;
        selectedProvider = providerInstance;

        const batchLimit = resolveBatchLimit(nextProvider, providerInstance);
        const requestAmount = Math.min(batchAmount, batchLimit);
        debugState.lastProvider = nextProvider;
        debugState.lastBatchSize = requestAmount;
        debugState.lastBatchRemaining = batchAmount;
        debugState.lastProviderStartedAt = Date.now();
        debugState.lastProviderDurationMs = null;
        debugState.lastProviderError = null;
        const debugCapture = { request: null, response: null, error: null };
        const onDebug = (entry) => {
          if (!entry) return;
          if (entry.stage === 'request') {
            debugCapture.request = entry.payload;
          } else if (entry.stage === 'response') {
            debugCapture.response = entry.payload;
          } else if (entry.stage === 'error') {
            debugCapture.error = entry.error;
          }
        };

        try {
          if (nextProvider !== primaryProvider) {
            pushEvent(`Byter provider till ${nextProvider}`);
          }
          pushEvent(`Startar provider ${nextProvider} (${requestAmount})`);
          console.log(`[Task ${taskId}] Provider ${nextProvider} generating ${requestAmount} questions`);
          const startedAtProvider = Date.now();
          const batchQuestions = await withTimeout(providerInstance.generateQuestions({
            amount: requestAmount,
            category,
            categoryDetails,
            ageGroupDetails,
            ageGroup,
            difficulty,
            targetAudience,
            targetAudiences: effectiveTargetAudiences,
            targetAudienceDetails,
            freshnessPrompt,
            answerInQuestionPrompt,
            feedbackPrompt,
            language: 'sv',
            timeoutMs: 60000,
            onDebug
          }), 65000, `${nextProvider} generering`);
          debugState.lastProviderDurationMs = Date.now() - startedAtProvider;
          pushEvent(`Provider ${nextProvider} klar (${debugState.lastProviderDurationMs} ms)`);
          await recordProviderCall({
            taskId,
            userId: taskUserId,
            phase: 'generation',
            provider: nextProvider,
            model: providerInstance?.model || null,
            status: 'success',
            requestPayload: debugCapture.request,
            responsePayload: debugCapture.response,
            durationMs: debugState.lastProviderDurationMs,
            metadata: {
              batchAmount: requestAmount,
              remaining: batchAmount,
              round: currentRound,
              category,
              ageGroup,
              difficulty
            }
          });
          providersUsed.add(effectiveProvider);
          if (providerInstance?.model) {
            modelsUsed.add(providerInstance.model);
          }
          return (batchQuestions || []).map((question) => ({
            ...question,
            generationProvider: effectiveProvider,
            generationModel: providerInstance?.model || null
          }));
        } catch (providerError) {
          lastError = providerError;
          debugState.lastProviderDurationMs = Date.now() - debugState.lastProviderStartedAt;
          debugState.lastProviderError = providerError.message;
          console.warn(`[Task ${taskId}] ${effectiveProvider} failed:`, providerError.message);
          pushEvent(`Provider ${effectiveProvider} fel: ${summarizeProgressText(providerError.message, 80)}`);
          await recordProviderCall({
            taskId,
            userId: taskUserId,
            phase: 'generation',
            provider: nextProvider,
            model: providerInstance?.model || null,
            status: 'error',
            requestPayload: debugCapture.request,
            responsePayload: debugCapture.response,
            error: providerError.message || debugCapture.error,
            durationMs: debugState.lastProviderDurationMs,
            metadata: {
              batchAmount: requestAmount,
              remaining: batchAmount,
              round: currentRound,
              category,
              ageGroup,
              difficulty
            }
          });
        }
      }
      throw new Error(`All providers failed. Last error: ${lastError ? lastError.message : 'Unknown'}`);
    };

    if (savedCount >= amount) {
      pushEvent('Klar med generering');
    }

    const remaining = Math.max(0, amount - savedCount);
    if (remaining === 0) {
      await updateProgress({ completed: savedCount, total: amount }, 'Klar med generering', {
        provider: effectiveProvider,
        model: selectedProvider?.model || null,
        generatedCount,
        duplicatesBlocked: duplicateCount,
        ruleFiltered: ruleFilteredCount,
        remaining
      });
    } else {
      const currentRound = generationRounds + 1;
      const primaryProvider = pickProviderName();
      selectedProvider = factory.getProvider(primaryProvider);
      effectiveProvider = primaryProvider;
      const batchLimit = resolveBatchLimit(primaryProvider, selectedProvider);
      const batchAmount = Math.min(remaining, batchLimit);
      debugState.lastRound = currentRound;
      pushEvent(`Provider vald: ${effectiveProvider}`);
      pushEvent(`Genererar batch ${currentRound}/${maxRounds} (${remaining} kvar)`);
      await updateProgress({
        completed: Math.min(savedCount, amount),
        total: amount
      }, `Genererar ${Math.min(savedCount, amount)}/${amount}`, {
        provider: effectiveProvider,
        model: selectedProvider?.model || null,
        round: currentRound,
        remaining,
        generatedCount,
        acceptedCount: savedCount
      });

      const batchQuestions = await generateBatch(batchAmount, primaryProvider, selectedProvider, currentRound);
      generationRounds = currentRound;
      generatedCount += batchQuestions.length;

      if (batchQuestions.length === 0) {
        stalledRounds += 1;
      } else {
        const duplicateResult = await filterDuplicatesBeforeSaving(env.DB, batchQuestions);
        duplicateCount += duplicateResult.duplicateCount;

        const { acceptedQuestions: batchAccepted, rejectedQuestions } = filterQuestionsByRules(
          duplicateResult.uniqueQuestions,
          {
            ageGroup,
            difficulty,
            category,
            targetAudience
          },
          rulesConfig
        );

        if (rejectedQuestions.length > 0) {
          console.warn(`[Task ${taskId}] Rule-filtered ${rejectedQuestions.length} questions for age group ${ageGroup || 'unknown'}`);
        }

        ruleFilteredCount += rejectedQuestions.length;

        if (batchAccepted.length === 0) {
          stalledRounds += 1;
        } else {
          stalledRounds = 0;
          pushEvent(`Sparar ${savedCount}/${amount}`);
          await updateProgress({ completed: savedCount, total: amount }, `Sparar ${savedCount}/${amount}`, {
            provider: effectiveProvider,
            model: selectedProvider?.model || null,
            generatedCount,
            duplicatesBlocked: duplicateCount,
            ruleFiltered: ruleFilteredCount,
            acceptedCount: savedCount
          });

          const saveResult = await saveQuestionsToDatabase(env.DB, batchAccepted, {
            category,
            difficulty,
            provider: effectiveProvider,
            model: selectedProvider?.model || null,
            ageGroup,
            targetAudience,
            freshnessConfig
          }, {
            onProgress: async ({ savedCount: savedBatchCount, errorCount, lastQuestionId, lastQuestionText }) => {
              pushEvent(`Sparade ${savedCount + savedBatchCount}/${amount}`);
              await updateProgress({
                completed: savedCount + savedBatchCount,
                total: amount
              }, `Sparar ${savedCount + savedBatchCount}/${amount}`, {
                provider: effectiveProvider,
                model: selectedProvider?.model || null,
                generatedCount,
                duplicatesBlocked: duplicateCount,
                ruleFiltered: ruleFilteredCount,
                acceptedCount: savedCount + savedBatchCount,
                savedCount: savedCount + savedBatchCount,
                errorCount,
                lastSavedQuestionId: lastQuestionId || null,
                lastSavedQuestion: summarizeProgressText(lastQuestionText)
              });
            }
          });

          const { savedQuestions } = saveResult;
          savedCount += savedQuestions.length;
          questionIds = [...questionIds, ...savedQuestions.map((question) => question.id)];
        }
      }
    }

    if (abortGeneration) {
      return;
    }

    const remainingAfterSave = Math.max(0, amount - savedCount);
    const shouldContinue = remainingAfterSave > 0
      && generationRounds < maxRounds
      && stalledRounds < 2;

    await updateProgress({
      completed: Math.min(savedCount, amount),
      total: amount
    }, `Genererar ${Math.min(savedCount, amount)}/${amount}`, {
      provider: effectiveProvider,
      model: selectedProvider?.model || null,
      round: generationRounds,
      remaining: remainingAfterSave,
      generatedCount,
      duplicatesBlocked: duplicateCount,
      ruleFiltered: ruleFilteredCount,
      acceptedCount: savedCount,
      savedCount
    });

    if (shouldContinue) {
      pushEvent('Schemalägger nästa batch');
      await updateProgress({
        completed: Math.min(savedCount, amount),
        total: amount
      }, `Genererar ${Math.min(savedCount, amount)}/${amount}`, {
        provider: effectiveProvider,
        model: selectedProvider?.model || null,
        round: generationRounds,
        remaining: remainingAfterSave,
        generatedCount,
        duplicatesBlocked: duplicateCount,
        ruleFiltered: ruleFilteredCount,
        acceptedCount: savedCount,
        savedCount
      });

      await scheduleNextBatch();
      return;
    }

    const savedQuestions = await loadQuestionsByIds(env.DB, questionIds);
    const resolvedQuestionIds = questionIds.length > 0
      ? questionIds
      : savedQuestions.map((question) => question.id);
    const resolvedSavedCount = Math.max(savedQuestions.length, savedCount);
    const shortfall = Math.max(0, amount - resolvedSavedCount);
    const generatorProviders = Array.from(providersUsed);
    const primaryProvider = generatorProviders[0] || effectiveProvider;
    const validationCandidates = factory.getAvailableProviders('validation');
    const validationProvider = validationCandidates[0] || null;
    const canValidateAny = savedQuestions.some((question) => {
      const generator = String(question.provider || '').toLowerCase();
      return validationCandidates.some((name) => name !== generator);
    });
    const shouldRunValidation = savedQuestions.length > 0
      && validationCandidates.length > 0
      && canValidateAny;

    pushEvent('Klar med generering');
    await updateProgress({
      completed: resolvedSavedCount,
      total: amount
    }, 'Klar med generering', {
      provider: effectiveProvider,
      model: selectedProvider?.model || null,
      generatedCount,
      duplicatesBlocked: duplicateCount,
      ruleFiltered: ruleFilteredCount,
      acceptedCount: resolvedSavedCount,
      savedCount: resolvedSavedCount,
      shortfall
    });

    await completeTask(env.DB, taskId, {
      success: true,
      questionsGenerated: resolvedSavedCount,
      provider: primaryProvider,
      model: modelsUsed.size === 1 ? Array.from(modelsUsed)[0] : null,
      providersUsed: generatorProviders,
      modelsUsed: Array.from(modelsUsed),
      requestedCount: amount,
      generatedCount,
      savedCount: resolvedSavedCount,
      duplicatesBlocked: duplicateCount,
      ruleFiltered: ruleFilteredCount,
      generationRounds,
      shortfall,
      questionIds: resolvedQuestionIds,
      questions: savedQuestions,
      validationInfo: {
        requestedCount: amount,
        totalGenerated: generatedCount,
        totalSaved: resolvedSavedCount,
        duplicates: duplicateCount,
        ruleFiltered: ruleFilteredCount,
        validatedCount: 0,
        invalidCount: 0,
        skippedCount: resolvedSavedCount,
        validationProvider: validationProvider,
        generatorProviders,
        note: shouldRunValidation
          ? 'Validation will run in separate background task'
          : 'Validation skipped (no alternative providers per question)'
      }
    });

    if (shouldRunValidation) {
      const validationTaskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_validation`;

      await env.DB.prepare(`
        INSERT INTO background_tasks (
          id, user_id, task_type, status, label, description,
          payload, progress, created_at, updated_at, started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        validationTaskId,
        taskUserId,
        'validate_questions',
        'running',
        'AI-validering',
        `Validerar ${resolvedSavedCount} genererade frågor med AI`,
        JSON.stringify({
          questionIds: resolvedQuestionIds,
          generatorProviders,
          validationProvider,
          category,
          ageGroup,
          difficulty,
          targetAudience,
          origin: resolvedParams.origin,
          endpointPath: resolvedParams.endpointPath
        }),
        JSON.stringify({
          completed: 0,
          total: resolvedSavedCount,
          phase: 'Startar validering',
          details: {
            totalCount: resolvedSavedCount,
            validatedCount: 0,
            invalidCount: 0,
            skippedCount: 0,
            correctedCount: 0
          }
        }),
        Date.now(),
        Date.now(),
        Date.now()
      ).run();

      try {
        await scheduleValidationContinuation(env, validationTaskId, resolvedParams.origin, resolvedParams.endpointPath);
      } catch (validationError) {
        console.error(`[Task ${taskId}] Validation scheduling failed:`, validationError);
      }
    }
  } catch (error) {
    if (watchdogTriggered) {
      console.error(`[Task ${taskId}] Aborted by watchdog:`, error?.message || error);
      return;
    }
    console.error(`[Task ${taskId}] Failed:`, error);
    await failTask(env.DB, taskId, error.message, {
      debug: getDebugSnapshot()
    });
  } finally {
    stopWatchdog();
    stopHeartbeat();
  }
}

async function scheduleValidationContinuation(env, taskId, origin, endpointPath) {
  if (!origin) {
    throw new Error('Kan inte fortsätta: saknar origin för validering');
  }
  const url = new URL(endpointPath || '/api/generateAIQuestions', origin);
  const headers = { 'Content-Type': 'application/json' };
  if (env.INTERNAL_TASK_SECRET) {
    headers['x-task-secret'] = env.INTERNAL_TASK_SECRET;
  }
  await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mode: 'validate',
      taskId
    })
  });
}

async function continueValidationInBackground(env, taskId, params = {}) {
  const safeParseJson = (value, fallback) => {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  };
  const taskRow = await env.DB.prepare(`
    SELECT payload, progress, status, user_id
    FROM background_tasks
    WHERE id = ?
  `).bind(taskId).first();

  if (!taskRow) {
    console.error(`[Validation ${taskId}] Task not found`);
    return;
  }

  if (taskRow.status && ['completed', 'failed', 'cancelled'].includes(taskRow.status)) {
    console.warn(`[Validation ${taskId}] Task already finished (${taskRow.status})`);
    return;
  }

  const payload = safeParseJson(taskRow.payload, {});
  const progressData = safeParseJson(taskRow.progress, {});
  const details = progressData.details || {};
  const questionIds = Array.isArray(payload.questionIds) ? payload.questionIds : [];
  const totalCount = questionIds.length;
  const validatedCount = Number.isFinite(details.validatedCount) ? details.validatedCount : 0;
  const invalidCount = Number.isFinite(details.invalidCount) ? details.invalidCount : 0;
  const skippedCount = Number.isFinite(details.skippedCount) ? details.skippedCount : 0;
  const correctedCount = Number.isFinite(details.correctedCount) ? details.correctedCount : 0;
  const processedCount = validatedCount + invalidCount + skippedCount;
  const nextIndex = Number.isFinite(details.nextIndex)
    ? details.nextIndex
    : Math.min(processedCount, totalCount);
  const taskUserId = taskRow.user_id || params.userEmail || 'system';
  const origin = payload.origin || params.origin;
  const endpointPath = payload.endpointPath || params.endpointPath;
  const validationDebug = {
    startedAt: Number.isFinite(details.startedAt) ? details.startedAt : Date.now(),
    watchdogIdleMs: 5 * 60 * 1000,
    watchdogTotalMs: 30 * 60 * 1000
  };

  const updateValidationProgress = async (phase, extraDetails = {}) => {
    const now = Date.now();
    const mergedDetails = {
      ...details,
      ...extraDetails,
      totalCount,
      validatedCount: extraDetails.validatedCount ?? validatedCount,
      invalidCount: extraDetails.invalidCount ?? invalidCount,
      skippedCount: extraDetails.skippedCount ?? skippedCount,
      correctedCount: extraDetails.correctedCount ?? correctedCount,
      nextIndex: extraDetails.nextIndex ?? nextIndex,
      startedAt: validationDebug.startedAt
    };
    const completed = Math.min(
      (mergedDetails.validatedCount || 0) +
      (mergedDetails.invalidCount || 0) +
      (mergedDetails.skippedCount || 0),
      totalCount
    );
    await updateTaskProgress(env.DB, taskId, {
      completed,
      total: totalCount,
      phase
    }, phase, {
      ...mergedDetails,
      heartbeatAt: now,
      debug: validationDebug,
      lastMessage: phase
    });
  };

  if (totalCount === 0) {
    await failTask(env.DB, taskId, 'Inga frågor att validera', {
      debug: validationDebug
    });
    return;
  }

  if (nextIndex >= totalCount) {
    await completeTask(env.DB, taskId, {
      success: true,
      totalCount,
      validatedCount,
      invalidCount,
      skippedCount,
      correctedCount,
      validationProvider: payload.validationProvider || null,
      validationProvidersUsed: Array.isArray(details.validationProvidersUsed) ? details.validationProvidersUsed : [],
      generatorProviders: payload.generatorProviders || []
    });
    return;
  }

  const throttleMs = Number.isFinite(payload?.validationThrottleMs)
    ? Number(payload.validationThrottleMs)
    : 0;
  const lastValidationAt = Number.isFinite(details.lastValidationAt) ? details.lastValidationAt : 0;
  const now = Date.now();
  const nextValidationAt = lastValidationAt > 0 ? lastValidationAt + throttleMs : now;
  if (now < nextValidationAt) {
    await updateValidationProgress(`Väntar ${Math.round((nextValidationAt - now) / 1000)}s`, {
      lastValidationAt,
      nextValidationAt
    });
    return;
  }

  await ensureDatabase(env.DB);
  await ensureAudienceTables(env.DB);
  const rulesConfig = await getAiRulesConfig(env.DB);
  const targetAudience = payload.targetAudience || null;
  const freshnessConfig = resolveFreshnessConfig(rulesConfig, targetAudience);
  const freshnessPrompt = buildFreshnessPrompt(freshnessConfig, { ageGroup: payload.ageGroup });
  const answerInQuestionPrompt = buildAnswerInQuestionPrompt(rulesConfig?.global?.answerInQuestion);
  const validationFeedbackInsights = await getFeedbackInsights(env.DB, {
    feedbackType: 'validation',
    category: payload.category,
    ageGroup: payload.ageGroup,
    difficulty: payload.difficulty,
    targetAudience
  });
  const validationFeedbackPrompt = formatValidationLearningPrompt(validationFeedbackInsights);
  const validationProviderScores = await getProviderFeedbackScores(env.DB, {
    feedbackType: 'validation',
    category: payload.category,
    ageGroup: payload.ageGroup,
    difficulty: payload.difficulty,
    targetAudience
  });

  const currentQuestionId = questionIds[nextIndex];
  const currentQuestion = currentQuestionId
    ? (await loadQuestionsByIds(env.DB, [currentQuestionId]))[0]
    : null;

  if (!currentQuestion) {
    const updatedSkipped = skippedCount + 1;
    const updatedNextIndex = Math.min(nextIndex + 1, totalCount);
    await updateValidationProgress(`Validerar ${updatedNextIndex}/${totalCount}`, {
      skippedCount: updatedSkipped,
      nextIndex: updatedNextIndex,
      lastValidationAt: Date.now(),
      nextValidationAt: Date.now() + throttleMs
    });
    await scheduleValidationContinuation(env, taskId, origin, endpointPath);
    return;
  }

  const { providerMap } = await getProviderSettingsSnapshot(env, { decryptKeys: true });
  const factory = new AIProviderFactory(env, providerMap);
  const validationContext = {
    taskId,
    category: payload.category,
    ageGroup: payload.ageGroup,
    difficulty: payload.difficulty,
    validationProvider: payload.validationProvider || null,
    targetAudience: payload.targetAudience || null,
    taskUserId,
    rulesConfig,
    freshnessConfig,
    freshnessPrompt,
    answerInQuestionPrompt,
    validationFeedbackPrompt,
    validationProviderScores,
    validationThrottleMs: 0,
    lastValidationAt: 0,
    onProgress: async ({ validatedCount: stepValidated, invalidCount: stepInvalid, skippedCount: stepSkipped, correctedCount: stepCorrected, provider, questionId, questionPreview, step, phase }) => {
      await updateValidationProgress(phase || `Validerar ${nextIndex + 1}/${totalCount}`, {
        validatedCount: validatedCount + (stepValidated || 0),
        invalidCount: invalidCount + (stepInvalid || 0),
        skippedCount: skippedCount + (stepSkipped || 0),
        correctedCount: correctedCount + (stepCorrected || 0),
        provider: provider || payload.validationProvider || null,
        currentQuestionId: questionId || currentQuestionId,
        currentQuestion: questionPreview || currentQuestion.question_sv,
        step: step || null
      });
    }
  };

  const validationResult = await validateUniqueQuestions(
    env.DB,
    factory,
    [currentQuestion],
    payload.generatorProviders || [],
    validationContext
  );

  const updatedValidated = validatedCount + validationResult.validatedCount;
  const updatedInvalid = invalidCount + validationResult.invalidCount;
  const updatedSkipped = skippedCount + validationResult.skippedCount;
  const updatedCorrected = correctedCount + validationResult.correctedCount;
  const updatedNextIndex = Math.min(nextIndex + 1, totalCount);
  const updatedLastValidationAt = Date.now();

  await updateValidationProgress(`Validerar ${updatedNextIndex}/${totalCount}`, {
    validatedCount: updatedValidated,
    invalidCount: updatedInvalid,
    skippedCount: updatedSkipped,
    correctedCount: updatedCorrected,
    nextIndex: updatedNextIndex,
    lastValidationAt: updatedLastValidationAt,
    nextValidationAt: updatedLastValidationAt + throttleMs,
    provider: validationResult.validationProvider || payload.validationProvider || null,
    validationProvidersUsed: validationResult.validationProvidersUsed || []
  });

  if (updatedNextIndex >= totalCount) {
    await completeTask(env.DB, taskId, {
      success: true,
      totalCount,
      validatedCount: updatedValidated,
      invalidCount: updatedInvalid,
      skippedCount: updatedSkipped,
      correctedCount: updatedCorrected,
      validationProvider: validationResult.validationProvider || payload.validationProvider || null,
      validationProvidersUsed: validationResult.validationProvidersUsed || [],
      generatorProviders: payload.generatorProviders || []
    });
    return;
  }

  await scheduleValidationContinuation(env, taskId, origin, endpointPath);
}

async function loadQuestionsByIds(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.prepare(`
    SELECT
      id,
      question_sv,
      question_en,
      options_sv,
      options_en,
      correct_option,
      explanation_sv,
      explanation_en,
      background_sv,
      background_en,
      illustration_emoji,
      categories,
      difficulty,
      age_groups,
      target_audience,
      time_sensitive,
      best_before_at,
      quarantined,
      quarantined_at,
      quarantine_reason,
      created_at,
      updated_at,
      created_by,
      ai_generation_provider,
      ai_generation_model,
      validated
    FROM questions
    WHERE id IN (${placeholders})
  `).bind(...ids).all();

  const parseJsonArray = (value) => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  };

  return (rows.results || []).map((row) => {
    const categories = parseJsonArray(row.categories);
    const ageGroups = parseJsonArray(row.age_groups);
    return {
      id: row.id,
      question_sv: row.question_sv,
      question_en: row.question_en,
      options_sv: parseJsonArray(row.options_sv),
      options_en: parseJsonArray(row.options_en),
      correctOption: row.correct_option,
      explanation_sv: row.explanation_sv || '',
      explanation_en: row.explanation_en || '',
      background_sv: row.background_sv || '',
      background_en: row.background_en || '',
      emoji: row.illustration_emoji || '❓',
      category: categories[0] || null,
      difficulty: row.difficulty,
      ageGroup: ageGroups[0] || null,
      targetAudience: row.target_audience,
      timeSensitive: row.time_sensitive === 1,
      bestBeforeAt: row.best_before_at || null,
      quarantined: row.quarantined === 1,
      quarantinedAt: row.quarantined_at || null,
      quarantineReason: row.quarantine_reason || null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      createdBy: row.created_by,
      aiGenerated: true,
      validated: row.validated === 1,
      provider: row.ai_generation_provider,
      model: row.ai_generation_model
    };
  });
}

/**
 * Validate questions in background
 */
async function validateQuestionsInBackground(env, taskId, questions, generatorProvider, metadata = {}, rulesConfig = null) {
  const progressEvents = [];
  if (!metadata || typeof metadata !== 'object') {
    metadata = {};
  }
  if (!metadata.taskId) {
    metadata.taskId = taskId;
  }
  const VALIDATION_WATCHDOG_IDLE_MS = 5 * 60 * 1000;
  const VALIDATION_WATCHDOG_TOTAL_MS = 30 * 60 * 1000;
  const validationDebug = {
    startedAt: Date.now(),
    watchdogIdleMs: VALIDATION_WATCHDOG_IDLE_MS,
    watchdogTotalMs: VALIDATION_WATCHDOG_TOTAL_MS
  };
  let lastProgressSnapshot = {
    completed: 0,
    total: questions.length,
    phase: 'Startar validering',
    details: {}
  };
  let lastProgressAt = Date.now();
  let heartbeatInterval = null;
  const HEARTBEAT_INTERVAL_MS = 30000;

  const pushEvent = (message) => {
    if (!message) return;
    progressEvents.push({ at: Date.now(), message });
    if (progressEvents.length > 6) {
      progressEvents.shift();
    }
  };

  const updateProgress = async (progressValue, phase, details = {}) => {
    const now = Date.now();
    const isObject = progressValue && typeof progressValue === 'object';
    const completedValue = isObject ? Number(progressValue.completed) : Number(progressValue);
    const totalValue = isObject ? Number(progressValue.total) : Number(questions.length);
    const resolvedCompleted = Number.isFinite(completedValue) ? completedValue : 0;
    const resolvedTotal = Number.isFinite(totalValue) && totalValue > 0 ? totalValue : questions.length;
    const resolvedPhase = phase || (isObject && progressValue.phase ? progressValue.phase : '');
    lastProgressSnapshot = {
      completed: resolvedCompleted,
      total: resolvedTotal,
      phase: resolvedPhase,
      details: {
        ...(isObject && progressValue.details ? progressValue.details : {}),
        ...details
      }
    };
    lastProgressAt = now;
    await updateTaskProgress(env.DB, taskId, lastProgressSnapshot, resolvedPhase, {
      ...details,
      heartbeatAt: now,
      debug: validationDebug,
      events: [...progressEvents],
      lastMessage: progressEvents.length > 0 ? progressEvents[progressEvents.length - 1].message : ''
    });
  };

  const startHeartbeat = () => {
    heartbeatInterval = setInterval(async () => {
      const now = Date.now();
      if (now - lastProgressAt < HEARTBEAT_INTERVAL_MS) {
        return;
      }
      await updateTaskProgress(env.DB, taskId, lastProgressSnapshot, lastProgressSnapshot.phase, {
        ...(lastProgressSnapshot.details || {}),
        heartbeatAt: now,
        debug: validationDebug,
        events: [...progressEvents],
        lastMessage: progressEvents.length > 0 ? progressEvents[progressEvents.length - 1].message : ''
      });
    }, HEARTBEAT_INTERVAL_MS);
  };

  const stopHeartbeat = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };

  try {
    startHeartbeat();
    console.log(`[Validation ${taskId}] Starting validation of ${questions.length} questions`);
    pushEvent(`Startar validering (${questions.length} frågor)`);
    
    // Ensure database is initialized (background tasks bypass middleware)
    const { ensureDatabase } = await import('../lib/ensureDatabase.js');
    await ensureDatabase(env.DB);
    console.log(`[Validation ${taskId}] Database initialized`);
    
    if (!rulesConfig) {
      rulesConfig = await getAiRulesConfig(env.DB);
    }
    const freshnessConfig = resolveFreshnessConfig(rulesConfig, metadata.targetAudience);
    const freshnessPrompt = buildFreshnessPrompt(freshnessConfig, { ageGroup: metadata.ageGroup });
    const answerInQuestionPrompt = buildAnswerInQuestionPrompt(rulesConfig?.global?.answerInQuestion);
    const validationFeedbackInsights = await getFeedbackInsights(env.DB, {
      feedbackType: 'validation',
      category: metadata.category,
      ageGroup: metadata.ageGroup,
      difficulty: metadata.difficulty,
      targetAudience: metadata.targetAudience
    });
    const validationFeedbackPrompt = formatValidationLearningPrompt(validationFeedbackInsights);
    const validationProviderScores = await getProviderFeedbackScores(env.DB, {
      feedbackType: 'validation',
      category: metadata.category,
      ageGroup: metadata.ageGroup,
      difficulty: metadata.difficulty,
      targetAudience: metadata.targetAudience
    });

    // Create factory inside background task (can't pass objects through fire-and-forget)
    const { providerMap } = await getProviderSettingsSnapshot(env, { decryptKeys: true });
    const factory = new AIProviderFactory(env, providerMap);
    console.log(`[Validation ${taskId}] Factory created`);
    
    // Fetch task payload to get metadata if not provided
    if (!metadata.category || !metadata.ageGroup || !metadata.difficulty || !metadata.validationProvider) {
      console.log(`[Validation ${taskId}] Metadata incomplete, fetching from task payload...`);
      const task = await env.DB.prepare(`SELECT payload, user_id FROM background_tasks WHERE id = ?`).bind(taskId).first();
      if (task && task.payload) {
        const payload = JSON.parse(task.payload);
        metadata = {
          category: payload.category || metadata.category,
          ageGroup: payload.ageGroup || metadata.ageGroup,
          difficulty: payload.difficulty || metadata.difficulty,
          validationProvider: payload.validationProvider || metadata.validationProvider,
          targetAudience: payload.targetAudience || metadata.targetAudience,
          taskUserId: metadata.taskUserId || task.user_id || null
        };
        console.log(`[Validation ${taskId}] Metadata from payload:`, metadata);
      }
    }
    
    console.log(`[Validation ${taskId}] Final metadata:`, metadata);
    
    const totalCount = questions.length;

    // Update progress to show we're starting
    try {
      pushEvent('Förbereder validering');
      await updateProgress({ completed: 0, total: totalCount }, 'Förbereder validering', {
        totalCount,
        validatedCount: 0,
        invalidCount: 0,
        skippedCount: 0,
        correctedCount: 0
      });
      console.log(`[Validation ${taskId}] Progress updated`);
    } catch (progressError) {
      console.error(`[Validation ${taskId}] Failed to update progress:`, progressError);
      throw progressError;
    }
    
    // Run validation
    let validationResult;
    try {
      console.log(`[Validation ${taskId}] Calling validateUniqueQuestions...`);
      console.log(`[Validation ${taskId}] Parameters:`, {
        questionsCount: questions.length,
        generatorProvider,
        metadata
      });
      
      validationResult = await validateUniqueQuestions(
        env.DB,
        factory,
        questions,
        generatorProvider,
        {
          taskId,
          category: metadata.category,
          ageGroup: metadata.ageGroup,
          difficulty: metadata.difficulty,
          validationProvider: metadata.validationProvider,
          targetAudience: metadata.targetAudience,
          taskUserId: metadata.taskUserId || null,
          rulesConfig,
          freshnessConfig,
          freshnessPrompt,
          answerInQuestionPrompt,
          validationFeedbackPrompt,
          validationProviderScores,
          totalCount,
          autoCorrectionEnabled: rulesConfig?.global?.autoCorrection?.enabled === true,
          onProgress: async ({ index, validatedCount, invalidCount, skippedCount, correctedCount, provider, questionId, questionPreview, step, phase }) => {
            const resolvedIndex = Number.isFinite(index) ? index : 0;
            const displayIndex = step === 'start'
              ? Math.min(resolvedIndex + 1, totalCount)
              : Math.min(resolvedIndex, totalCount);
            const phaseText = phase || `Validerar ${displayIndex}/${totalCount}`;
            if (step === 'start') {
              pushEvent(`Validerar ${displayIndex}/${totalCount}`);
            }
            await updateProgress({
              completed: resolvedIndex,
              total: totalCount
            }, phaseText, {
              totalCount,
              validatedCount,
              invalidCount,
              skippedCount,
              correctedCount,
              provider,
              currentQuestionId: questionId || null,
              currentQuestion: summarizeProgressText(questionPreview),
              step: step || null
            });
          }
        }
      );
      
      console.log(`[Validation ${taskId}] Validation result:`, validationResult);
    } catch (validationError) {
      console.error(`[Validation ${taskId}] Validation failed:`, validationError);
      console.error(`[Validation ${taskId}] Error stack:`, validationError.stack);
      throw validationError;
    }
    
    console.log(`[Validation ${taskId}] About to update progress to 100%`);
    pushEvent('Validering klar');
    await updateProgress({
      completed: totalCount,
      total: totalCount
    }, 'Validering klar', {
      totalCount,
      validatedCount: validationResult.validatedCount,
      invalidCount: validationResult.invalidCount,
      skippedCount: validationResult.skippedCount,
      correctedCount: validationResult.correctedCount
    });
    
    console.log(`[Validation ${taskId}] About to complete task`);
    await completeTask(env.DB, taskId, {
      success: true,
      totalCount,
      validatedCount: validationResult.validatedCount,
      invalidCount: validationResult.invalidCount,
      skippedCount: validationResult.skippedCount,
      correctedCount: validationResult.correctedCount,
      validationProvider: validationResult.validationProvider || metadata.validationProvider || null,
      validationProvidersUsed: validationResult.validationProvidersUsed || [],
      generatorProviders: Array.isArray(generatorProvider) ? generatorProvider : (generatorProvider ? [generatorProvider] : [])
    });
    
    console.log(`[Validation ${taskId}] Completed: ${validationResult.validatedCount} validated, ${validationResult.invalidCount} invalid`);
    
  } catch (error) {
    console.error(`[Validation ${taskId}] Failed:`, error);
    console.error(`[Validation ${taskId}] Error stack:`, error.stack);
    await failTask(env.DB, taskId, error.message);
  } finally {
    stopHeartbeat();
  }
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Calculate similarity percentage between two strings (0-100)
 */
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) {
    return 100;
  }
  
  const distance = levenshteinDistance(longer, shorter);
  return ((longer.length - distance) / longer.length) * 100;
}

/**
 * Filter out duplicate questions BEFORE saving to database
 * Compares new questions against existing questions in database
 * Uses both exact matching and similarity matching (90% threshold)
 */
async function filterDuplicatesBeforeSaving(db, newQuestions, existingQuestionsOverride = null) {
  const uniqueQuestions = [];
  let duplicateCount = 0;
  const SIMILARITY_THRESHOLD = 90; // 90% similarity = duplicate

  let existingQuestions = existingQuestionsOverride;
  if (!existingQuestions) {
    const allExisting = await db.prepare(`
      SELECT id, question_sv FROM questions
    `).all();
    existingQuestions = allExisting.results || [];
  }

  const comparisonPool = [...existingQuestions];
  console.log(`[filterDuplicatesBeforeSaving] Comparing ${newQuestions.length} new questions against ${comparisonPool.length} existing questions`);

  for (const newQuestion of newQuestions) {
    let isDuplicate = false;

    // Check for exact match first
    for (const existing of comparisonPool) {
      if (newQuestion.question_sv === existing.question_sv) {
        duplicateCount++;
        console.log(`[filterDuplicatesBeforeSaving] Exact duplicate found (NOT saving): ${newQuestion.question_sv.substring(0, 60)}...`);
        isDuplicate = true;
        break;
      }
    }

    if (isDuplicate) continue;

    // Check for similar questions
    for (const existing of comparisonPool) {
      const similarity = calculateSimilarity(
        newQuestion.question_sv.toLowerCase(),
        existing.question_sv.toLowerCase()
      );

      if (similarity >= SIMILARITY_THRESHOLD) {
        duplicateCount++;
        console.log(`[filterDuplicatesBeforeSaving] Similar question found (${similarity.toFixed(1)}% match, NOT saving):`);
        console.log(`  New: ${newQuestion.question_sv.substring(0, 60)}...`);
        console.log(`  Existing: ${existing.question_sv.substring(0, 60)}...`);
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      uniqueQuestions.push(newQuestion);
      comparisonPool.push({ question_sv: newQuestion.question_sv });
    }
  }

  console.log(`[filterDuplicatesBeforeSaving] Result: ${uniqueQuestions.length} unique, ${duplicateCount} duplicates filtered`);
  return {
    uniqueQuestions,
    duplicateCount,
    existingQuestions: comparisonPool
  };
}

/**
 * Validate unique questions using a different AI provider than the generator
 */
async function validateUniqueQuestions(db, factory, questions, generatorProvider, context) {
  console.log('[validateUniqueQuestions] Starting validation...');
  console.log('[validateUniqueQuestions] Questions to validate:', questions.length);
  console.log('[validateUniqueQuestions] Questions array:', questions.map(q => ({ id: q.id, question_sv: q.question_sv?.substring(0, 50) })));
  console.log('[validateUniqueQuestions] Generator provider(s) (to exclude):', generatorProvider);

  const summarizeText = (value, limit = 160) => {
    if (!value) return null;
    const text = String(value);
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}…`;
  };
  const normalizedGenerators = Array.isArray(generatorProvider)
    ? generatorProvider.map((name) => String(name || '').toLowerCase()).filter(Boolean)
    : generatorProvider
      ? [String(generatorProvider).toLowerCase()]
      : [];
  const now = Date.now();

  const resolveQuestionCriteria = (question, fallback) => ({
    category: question?.category || fallback?.category || null,
    ageGroup: question?.ageGroup || fallback?.ageGroup || null,
    difficulty: question?.difficulty || fallback?.difficulty || null
  });

  const buildValidationContext = (question, validationProviderName, criteria) => ({
    generatorProvider: question?.provider
      ? String(question.provider).toLowerCase()
      : normalizedGenerators.length <= 1
        ? (normalizedGenerators[0] || null)
        : normalizedGenerators,
    validationProvider: validationProviderName || null,
    criteria: {
      category: criteria?.category || null,
      ageGroup: criteria?.ageGroup || null,
      difficulty: criteria?.difficulty || null
    },
    question: {
      question_sv: summarizeText(question.question_sv),
      question_en: summarizeText(question.question_en),
      background_sv: summarizeText(question.background_sv),
      background_en: summarizeText(question.background_en),
      options_sv: question.options_sv || null,
      options_en: question.options_en || null,
      correctOption: question.correctOption ?? null,
      targetAudience: question.targetAudience || null,
      emoji: question.emoji || null
    }
  });
  
  let validatedCount = 0;
  let invalidCount = 0;
  let skippedCount = 0;
  let correctedCount = 0;
  const VALIDATION_MIN_INTERVAL_MS = Number.isFinite(context?.validationThrottleMs)
    ? context.validationThrottleMs
    : 0;
  const RATE_LIMIT_MAX_RETRIES = 3;
  const RATE_LIMIT_BASE_MS = 20000;
  let lastValidationAt = Number.isFinite(context?.lastValidationAt)
    ? context.lastValidationAt
    : 0;
  const usedProviders = new Set();
  const reportProgress = typeof context?.onProgress === 'function' ? context.onProgress : null;
  const autoCorrectionEnabled = context?.autoCorrectionEnabled === true;
  const recordProviderCall = async (payload) => {
    try {
      await logProviderCall(db, payload);
    } catch (error) {
      console.warn('[validateUniqueQuestions] Failed to log provider call:', error.message);
    }
  };
  const baseMetadata = {
    category: context.category || null,
    ageGroup: context.ageGroup || null,
    difficulty: context.difficulty || null
  };
  const VALIDATION_CALL_TIMEOUT_MS = 60000;
  const AMBIGUITY_CALL_TIMEOUT_MS = 40000;
  const PROPOSAL_CALL_TIMEOUT_MS = 60000;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const withTimeout = (promise, timeoutMs, label) => new Promise((resolve, reject) => {
    let didTimeout = false;
    const timer = setTimeout(() => {
      didTimeout = true;
      reject(new Error(`${label} timeout efter ${timeoutMs} ms`));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        if (didTimeout) return;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        if (didTimeout) return;
        clearTimeout(timer);
        reject(error);
      });
  });
  const isRateLimitError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('rate limit') || message.includes('rate_limit') || message.includes('429');
  };
  const extractRetryAfterMs = (error) => {
    const message = String(error?.message || '');
    const simpleMatch = message.match(/try again in (\d+)s/i);
    if (simpleMatch) {
      const seconds = Number(simpleMatch[1]);
      if (Number.isFinite(seconds) && seconds > 0) {
        return seconds * 1000;
      }
    }
    const fullMatch = message.match(/try again in\s+((\d+)h)?((\d+)m)?((\d+(\.\d+)?)s)?/i);
    if (fullMatch) {
      const hours = Number(fullMatch[2] || 0);
      const minutes = Number(fullMatch[4] || 0);
      const seconds = Number(fullMatch[6] || 0);
      if (Number.isFinite(hours) || Number.isFinite(minutes) || Number.isFinite(seconds)) {
        const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
        if (totalMs > 0) {
          return totalMs;
        }
      }
    }
    return null;
  };
  const getRetryDelayMs = (error, attempt) => {
    const explicit = extractRetryAfterMs(error);
    if (explicit != null) return explicit;
    const backoff = RATE_LIMIT_BASE_MS * Math.max(1, attempt);
    return Math.min(backoff, 60000);
  };
  const enforceThrottle = async (providerName, questionId, questionPreview) => {
    if (!VALIDATION_MIN_INTERVAL_MS) return;
    const now = Date.now();
    const elapsed = now - lastValidationAt;
    if (elapsed < VALIDATION_MIN_INTERVAL_MS) {
      const waitMs = VALIDATION_MIN_INTERVAL_MS - elapsed;
      if (reportProgress && waitMs >= 1000) {
        await reportProgress({
          index: Math.min(validatedCount + invalidCount + skippedCount, questions.length),
          validatedCount,
          invalidCount,
          skippedCount,
          correctedCount,
          provider: providerName,
          questionId,
          questionPreview,
          step: 'waiting',
          phase: `Väntar ${Math.round(waitMs / 1000)}s (rate limit)`
        });
      }
      await sleep(waitMs);
    }
    lastValidationAt = Date.now();
  };

  const summarizeResult = () => ({
    validatedCount,
    invalidCount,
    skippedCount,
    correctedCount,
    validationProvider: usedProviders.size === 1 ? Array.from(usedProviders)[0] : null,
    validationProvidersUsed: Array.from(usedProviders)
  });

  const hasProposedEdits = (edits) => {
    if (!edits || typeof edits !== 'object') return false;
    return Object.values(edits).some((value) => {
      if (Array.isArray(value)) {
        return value.some((item) => String(item || '').trim());
      }
      if (typeof value === 'string') return value.trim().length > 0;
      if (typeof value === 'number') return Number.isFinite(value);
      return false;
    });
  };

  const applyProposedEdits = (baseQuestion, edits) => {
    if (!edits || typeof edits !== 'object') return baseQuestion;
    const next = { ...baseQuestion };
    if (typeof edits.question_sv === 'string' && edits.question_sv.trim()) {
      next.question_sv = edits.question_sv;
    }
    if (typeof edits.question_en === 'string' && edits.question_en.trim()) {
      next.question_en = edits.question_en;
    }
    if (Array.isArray(edits.options_sv) && edits.options_sv.length > 0) {
      next.options_sv = edits.options_sv;
    }
    if (Array.isArray(edits.options_en) && edits.options_en.length > 0) {
      next.options_en = edits.options_en;
    }
    if (typeof edits.explanation_sv === 'string' && edits.explanation_sv.trim()) {
      next.explanation_sv = edits.explanation_sv;
    }
    if (typeof edits.explanation_en === 'string' && edits.explanation_en.trim()) {
      next.explanation_en = edits.explanation_en;
    }
    if (typeof edits.background_sv === 'string' && edits.background_sv.trim()) {
      next.background_sv = edits.background_sv;
    }
    if (typeof edits.background_en === 'string' && edits.background_en.trim()) {
      next.background_en = edits.background_en;
    }
    const parsedCorrect = Number(edits.correctOption);
    if (Number.isFinite(parsedCorrect)) {
      next.correctOption = parsedCorrect;
    }
    return next;
  };

  const persistQuestionEdits = async (question) => {
    const optionsSv = Array.isArray(question.options_sv) ? question.options_sv : [];
    const optionsEn = Array.isArray(question.options_en)
      ? question.options_en
      : (Array.isArray(question.options_sv) ? question.options_sv : []);
    const parsedCorrectOption = Number(question.correctOption);
    await db.prepare(`
      UPDATE questions
      SET question_sv = ?,
          question_en = ?,
          options_sv = ?,
          options_en = ?,
          correct_option = ?,
          explanation_sv = ?,
          explanation_en = ?,
          background_sv = ?,
          background_en = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(
      question.question_sv || '',
      question.question_en || question.question_sv || '',
      JSON.stringify(optionsSv),
      JSON.stringify(optionsEn),
      Number.isFinite(parsedCorrectOption) ? parsedCorrectOption : 0,
      question.explanation_sv || '',
      question.explanation_en || question.explanation_sv || '',
      question.background_sv || '',
      question.background_en || question.background_sv || '',
      Date.now(),
      question.id
    ).run();
  };

  const evaluateValidationResult = async (question, validationResult, providerName, provider, criteria) => {
    const normalizedValid = typeof validationResult.isValid === 'boolean'
      ? validationResult.isValid
      : typeof validationResult.valid === 'boolean'
        ? validationResult.valid
        : false;
    const alternativeCorrectOptions = Array.isArray(validationResult.alternativeCorrectOptions)
      ? validationResult.alternativeCorrectOptions.filter(Boolean)
      : validationResult.alternativeCorrectOptions
        ? [validationResult.alternativeCorrectOptions]
        : [];
    const multipleCorrectFlag = validationResult.multipleCorrectOptions === true
      || validationResult.multipleCorrectOptions === 'true'
      || validationResult.multipleCorrectOptions === 1;
    let ambiguityCheck = null;
    let ambiguityRateLimited = false;
    if (normalizedValid && typeof provider?.checkAnswerAmbiguity === 'function') {
      try {
        const ambiguityDebug = { request: null, response: null, error: null };
        const onAmbiguityDebug = (entry) => {
          if (!entry) return;
          if (entry.stage === 'request') {
            ambiguityDebug.request = entry.payload;
          } else if (entry.stage === 'response') {
            ambiguityDebug.response = entry.payload;
          } else if (entry.stage === 'error') {
            ambiguityDebug.error = entry.error;
          }
        };
        const ambiguityStartedAt = Date.now();
        ambiguityCheck = await withTimeout(provider.checkAnswerAmbiguity(question, {
          category: criteria?.category ?? context?.category,
          ageGroup: criteria?.ageGroup ?? context?.ageGroup,
          difficulty: criteria?.difficulty ?? context?.difficulty,
          onDebug: onAmbiguityDebug
        }), AMBIGUITY_CALL_TIMEOUT_MS, `${providerName} ambiguity`);
        await recordProviderCall({
          taskId: context?.taskId || null,
          userId: context?.taskUserId || null,
          phase: 'ambiguity',
          provider: providerName,
          model: provider?.model || null,
          status: 'success',
          requestPayload: ambiguityDebug.request,
          responsePayload: ambiguityDebug.response,
          durationMs: Date.now() - ambiguityStartedAt,
          metadata: {
            ...baseMetadata,
            questionId: question.id,
            step: 'ambiguity'
          }
        });
      } catch (error) {
        console.warn('[validateUniqueQuestions] Ambiguity check failed:', error.message);
        if (isRateLimitError(error)) {
          ambiguityRateLimited = true;
        }
        await recordProviderCall({
          taskId: context?.taskId || null,
          userId: context?.taskUserId || null,
          phase: 'ambiguity',
          provider: providerName,
          model: provider?.model || null,
          status: 'error',
          error: error.message,
          metadata: {
            ...baseMetadata,
            questionId: question.id,
            step: 'ambiguity'
          }
        });
      }
    }
    const ambiguityAlternatives = Array.isArray(ambiguityCheck?.alternativeCorrectOptions)
      ? ambiguityCheck.alternativeCorrectOptions.filter(Boolean)
      : ambiguityCheck?.alternativeCorrectOptions
        ? [ambiguityCheck.alternativeCorrectOptions]
        : [];
    const ambiguitySuggestions = Array.isArray(ambiguityCheck?.suggestions)
      ? ambiguityCheck.suggestions.filter(Boolean)
      : ambiguityCheck?.suggestions
        ? [ambiguityCheck.suggestions]
        : [];
    const ambiguityReason = String(ambiguityCheck?.reason || '').trim();
    const ambiguityFlag = ambiguityCheck?.multipleCorrectOptions === true
      || ambiguityCheck?.multipleCorrectOptions === 'true'
      || ambiguityCheck?.multipleCorrectOptions === 1;
    const mergedAlternativeCorrectOptions = Array.from(new Set([
      ...alternativeCorrectOptions,
      ...ambiguityAlternatives
    ]));
    const mergedSuggestions = Array.from(new Set([
      ...(Array.isArray(validationResult.suggestions) ? validationResult.suggestions.filter(Boolean) : []),
      ...ambiguitySuggestions
    ]));
    const hasMultipleCorrectOptions = multipleCorrectFlag
      || alternativeCorrectOptions.length > 0
      || ambiguityFlag
      || ambiguityAlternatives.length > 0;
    const ambiguityContext = hasMultipleCorrectOptions
      ? {
          alternativeCorrectOptions: mergedAlternativeCorrectOptions,
          reason: ambiguityReason,
          suggestions: ambiguitySuggestions
        }
      : null;
    const preferOptionFix = hasMultipleCorrectOptions === true;
    const ruleCheck = evaluateQuestionRules(question, {
      category: criteria?.category,
      ageGroup: criteria?.ageGroup,
      difficulty: criteria?.difficulty,
      targetAudience: question?.targetAudience || context?.targetAudience
    }, context?.rulesConfig || {});
    const blockingRules = ruleCheck?.issues || [];
    const combinedIssues = Array.isArray(validationResult.issues) ? [...validationResult.issues] : [];
    if (!ruleCheck.isValid) {
      combinedIssues.push(...ruleCheck.issues);
    }
    if (hasMultipleCorrectOptions) {
      const alternativesText = mergedAlternativeCorrectOptions.length > 0
        ? ` Möjliga alternativ: ${mergedAlternativeCorrectOptions.join(', ')}.`
        : '';
      const reasonText = ambiguityReason ? ` Orsak: ${ambiguityReason}` : '';
      const ambiguityMessage = `Flera svarsalternativ kan vara korrekta.${alternativesText}${reasonText}`.trim();
      if (!combinedIssues.includes(ambiguityMessage)) {
        combinedIssues.push(ambiguityMessage);
      }
    }
    const finalValid = ruleCheck.isValid && !hasMultipleCorrectOptions ? normalizedValid : false;
    const feedback = validationResult.feedback || 'Fråga validerad med AI';
    const feedbackWithRules = ruleCheck.isValid
      ? feedback
      : `${feedback}${feedback ? ' ' : ''}Regelkontroll: ${ruleCheck.issues.join(' ')}`;
    const freshnessInput = {
      ...question,
      ...validationResult,
      ageGroup: question.ageGroup || criteria?.ageGroup,
      ageGroups: question.ageGroups || (question.ageGroup ? [question.ageGroup] : (criteria?.ageGroup ? [criteria.ageGroup] : []))
    };
    const freshness = resolveFreshnessFields(freshnessInput, context?.freshnessConfig, now);
    const expired = isExpiredByBestBefore(freshness.bestBeforeAt, now);
    const normalizedResult = {
      ...validationResult,
      valid: finalValid,
      isValid: finalValid,
      feedback: feedbackWithRules,
      timeSensitive: freshness.timeSensitive,
      bestBeforeDate: freshness.bestBeforeDate,
      bestBeforeAt: freshness.bestBeforeAt,
      multipleCorrectOptions: hasMultipleCorrectOptions,
      alternativeCorrectOptions: mergedAlternativeCorrectOptions,
      ambiguityCheck,
      validationType: validationResult.validationType || 'ai',
      ...(combinedIssues.length > 0 ? { issues: combinedIssues } : {}),
      ...(mergedSuggestions.length > 0 ? { suggestions: mergedSuggestions } : {}),
      ...(ruleCheck.isValid ? {} : { ruleValidation: ruleCheck, blockingRules }),
      validationContext: buildValidationContext(question, providerName, criteria)
    };

    return {
      finalValid,
      normalizedResult,
      freshness,
      expired,
      combinedIssues,
      mergedSuggestions,
      blockingRules,
      ambiguityRateLimited,
      ambiguityContext,
      preferOptionFix,
      hasMultipleCorrectOptions
    };
  };
  
  try {
    // Get available providers excluding the generator
    const allProviders = factory.getAvailableProviders('validation');
    console.log('[validateUniqueQuestions] ALL available validation providers:', allProviders);
    
    const availableProviderNames = [...allProviders];
    
    console.log('[validateUniqueQuestions] Available validation providers:', availableProviderNames);
    
    if (availableProviderNames.length === 0) {
      console.log('[validateUniqueQuestions] No validation providers available');
      skippedCount = questions.length;
      return summarizeResult();
    }
    
    const requestedProvider = context?.validationProvider ? context.validationProvider.toLowerCase() : null;

    const providerScores = context?.validationProviderScores instanceof Map
      ? context.validationProviderScores
      : new Map();

    const orderProviders = (names) => {
      if (providerScores.size === 0) return [...names];
      return [...names].sort((a, b) => {
        const scoreA = providerScores.get(a)?.avgRating ?? 0;
        const scoreB = providerScores.get(b)?.avgRating ?? 0;
        return scoreB - scoreA;
      });
    };

    const buildProviderQueue = (excludedProvider) => {
      const baseQueue = availableProviderNames.filter((name) => name !== excludedProvider);
      const orderedQueue = orderProviders(baseQueue);
      if (requestedProvider && orderedQueue.includes(requestedProvider)) {
        return [requestedProvider, ...orderedQueue.filter((name) => name !== requestedProvider)];
      }
      return orderedQueue;
    };

    const selectProvider = async (queue) => {
      while (queue.length > 0) {
        const providerName = queue.shift();
        try {
          const provider = factory.getProvider(providerName);
          if (typeof provider.checkCredits === 'function') {
            const creditCheck = await provider.checkCredits();
            if (creditCheck && creditCheck.available === false) {
              console.warn(`[validateUniqueQuestions] Provider ${providerName} unavailable:`, creditCheck.message);
              continue;
            }
          }
          return { name: providerName, provider };
        } catch (error) {
          console.warn(`[validateUniqueQuestions] Provider ${providerName} failed setup:`, error.message);
        }
      }
      return null;
    };
    let activeProvider = null;
    
    // Validate each question
    for (let i = 0; i < questions.length; i++) {
      let question = questions[i];
      const questionGenerator = String(question.provider || '').toLowerCase();
      const questionCriteria = resolveQuestionCriteria(question, context);
      let providerQueue = buildProviderQueue(questionGenerator);
      if (providerQueue.length === 0) {
        skippedCount++;
        if (reportProgress) {
          await reportProgress({
            index: i + 1,
            validatedCount,
            invalidCount,
            skippedCount,
            correctedCount,
            provider: null,
            questionId: question.id,
            questionPreview: summarizeProgressText(question.question_sv),
            step: 'skipped',
            phase: 'Skippad (ingen annan provider än generatorn)'
          });
        }
        continue;
      }

      if (activeProvider && providerQueue.includes(activeProvider.name)) {
        providerQueue = providerQueue.filter((name) => name !== activeProvider.name);
      } else {
        activeProvider = await selectProvider(providerQueue);
      }

      if (!activeProvider) {
        skippedCount += questions.length - i;
        return summarizeResult();
      }
      console.log('[validateUniqueQuestions] Using provider:', activeProvider.name);
      console.log(`[validateUniqueQuestions] Validating question ${i + 1}/${questions.length}...`);
      console.log('[validateUniqueQuestions] Question context:', {
        questionId: question.id,
        provider: activeProvider.name,
        generatorProviders: normalizedGenerators,
        category: context.category,
        ageGroup: context.ageGroup,
        difficulty: context.difficulty,
        question_sv: summarizeText(question.question_sv),
        question_en: summarizeText(question.question_en),
        background_sv: summarizeText(question.background_sv),
        background_en: summarizeText(question.background_en),
        options_sv: question.options_sv,
        options_en: question.options_en,
        correctOption: question.correctOption,
        targetAudience: question.targetAudience,
        emoji: question.emoji,
      });
      
      let validated = false;
      let correctionAppliedForQuestion = false;
      let rateLimitRetries = 0;

      while (!validated) {
        if (!activeProvider) {
          skippedCount += questions.length - i;
          return summarizeResult();
        }

        const currentProviderName = activeProvider.name;
        const currentProvider = activeProvider.provider;
        let validationDebug = null;
        let validationStartedAt = null;

        try {
          if (reportProgress) {
            await reportProgress({
              index: i,
              validatedCount,
              invalidCount,
              skippedCount,
              correctedCount,
              provider: currentProviderName,
              questionId: question.id,
              questionPreview: summarizeProgressText(question.question_sv),
              step: 'start',
              phase: `Validerar ${i + 1}/${questions.length}`
            });
          }
          await enforceThrottle(currentProviderName, question.id, summarizeProgressText(question.question_sv));
          validationDebug = { request: null, response: null, error: null };
          const onValidationDebug = (entry) => {
            if (!entry) return;
            if (entry.stage === 'request') {
              validationDebug.request = entry.payload;
            } else if (entry.stage === 'response') {
              validationDebug.response = entry.payload;
            } else if (entry.stage === 'error') {
              validationDebug.error = entry.error;
            }
          };
        const validationCriteria = {
            category: questionCriteria.category,
            ageGroup: questionCriteria.ageGroup,
            difficulty: questionCriteria.difficulty,
            freshnessPrompt: context.freshnessPrompt,
            answerInQuestionPrompt: context.answerInQuestionPrompt,
            feedbackPrompt: context.validationFeedbackPrompt || null,
            onDebug: onValidationDebug
          };
          validationStartedAt = Date.now();
          const validationResult = await withTimeout(
            currentProvider.validateQuestion(question, validationCriteria),
            VALIDATION_CALL_TIMEOUT_MS,
            `${currentProviderName} validation`
          );
          await recordProviderCall({
            taskId: context?.taskId || null,
            userId: context?.taskUserId || null,
            phase: 'validation',
            provider: currentProviderName,
            model: currentProvider?.model || null,
            status: 'success',
            requestPayload: validationDebug.request,
            responsePayload: validationDebug.response,
            durationMs: Date.now() - validationStartedAt,
            metadata: {
              ...baseMetadata,
              questionId: question.id,
              step: 'validate'
            }
          });

          usedProviders.add(currentProviderName);

          let evaluation = await evaluateValidationResult(
            question,
            validationResult,
            currentProviderName,
            currentProvider,
            questionCriteria
          );
          let proposedEdits = validationResult?.proposedEdits;
          let autoCorrectionApplied = false;

          if (autoCorrectionEnabled && !evaluation.finalValid && !correctionAppliedForQuestion) {
            if (!hasProposedEdits(proposedEdits) && typeof currentProvider.proposeQuestionEdits === 'function') {
              try {
                const analysisContext = {
                  issues: evaluation.combinedIssues,
                  suggestions: evaluation.mergedSuggestions,
                  blockingRules: evaluation.blockingRules,
                  preferOptionFix: evaluation.preferOptionFix === true,
                  ambiguity: evaluation.ambiguityContext
                };
                const proposalDebug = { request: null, response: null, error: null };
                const onProposalDebug = (entry) => {
                  if (!entry) return;
                  if (entry.stage === 'request') {
                    proposalDebug.request = entry.payload;
                  } else if (entry.stage === 'response') {
                    proposalDebug.response = entry.payload;
                  } else if (entry.stage === 'error') {
                    proposalDebug.error = entry.error;
                  }
                };
                const proposalStartedAt = Date.now();
                const proposal = await withTimeout(
                  currentProvider.proposeQuestionEdits(
                    question,
                    {
                      category: questionCriteria.category,
                      ageGroup: questionCriteria.ageGroup,
                      difficulty: questionCriteria.difficulty,
                      answerInQuestionPrompt: context.answerInQuestionPrompt,
                      onDebug: onProposalDebug
                    },
                    analysisContext
                  ),
                  PROPOSAL_CALL_TIMEOUT_MS,
                  `${currentProviderName} propose`
                );
                await recordProviderCall({
                  taskId: context?.taskId || null,
                  userId: context?.taskUserId || null,
                  phase: 'propose_edits',
                  provider: currentProviderName,
                  model: currentProvider?.model || null,
                  status: 'success',
                  requestPayload: proposalDebug.request,
                  responsePayload: proposalDebug.response,
                  durationMs: Date.now() - proposalStartedAt,
                  metadata: {
                    ...baseMetadata,
                    questionId: question.id,
                    step: 'proposal'
                  }
                });
                proposedEdits = proposal?.proposedEdits;
              } catch (error) {
                console.warn('[validateUniqueQuestions] Failed to fetch proposed edits:', error.message);
                await recordProviderCall({
                  taskId: context?.taskId || null,
                  userId: context?.taskUserId || null,
                  phase: 'propose_edits',
                  provider: currentProviderName,
                  model: currentProvider?.model || null,
                  status: 'error',
                  error: error.message,
                  metadata: {
                    ...baseMetadata,
                    questionId: question.id,
                    step: 'proposal'
                  }
                });
              }
            }

            if (hasProposedEdits(proposedEdits)) {
              const updatedQuestion = applyProposedEdits(question, proposedEdits);
              try {
                await persistQuestionEdits(updatedQuestion);
              } catch (error) {
                console.warn('[validateUniqueQuestions] Failed to persist auto-corrections:', error.message);
              }
              question = updatedQuestion;
              autoCorrectionApplied = true;
              correctionAppliedForQuestion = true;

              const correctedDebug = { request: null, response: null, error: null };
              const onCorrectedDebug = (entry) => {
                if (!entry) return;
                if (entry.stage === 'request') {
                  correctedDebug.request = entry.payload;
                } else if (entry.stage === 'response') {
                  correctedDebug.response = entry.payload;
                } else if (entry.stage === 'error') {
                  correctedDebug.error = entry.error;
                }
              };
              const correctedStartedAt = Date.now();
              const correctedValidation = await withTimeout(
                currentProvider.validateQuestion(question, {
                  category: questionCriteria.category,
                  ageGroup: questionCriteria.ageGroup,
                  difficulty: questionCriteria.difficulty,
                  freshnessPrompt: context.freshnessPrompt,
                  answerInQuestionPrompt: context.answerInQuestionPrompt,
                  onDebug: onCorrectedDebug
                }),
                VALIDATION_CALL_TIMEOUT_MS,
                `${currentProviderName} validation`
              );
              await recordProviderCall({
                taskId: context?.taskId || null,
                userId: context?.taskUserId || null,
                phase: 'validation',
                provider: currentProviderName,
                model: currentProvider?.model || null,
                status: 'success',
                requestPayload: correctedDebug.request,
                responsePayload: correctedDebug.response,
                durationMs: Date.now() - correctedStartedAt,
                metadata: {
                  ...baseMetadata,
                  questionId: question.id,
                  step: 'validate_corrected'
                }
              });
              usedProviders.add(currentProviderName);
              evaluation = await evaluateValidationResult(
                question,
                correctedValidation,
                currentProviderName,
                currentProvider,
                questionCriteria
              );
              evaluation.normalizedResult.autoCorrectionApplied = true;
              evaluation.normalizedResult.autoCorrectionSucceeded = evaluation.finalValid;
              evaluation.normalizedResult.autoCorrectionEdits = proposedEdits;
            }
          }

          const { finalValid, normalizedResult, freshness, expired } = evaluation;
          const validationFeedbackText = `${normalizedResult?.feedback || ''} ${(normalizedResult?.issues || []).join(' ')}`;
          const skipAutoFeedback = /rate limit|timeout|time out/i.test(validationFeedbackText);
          const generationRating = skipAutoFeedback ? null : (finalValid ? 5 : 1);
          if (!skipAutoFeedback) {
            normalizedResult.generationRating = generationRating;
            normalizedResult.generationRatingSource = 'validation';
          }

          console.log(`[validateUniqueQuestions] Result: isValid=${finalValid}, confidence=${normalizedResult.confidence}`);

          // Update question in database with validation result
          await db.prepare(`
            UPDATE questions 
            SET validated = ?,
                ai_validated = ?,
                ai_validation_result = ?,
                ai_validated_at = ?,
                validation_generated_at = ?,
                time_sensitive = ?,
                best_before_at = ?,
                quarantined = ?,
                quarantined_at = ?,
                quarantine_reason = ?
            WHERE id = ?
          `).bind(
            finalValid ? 1 : 0,
            finalValid ? 1 : 0,
            JSON.stringify(normalizedResult),
            now,
            now,
            freshness.timeSensitive ? 1 : 0,
            freshness.bestBeforeAt || null,
            expired ? 1 : 0,
            expired ? now : null,
            expired ? 'expired' : null,
            question.id
          ).run();

          const generationProvider = question.provider || null;
          if (generationProvider && !skipAutoFeedback) {
            try {
              await recordQuestionFeedback({ DB: db }, {
                questionId: question.id,
                feedbackType: 'question',
                rating: generationRating,
                verdict: finalValid ? 'approve' : 'reject',
                issues: Array.isArray(normalizedResult.issues) ? normalizedResult.issues : [],
                userRole: 'system',
                category: questionCriteria.category,
                ageGroup: questionCriteria.ageGroup,
                difficulty: questionCriteria.difficulty,
                targetAudience: question.targetAudience || context?.targetAudience || null,
                generationProvider,
                generationModel: question.model || null,
                validationProvider: currentProviderName || null
              });
            } catch (feedbackError) {
              console.warn('[validateUniqueQuestions] Kunde inte logga valideringsbetyg:', feedbackError.message);
            }
          } else if (skipAutoFeedback) {
            console.warn('[validateUniqueQuestions] Skippade valideringsbetyg pga rate limit/timeout.');
          }

          if (finalValid) {
            validatedCount++;
            if (correctionAppliedForQuestion || autoCorrectionApplied) {
              correctedCount++;
            }
          } else {
            invalidCount++;
          }

          if (reportProgress) {
            await reportProgress({
              index: i + 1,
              validatedCount,
              invalidCount,
              skippedCount,
              correctedCount,
              provider: currentProviderName,
              questionId: question.id,
              questionPreview: summarizeProgressText(question.question_sv),
              step: 'done'
            });
          }

          if (evaluation.ambiguityRateLimited && providerQueue.length > 0) {
            if (reportProgress) {
              await reportProgress({
                index: i + 1,
                validatedCount,
                invalidCount,
                skippedCount,
                correctedCount,
                provider: currentProviderName,
                questionId: question.id,
                questionPreview: summarizeProgressText(question.question_sv),
                step: 'switch',
                phase: `Byter provider efter ambiguity rate limit (${currentProviderName})`
              });
            }
            const nextProvider = await selectProvider(providerQueue);
            if (nextProvider) {
              activeProvider = nextProvider;
              console.log('[validateUniqueQuestions] Switching provider to:', activeProvider.name);
            }
          }

          validated = true;
        } catch (validationError) {
          console.error(`[validateUniqueQuestions] Provider ${currentProviderName} failed:`, validationError.message);
          await recordProviderCall({
            taskId: context?.taskId || null,
            userId: context?.taskUserId || null,
            phase: 'validation',
            provider: currentProviderName,
            model: currentProvider?.model || null,
            status: 'error',
            requestPayload: validationDebug?.request,
            responsePayload: validationDebug?.response,
            error: validationError.message,
            durationMs: validationStartedAt ? Date.now() - validationStartedAt : null,
            metadata: {
              ...baseMetadata,
              questionId: question.id,
              step: 'validate'
            }
          });
          if (isRateLimitError(validationError)) {
            if (providerQueue.length > 0) {
              if (reportProgress) {
                await reportProgress({
                  index: i,
                  validatedCount,
                  invalidCount,
                  skippedCount,
                  correctedCount,
                  provider: currentProviderName,
                  questionId: question.id,
                  questionPreview: summarizeProgressText(question.question_sv),
                  step: 'switch',
                  phase: `Rate limit. Byter provider från ${currentProviderName}`
                });
              }
              activeProvider = await selectProvider(providerQueue);
              if (activeProvider) {
                console.log('[validateUniqueQuestions] Switching provider to:', activeProvider.name);
                continue;
              }
            }
            if (rateLimitRetries < RATE_LIMIT_MAX_RETRIES) {
              rateLimitRetries += 1;
              const waitMs = getRetryDelayMs(validationError, rateLimitRetries);
              if (reportProgress) {
                await reportProgress({
                  index: i,
                  validatedCount,
                  invalidCount,
                  skippedCount,
                  correctedCount,
                  provider: currentProviderName,
                  questionId: question.id,
                  questionPreview: summarizeProgressText(question.question_sv),
                  step: 'waiting',
                  phase: `Rate limit. Väntar ${Math.round(waitMs / 1000)}s...`
                });
              }
              await sleep(waitMs);
              continue;
            }
          }
          activeProvider = await selectProvider();
          if (activeProvider) {
            console.log('[validateUniqueQuestions] Switching provider to:', activeProvider.name);
          }
        }
      }
    }
    
    console.log('[validateUniqueQuestions] Validation complete');
    return summarizeResult();
    
  } catch (error) {
    console.error('[validateUniqueQuestions] Validation process failed:', error);
    skippedCount = questions.length;
    return summarizeResult();
  }
}

// Helper function to update task progress
async function updateTaskProgress(db, taskId, progressValue, phase, details = null) {
  try {
    console.log(`[updateTaskProgress] Updating task ${taskId} - ${phase}`);

    const isObject = progressValue && typeof progressValue === 'object';
    const completedValue = isObject ? Number(progressValue.completed) : Number(progressValue);
    const totalValue = isObject ? Number(progressValue.total) : 100;
    const resolvedCompleted = Number.isFinite(completedValue) ? completedValue : 0;
    const resolvedTotal = Number.isFinite(totalValue) && totalValue > 0 ? totalValue : 100;
    const resolvedPhase = phase || (isObject && progressValue.phase ? progressValue.phase : '');
    const mergedDetails = {
      ...(isObject && progressValue.details ? progressValue.details : {}),
      ...(details || {})
    };

    const progressData = {
      completed: resolvedCompleted,
      total: resolvedTotal,
      phase: resolvedPhase,
    };

    if (Object.keys(mergedDetails).length > 0) {
      progressData.details = mergedDetails;
    }

    const result = await db.prepare(`
      UPDATE background_tasks 
      SET progress = ?, updated_at = ?
      WHERE id = ?
    `).bind(JSON.stringify(progressData), Date.now(), taskId).run();
    
    console.log(`[updateTaskProgress] Update result:`, result);
  } catch (error) {
    console.error(`[updateTaskProgress ${taskId}] Failed:`, error);
    console.error(`[updateTaskProgress ${taskId}] Stack:`, error.stack);
  }
}

// Helper function to complete task
async function completeTask(db, taskId, result) {
  try {
    console.log(`[completeTask] Completing task ${taskId} with result:`, result);
    
    const progressData = {
      completed: 100,
      total: 100,
      phase: 'Completed',
    };

    const updateResult = await db.prepare(`
      UPDATE background_tasks 
      SET status = ?, 
          progress = ?, 
          result = ?, 
          updated_at = ?, 
          finished_at = ?
      WHERE id = ?
    `).bind(
      'completed', 
      JSON.stringify(progressData),
      JSON.stringify(result), 
      Date.now(), 
      Date.now(), 
      taskId
    ).run();
    
    console.log(`[completeTask] Task ${taskId} marked as completed:`, updateResult);
  } catch (error) {
    console.error(`[completeTask ${taskId}] Failed:`, error);
    console.error(`[completeTask ${taskId}] Stack:`, error.stack);
  }
}

// Helper function to fail task
async function failTask(db, taskId, errorMessage, resultDetails = null) {
  try {
    const resultPayload = {
      error: errorMessage,
      ...(resultDetails || {})
    };
    await db.prepare(`
      UPDATE background_tasks 
      SET status = ?, 
          error = ?,
          result = ?, 
          updated_at = ?, 
          finished_at = ?
      WHERE id = ?
    `).bind(
      'failed', 
      errorMessage,
      JSON.stringify(resultPayload), 
      Date.now(), 
      Date.now(), 
      taskId
    ).run();
  } catch (error) {
    console.error(`[Task ${taskId}] Failed to mark as failed:`, error);
  }
}

// Save questions to D1 database
async function saveQuestionsToDatabase(db, questions, metadata, progress = null) {
  const { category, difficulty, provider, model, ageGroup, targetAudience, freshnessConfig } = metadata;
  const savedQuestions = [];
  const errors = [];
  const onProgress = progress?.onProgress;
  
  for (const q of questions) {
    const id = `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    try {
      const freshness = resolveFreshnessFields({
        ...q,
        ageGroup: q.ageGroup || ageGroup,
        ageGroups: q.ageGroups || (q.ageGroup ? [q.ageGroup] : (ageGroup ? [ageGroup] : []))
      }, freshnessConfig, now);
      const isExpired = isExpiredByBestBefore(freshness.bestBeforeAt, now);

      const resolvedAgeGroups = ageGroup
        ? [ageGroup]
        : (q.ageGroup ? [q.ageGroup] : []);
      const resolvedAgeGroup = resolvedAgeGroups[0] || null;

      const questionProvider = q.generationProvider || provider;
      const questionModel = q.generationModel || model;

      await db.prepare(`
        INSERT INTO questions (
          id, question_sv, question_en, options_sv, options_en, correct_option, 
          explanation_sv, explanation_en, background_sv, background_en, illustration_emoji, categories, difficulty, 
          age_groups, target_audience, time_sensitive, best_before_at, quarantined, quarantined_at, quarantine_reason,
          created_at, updated_at, created_by,
          ai_generation_provider, ai_generation_model, validated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        q.question_sv,
        q.question_en || q.question_sv, // fallback if English not provided
        JSON.stringify(q.options_sv),
        JSON.stringify(q.options_en || q.options_sv), // fallback if English not provided
        q.correctOption,
        q.explanation_sv || '',
        q.explanation_en || q.explanation_sv || '', // fallback
        q.background_sv || '',
        q.background_en || q.background_sv || '',
        q.emoji || '❓',
        JSON.stringify(category ? [category] : ['Allmän']), // categories is a JSON array
        difficulty,
        JSON.stringify(resolvedAgeGroups),
        q.targetAudience || targetAudience || 'swedish',
        freshness.timeSensitive ? 1 : 0,
        freshness.bestBeforeAt || null,
        isExpired ? 1 : 0,
        isExpired ? now : null,
        isExpired ? 'expired' : null,
        now,
        now,
        'ai-system',
        questionProvider,
        questionModel,
        0  // Always false initially, validation happens after
      ).run();
      
      savedQuestions.push({
        id,
        question_sv: q.question_sv,
        question_en: q.question_en || q.question_sv,
        options_sv: q.options_sv,
        options_en: q.options_en || q.options_sv,
        correctOption: q.correctOption,
        explanation_sv: q.explanation_sv || '',
        explanation_en: q.explanation_en || q.explanation_sv || '',
        background_sv: q.background_sv || '',
        background_en: q.background_en || q.background_sv || '',
        emoji: q.emoji || '❓',
        category,
        difficulty,
        ageGroup: resolvedAgeGroup,
        targetAudience: q.targetAudience || targetAudience,
        timeSensitive: freshness.timeSensitive,
        bestBeforeAt: freshness.bestBeforeAt,
        quarantined: isExpired,
        quarantinedAt: isExpired ? now : null,
        quarantineReason: isExpired ? 'expired' : null,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        createdBy: 'ai-system',
        aiGenerated: true,
        validated: false,  // Always false initially
        provider: questionProvider,
        model: questionModel
      });
      if (typeof onProgress === 'function') {
        await onProgress({
          savedCount: savedQuestions.length,
          errorCount: errors.length,
          lastQuestionId: id,
          lastQuestionText: q.question_sv
        });
      }
    } catch (error) {
      const errorInfo = {
        message: error.message,
        questionKeys: Object.keys(q),
        questionData: q
      };
      errors.push(errorInfo);
      console.error('[generateAIQuestions] Error saving question:', error);
      console.error('[generateAIQuestions] Question data:', JSON.stringify(q, null, 2));
      console.error('[generateAIQuestions] Error message:', error.message);
      console.error('[generateAIQuestions] Error stack:', error.stack);
      // Continue with other questions even if one fails
      if (typeof onProgress === 'function') {
        await onProgress({
          savedCount: savedQuestions.length,
          errorCount: errors.length,
          lastQuestionId: id,
          lastQuestionText: q.question_sv
        });
      }
    }
  }
  
  console.log(`[generateAIQuestions] Saved ${savedQuestions.length}/${questions.length} questions to database`);
  if (errors.length > 0) {
    console.error(`[generateAIQuestions] Encountered ${errors.length} errors while saving`);
  }
  return { savedQuestions, errors };
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-email',
    },
  });
}
