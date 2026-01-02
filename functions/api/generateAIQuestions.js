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

const summarizeProgressText = (value, limit = 120) => {
  if (!value) return '';
  const text = String(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…`;
};

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { amount, category, ageGroup, difficulty, provider, generateIllustrations } = await request.json();
    const userEmail = request.headers.get('x-user-email') || 'anonymous';
    
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
        userEmail
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
  const { amount, category, ageGroup, difficulty, provider, userEmail } = params;
  const taskUserId = userEmail || 'system';
  const progressEvents = [];
  const EVENT_LIMIT = 20;
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let watchdogInterval = null;
  let watchdogTriggered = false;
  let abortGeneration = false;
  let lastProgressSnapshot = {
    completed: 0,
    total: amount,
    phase: 'Köad',
    details: {}
  };
  const WATCHDOG_IDLE_MS = 120000;
  const WATCHDOG_TOTAL_MS = Math.max(5 * 60 * 1000, amount * 45000);
  const WATCHDOG_CHECK_INTERVAL_MS = 15000;
  const debugState = {
    startedAt,
    lastProvider: null,
    lastProviderStartedAt: null,
    lastProviderDurationMs: null,
    lastProviderError: null,
    lastBatchSize: null,
    lastBatchRemaining: null,
    lastRound: 0
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
    lastProgressSnapshot = {
      completed: resolvedCompleted,
      total: resolvedTotal,
      phase: resolvedPhase,
      details: {
        ...(isObject && progressValue.details ? progressValue.details : {}),
        ...details
      }
    };
    await updateTaskProgress(env.DB, taskId, progressValue, phase, {
      ...details,
      heartbeatAt: now,
      debug: getDebugSnapshot(),
      events: [...progressEvents],
      lastMessage: progressEvents.length > 0 ? progressEvents[progressEvents.length - 1].message : ''
    });
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
  
  console.log(`[Task ${taskId}] Params received:`, params);
  console.log(`[Task ${taskId}] Destructured values:`, { amount, category, ageGroup, difficulty, provider });
  
  try {
    startWatchdog();
    console.log(`[Task ${taskId}] Starting generation...`);
    pushEvent('Startar generering');
    
    // Ensure database is initialized (important for background context)
    console.log(`[Task ${taskId}] Calling ensureDatabase...`);
    await ensureDatabase(env.DB);
    await ensureCategoriesTable(env.DB);
    console.log(`[Task ${taskId}] Database ensured.`);
    
    pushEvent('Förbereder AI-förfrågan');
    await updateProgress({ completed: 0, total: amount }, 'Förbereder AI-förfrågan', {
      targetCount: amount
    });
    
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

    const categoryDetails = category ? await getCategoryByName(env.DB, category) : null;
    if (category && !categoryDetails) {
      console.warn(`[Task ${taskId}] Category '${category}' not found in settings, using default prompt.`);
    }
    
    // Initialize provider factory
    const { providerMap } = await getProviderSettingsSnapshot(env, { decryptKeys: true });
    const factory = new AIProviderFactory(env, providerMap);

    const availableProviders = factory.getAvailableProviders('generation');
    const preferredProvider = provider.toLowerCase();
    let providerPickIndex = 0;
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
    let effectiveProvider = preferredProvider;
    let selectedProvider;
    const attemptedProviders = [];
    const providersUsed = new Set();
    const modelsUsed = new Set();
    let lastError;
    const GENERATION_TIMEOUT_MS = 60000;
    const PROVIDER_CALL_TIMEOUT_MS = Math.max(GENERATION_TIMEOUT_MS + 5000, 65000);

    const pickProviderName = () => {
      if (providerCycle.length === 0) {
        throw new Error('No AI providers are configured');
      }
      const chosen = providerCycle[providerPickIndex % providerCycle.length];
      providerPickIndex += 1;
      return chosen;
    };

    const resolveBatchLimit = (providerName, providerInstance) => {
      const providerConfig = providerMap?.[providerName] || {};
      const configuredLimit = Number(providerConfig.maxQuestionsPerRequest);
      if (Number.isFinite(configuredLimit) && configuredLimit > 0) {
        return configuredLimit;
      }
      const providerLimit = Number(providerInstance?.maxQuestionsPerRequest);
      if (Number.isFinite(providerLimit) && providerLimit > 0) {
        return providerLimit;
      }
      return Number.POSITIVE_INFINITY;
    };

    const generateBatch = async (batchAmount, primaryProvider, primaryInstance) => {
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
        if (!attemptedProviders.includes(nextProvider)) {
          attemptedProviders.push(nextProvider);
        }

        const batchLimit = resolveBatchLimit(nextProvider, providerInstance);
        const requestAmount = Math.min(batchAmount, batchLimit);
        debugState.lastProvider = nextProvider;
        debugState.lastBatchSize = requestAmount;
        debugState.lastBatchRemaining = batchAmount;
        debugState.lastProviderStartedAt = Date.now();
        debugState.lastProviderDurationMs = null;
        debugState.lastProviderError = null;

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
            language: 'sv',
            timeoutMs: GENERATION_TIMEOUT_MS
          }), PROVIDER_CALL_TIMEOUT_MS, `${nextProvider} generering`);
          debugState.lastProviderDurationMs = Date.now() - startedAtProvider;
          pushEvent(`Provider ${nextProvider} klar (${debugState.lastProviderDurationMs} ms)`);
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
        }
      }
      throw new Error(`All providers failed. Attempted: ${attemptedProviders.join(', ')}. Last error: ${lastError ? lastError.message : 'Unknown'}`);
    };

    pushEvent(`Genererar 0/${amount}`);
    await updateProgress({ completed: 0, total: amount }, `Genererar 0/${amount}`, {
      targetCount: amount,
      provider: effectiveProvider,
      model: selectedProvider?.model || null
    });

    let generationRounds = 0;
    let totalGenerated = 0;
    let duplicateCount = 0;
    let ruleFilteredCount = 0;
    let stalledRounds = 0;
    let acceptedCount = 0;
    const defaultBatchSize = Math.min(amount, 3);
    const maxRounds = Math.max(3, Math.ceil(amount / defaultBatchSize) + 2);
    const acceptedQuestions = [];

    const existingRows = await env.DB.prepare(`
      SELECT id, question_sv FROM questions
    `).all();
    let existingQuestions = existingRows.results || [];

    while (acceptedQuestions.length < amount && generationRounds < maxRounds) {
      if (abortGeneration) {
        throw new Error('Generation avbruten av watchdog');
      }
      const remaining = amount - acceptedQuestions.length;
      const primaryProvider = pickProviderName();
      selectedProvider = factory.getProvider(primaryProvider);
      effectiveProvider = primaryProvider;
      const batchLimit = resolveBatchLimit(primaryProvider, selectedProvider);
      const batchAmount = Math.min(
        remaining,
        Number.isFinite(batchLimit) && batchLimit > 0 ? batchLimit : remaining
      );
      debugState.lastRound = generationRounds + 1;
      pushEvent(`Provider vald: ${effectiveProvider}`);
      pushEvent(`Genererar batch ${generationRounds + 1}/${maxRounds} (${remaining} kvar)`);
      await updateProgress({
        completed: Math.min(acceptedQuestions.length, amount),
        total: amount
      }, `Genererar ${Math.min(acceptedQuestions.length, amount)}/${amount}`, {
        targetCount: amount,
        provider: effectiveProvider,
        model: selectedProvider?.model || null,
        round: generationRounds + 1,
        remaining,
        generatedCount: totalGenerated,
        acceptedCount: acceptedQuestions.length
      });
      const batchQuestions = await generateBatch(batchAmount, primaryProvider, selectedProvider);
      generationRounds += 1;
      totalGenerated += batchQuestions.length;

      if (batchQuestions.length === 0) {
        stalledRounds += 1;
        if (stalledRounds >= 2) {
          break;
        }
        continue;
      }

      const duplicateResult = await filterDuplicatesBeforeSaving(
        env.DB,
        batchQuestions,
        existingQuestions
      );
      existingQuestions = duplicateResult.existingQuestions;
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
      acceptedQuestions.push(...batchAccepted);
      acceptedCount = acceptedQuestions.length;

      if (batchAccepted.length === 0) {
        stalledRounds += 1;
      } else {
        stalledRounds = 0;
      }

      await updateProgress({
        completed: Math.min(acceptedQuestions.length, amount),
        total: amount
      }, `Genererar ${Math.min(acceptedQuestions.length, amount)}/${amount}`, {
        targetCount: amount,
        provider: effectiveProvider,
        model: selectedProvider?.model || null,
        round: generationRounds,
        remaining: amount - acceptedQuestions.length,
        generatedCount: totalGenerated,
        duplicatesBlocked: duplicateCount,
        ruleFiltered: ruleFilteredCount,
        acceptedCount
      });
    }

    const finalQuestions = acceptedQuestions.slice(0, amount);
    const shortfall = amount - finalQuestions.length;

    if (abortGeneration) {
      return;
    }
    
    pushEvent(`Sparar 0/${amount}`);
    await updateProgress({ completed: 0, total: amount }, `Sparar 0/${amount}`, {
      targetCount: amount,
      provider: effectiveProvider,
      model: selectedProvider?.model || null,
      generatedCount: totalGenerated,
      duplicatesBlocked: duplicateCount,
      ruleFiltered: ruleFilteredCount,
      acceptedCount: finalQuestions.length
    });

    // Step 2: Save ONLY unique questions to database (unvalidated)
    const saveResult = await saveQuestionsToDatabase(env.DB, finalQuestions, {
      category,
      difficulty,
      provider: effectiveProvider,
      model: selectedProvider?.model || null,
      ageGroup,
      targetAudience,
      freshnessConfig
    }, {
      onProgress: async ({ savedCount, errorCount, lastQuestionId, lastQuestionText }) => {
        pushEvent(`Sparade ${savedCount}/${amount}`);
        await updateProgress({
          completed: savedCount,
          total: amount
        }, `Sparar ${savedCount}/${amount}`, {
          targetCount: amount,
          provider: effectiveProvider,
          model: selectedProvider?.model || null,
          generatedCount: totalGenerated,
          duplicatesBlocked: duplicateCount,
          ruleFiltered: ruleFilteredCount,
          acceptedCount: finalQuestions.length,
          savedCount,
          errorCount,
          lastSavedQuestionId: lastQuestionId || null,
          lastSavedQuestion: summarizeProgressText(lastQuestionText)
        });
      }
    });
    
    const { savedQuestions, errors } = saveResult;
    console.log(`[Task ${taskId}] Saved ${savedQuestions.length} unique questions to database`);
    
    const generatorProviders = Array.from(providersUsed);
    const primaryProvider = generatorProviders[0] || effectiveProvider;
    const validationCandidates = factory.getAvailableProviders('validation')
      .filter(name => !generatorProviders.includes(name));
    const validationProvider = validationCandidates[0] || null;
    const shouldRunValidation = savedQuestions.length > 0 && validationCandidates.length > 0;

    pushEvent('Klar med generering');
    await updateProgress({
      completed: savedQuestions.length,
      total: amount
    }, 'Klar med generering', {
      targetCount: amount,
      provider: effectiveProvider,
      model: selectedProvider?.model || null,
      generatedCount: totalGenerated,
      duplicatesBlocked: duplicateCount,
      ruleFiltered: ruleFilteredCount,
      acceptedCount: finalQuestions.length,
      savedCount: savedQuestions.length,
      shortfall
    });
    
    // Complete generation task
    await completeTask(env.DB, taskId, {
      success: true,
      questionsGenerated: savedQuestions.length,
      provider: primaryProvider,
      model: modelsUsed.size === 1 ? Array.from(modelsUsed)[0] : null,
      providersUsed: generatorProviders,
      modelsUsed: Array.from(modelsUsed),
      requestedCount: amount,
      generatedCount: totalGenerated,
      savedCount: savedQuestions.length,
      duplicatesBlocked: duplicateCount,
      ruleFiltered: ruleFilteredCount,
      generationRounds,
      shortfall,
      questionIds: savedQuestions.map((question) => question.id),
      questions: savedQuestions,
      validationInfo: {
        requestedCount: amount,
        totalGenerated: totalGenerated,
        totalSaved: savedQuestions.length,
        duplicates: duplicateCount,
        ruleFiltered: ruleFilteredCount,
        validatedCount: 0,
        invalidCount: 0,
        skippedCount: savedQuestions.length,
        validationProvider: validationProvider,
        generatorProviders,
        note: shouldRunValidation
          ? 'Validation will run in separate background task'
          : 'Validation skipped (no alternative providers)'
      },
      ...(errors.length > 0 && { saveErrors: errors })
    });
    
    console.log(`[Task ${taskId}] Completed successfully: ${savedQuestions.length} questions saved (${duplicateCount} duplicates filtered)`);
    
    // Run validation synchronously (covered by context.waitUntil from parent)
    if (shouldRunValidation) {
      const validationTaskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_validation`;
      
      // Create validation task
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
        `Validerar ${savedQuestions.length} genererade frågor med AI`,
        JSON.stringify({
          questionIds: savedQuestions.map(q => q.id),
          generatorProviders,
          validationProvider,
          category,
          ageGroup,
          difficulty,
          targetAudience
        }),
        JSON.stringify({
          completed: 0,
          total: savedQuestions.length,
          phase: 'Startar validering',
          details: {
            totalCount: savedQuestions.length,
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
      
      console.log(`[Task ${taskId}] Started validation task: ${validationTaskId}`);
      console.log(`[Task ${taskId}] Validation metadata before call: { category: '${category}', ageGroup: '${ageGroup}', difficulty: '${difficulty}' }`);
      
      // Run validation synchronously (AWAIT instead of fire-and-forget)
      // IMPORTANT: Use savedQuestions (with database IDs), not uniqueQuestions!
      try {
        await validateQuestionsInBackground(env, validationTaskId, savedQuestions, generatorProviders, {
          category,
          ageGroup,
          difficulty,
          validationProvider,
          targetAudience
        }, rulesConfig);
        console.log(`[Task ${taskId}] Validation completed successfully`);
      } catch (validationError) {
        console.error(`[Task ${taskId}] Validation failed:`, validationError);
        // Don't fail the generation task if validation fails
      }
    } else if (savedQuestions.length > 0) {
      console.log(`[Task ${taskId}] Skipping validation (no alternative validation providers available)`);
    }
    
  } catch (error) {
    if (watchdogTriggered) {
      console.error(`[Task ${taskId}] Aborted by watchdog:`, error?.message || error);
      return;
    }
    console.error(`[Task ${taskId}] Failed:`, error);
    
    // Mark task as failed
    await failTask(env.DB, taskId, error.message, {
      debug: getDebugSnapshot()
    });
  } finally {
    stopWatchdog();
  }
}

/**
 * Validate questions in background
 */
async function validateQuestionsInBackground(env, taskId, questions, generatorProvider, metadata = {}, rulesConfig = null) {
  const progressEvents = [];

  const pushEvent = (message) => {
    if (!message) return;
    progressEvents.push({ at: Date.now(), message });
    if (progressEvents.length > 6) {
      progressEvents.shift();
    }
  };

  const updateProgress = async (progressValue, phase, details = {}) => {
    await updateTaskProgress(env.DB, taskId, progressValue, phase, {
      ...details,
      events: [...progressEvents],
      lastMessage: progressEvents.length > 0 ? progressEvents[progressEvents.length - 1].message : ''
    });
  };

  try {
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

    // Create factory inside background task (can't pass objects through fire-and-forget)
    const { providerMap } = await getProviderSettingsSnapshot(env, { decryptKeys: true });
    const factory = new AIProviderFactory(env, providerMap);
    console.log(`[Validation ${taskId}] Factory created`);
    
    // Fetch task payload to get metadata if not provided
    if (!metadata.category || !metadata.ageGroup || !metadata.difficulty || !metadata.validationProvider) {
      console.log(`[Validation ${taskId}] Metadata incomplete, fetching from task payload...`);
      const task = await env.DB.prepare(`SELECT payload FROM background_tasks WHERE id = ?`).bind(taskId).first();
      if (task && task.payload) {
        const payload = JSON.parse(task.payload);
        metadata = {
          category: payload.category || metadata.category,
          ageGroup: payload.ageGroup || metadata.ageGroup,
          difficulty: payload.difficulty || metadata.difficulty,
          validationProvider: payload.validationProvider || metadata.validationProvider,
          targetAudience: payload.targetAudience || metadata.targetAudience
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
          rulesConfig,
          freshnessConfig,
          freshnessPrompt,
          answerInQuestionPrompt,
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

  const buildValidationContext = (question, validationProviderName) => ({
    generatorProvider: normalizedGenerators.length <= 1
      ? (normalizedGenerators[0] || null)
      : normalizedGenerators,
    validationProvider: validationProviderName || null,
    criteria: {
      category: context.category || null,
      ageGroup: context.ageGroup || null,
      difficulty: context.difficulty || null
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
  const usedProviders = new Set();
  const reportProgress = typeof context?.onProgress === 'function' ? context.onProgress : null;
  const autoCorrectionEnabled = context?.autoCorrectionEnabled === true;

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

  const evaluateValidationResult = async (question, validationResult, providerName, provider) => {
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
    if (normalizedValid && typeof provider?.checkAnswerAmbiguity === 'function') {
      try {
        ambiguityCheck = await provider.checkAnswerAmbiguity(question, {
          category: context.category,
          ageGroup: context.ageGroup,
          difficulty: context.difficulty
        });
      } catch (error) {
        console.warn('[validateUniqueQuestions] Ambiguity check failed:', error.message);
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
    const ruleCheck = evaluateQuestionRules(question, {
      category: context.category,
      ageGroup: context.ageGroup,
      difficulty: context.difficulty,
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
      ageGroup: question.ageGroup || context?.ageGroup,
      ageGroups: question.ageGroups || (question.ageGroup ? [question.ageGroup] : (context?.ageGroup ? [context.ageGroup] : []))
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
      validationContext: buildValidationContext(question, providerName)
    };

    return {
      finalValid,
      normalizedResult,
      freshness,
      expired,
      combinedIssues,
      mergedSuggestions,
      blockingRules
    };
  };
  
  try {
    // Get available providers excluding the generator
    const allProviders = factory.getAvailableProviders('validation');
    console.log('[validateUniqueQuestions] ALL available validation providers:', allProviders);
    
    const availableProviderNames = normalizedGenerators.length > 0
      ? allProviders.filter(name => !normalizedGenerators.includes(name))
      : allProviders;
    
    console.log('[validateUniqueQuestions] Available validation providers (excluding generator):', availableProviderNames);
    
    if (availableProviderNames.length === 0) {
      console.log('[validateUniqueQuestions] No validation providers available (excluding generator)');
      skippedCount = questions.length;
      return summarizeResult();
    }
    
    const requestedProvider = context?.validationProvider ? context.validationProvider.toLowerCase() : null;
    const providerQueue = requestedProvider && availableProviderNames.includes(requestedProvider)
      ? [requestedProvider, ...availableProviderNames.filter(name => name !== requestedProvider)]
      : [...availableProviderNames];

    const selectProvider = async () => {
      while (providerQueue.length > 0) {
        const providerName = providerQueue.shift();
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

    let activeProvider = await selectProvider();
    if (!activeProvider) {
      skippedCount = questions.length;
      return summarizeResult();
    }
    console.log('[validateUniqueQuestions] Using provider:', activeProvider.name);
    
    // Validate each question
    for (let i = 0; i < questions.length; i++) {
      let question = questions[i];
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

      while (!validated) {
        if (!activeProvider) {
          skippedCount += questions.length - i;
          return summarizeResult();
        }

        const currentProviderName = activeProvider.name;
        const currentProvider = activeProvider.provider;

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
          const validationResult = await currentProvider.validateQuestion(question, {
            category: context.category,
            ageGroup: context.ageGroup,
            difficulty: context.difficulty,
            freshnessPrompt: context.freshnessPrompt,
            answerInQuestionPrompt: context.answerInQuestionPrompt
          });

          usedProviders.add(currentProviderName);

          let evaluation = await evaluateValidationResult(question, validationResult, currentProviderName, currentProvider);
          let proposedEdits = validationResult?.proposedEdits;
          let autoCorrectionApplied = false;

          if (autoCorrectionEnabled && !evaluation.finalValid && !correctionAppliedForQuestion) {
            if (!hasProposedEdits(proposedEdits) && typeof currentProvider.proposeQuestionEdits === 'function') {
              try {
                const proposal = await currentProvider.proposeQuestionEdits(
                  question,
                  {
                    category: context.category,
                    ageGroup: context.ageGroup,
                    difficulty: context.difficulty,
                    answerInQuestionPrompt: context.answerInQuestionPrompt
                  },
                  {
                    issues: evaluation.combinedIssues,
                    suggestions: evaluation.mergedSuggestions,
                    blockingRules: evaluation.blockingRules
                  }
                );
                proposedEdits = proposal?.proposedEdits;
              } catch (error) {
                console.warn('[validateUniqueQuestions] Failed to fetch proposed edits:', error.message);
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

              const correctedValidation = await currentProvider.validateQuestion(question, {
                category: context.category,
                ageGroup: context.ageGroup,
                difficulty: context.difficulty,
                freshnessPrompt: context.freshnessPrompt,
                answerInQuestionPrompt: context.answerInQuestionPrompt
              });
              usedProviders.add(currentProviderName);
              evaluation = await evaluateValidationResult(question, correctedValidation, currentProviderName, currentProvider);
              evaluation.normalizedResult.autoCorrectionApplied = true;
              evaluation.normalizedResult.autoCorrectionSucceeded = evaluation.finalValid;
              evaluation.normalizedResult.autoCorrectionEdits = proposedEdits;
            }
          }

          const { finalValid, normalizedResult, freshness, expired } = evaluation;

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

          validated = true;
        } catch (validationError) {
          console.error(`[validateUniqueQuestions] Provider ${currentProviderName} failed:`, validationError.message);
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
