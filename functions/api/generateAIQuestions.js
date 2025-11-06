/**
 * Cloudflare Pages Function - Generate AI Questions
 * Generates quiz questions using OpenAI, Gemini, Anthropic, or Mistral
 */

import { AIProviderFactory } from '../lib/ai-providers/index.js';
import { ensureDatabase } from '../lib/ensureDatabase.js';

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
      total: 100,
      phase: 'Queued',
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
        provider
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
  const { amount, category, ageGroup, difficulty, provider } = params;
  
  console.log(`[Task ${taskId}] Params received:`, params);
  console.log(`[Task ${taskId}] Destructured values:`, { amount, category, ageGroup, difficulty, provider });
  
  try {
    console.log(`[Task ${taskId}] Starting generation...`);
    
    // Ensure database is initialized (important for background context)
    console.log(`[Task ${taskId}] Calling ensureDatabase...`);
    await ensureDatabase(env.DB);
    console.log(`[Task ${taskId}] Database ensured.`);
    
    // Update progress: 10%
    await updateTaskProgress(env.DB, taskId, 10, 'Förbereder AI-förfrågan');
    
    // Determine target audience based on age group
    const targetAudience = determineTargetAudience(ageGroup);
    
    // Initialize provider factory
    const factory = new AIProviderFactory(env);
    
    // Handle 'random' provider by picking one randomly
    let effectiveProvider = provider.toLowerCase();
    let selectedProvider;
    
    if (effectiveProvider === 'random') {
      const randomSelection = factory.getRandomProvider();
      effectiveProvider = randomSelection.name;
      selectedProvider = randomSelection.provider;
      console.log(`[Task ${taskId}] Random provider selected: ${effectiveProvider}`);
    } else {
      selectedProvider = factory.getProvider(effectiveProvider);
    }
    
    // Update progress: 30%
    await updateTaskProgress(env.DB, taskId, 30, `Genererar med ${effectiveProvider}`);
    
    // Generate questions using the selected provider (with automatic fallback to all available providers)
    let generatedQuestions;
    let attemptedProviders = [effectiveProvider];
    let lastError;
    
    try {
      generatedQuestions = await selectedProvider.generateQuestions({
        amount,
        category,
        ageGroup,
        difficulty,
        targetAudience,
        language: 'sv'
      });
    } catch (providerError) {
      lastError = providerError;
      console.warn(`[Task ${taskId}] ${effectiveProvider} failed:`, providerError.message);
      
      // Try all other available providers as fallback
      const availableProviders = factory.getAvailableProviders()
        .filter(name => name !== effectiveProvider);
      
      let fallbackSuccess = false;
      
      for (const fallbackProviderName of availableProviders) {
        try {
          console.log(`[Task ${taskId}] Trying fallback provider: ${fallbackProviderName}`);
          attemptedProviders.push(fallbackProviderName);
          
          effectiveProvider = fallbackProviderName;
          selectedProvider = factory.getProvider(fallbackProviderName);
          
          await updateTaskProgress(env.DB, taskId, 30, `Genererar med ${effectiveProvider} (fallback)`);
          
          generatedQuestions = await selectedProvider.generateQuestions({
            amount,
            category,
            ageGroup,
            difficulty,
            targetAudience,
            language: 'sv'
          });
          
          fallbackSuccess = true;
          console.log(`[Task ${taskId}] Fallback to ${effectiveProvider} succeeded`);
          break;
        } catch (fallbackError) {
          lastError = fallbackError;
          console.warn(`[Task ${taskId}] Fallback ${fallbackProviderName} also failed:`, fallbackError.message);
          continue;
        }
      }
      
      if (!fallbackSuccess) {
        throw new Error(`All providers failed. Attempted: ${attemptedProviders.join(', ')}. Last error: ${lastError.message}`);
      }
    }
    
    console.log(`[Task ${taskId}] Generated ${generatedQuestions.length} questions`);
    
    // Update progress: 40%
    await updateTaskProgress(env.DB, taskId, 40, 'Kontrollerar dubletter');
    
    // Step 1: Check for duplicates BEFORE saving (compare question text with existing questions)
    const { uniqueQuestions, duplicateCount } = await filterDuplicatesBeforeSaving(
      env.DB, 
      generatedQuestions
    );
    
    console.log(`[Task ${taskId}] Found ${uniqueQuestions.length} unique questions, ${duplicateCount} duplicates (not saved)`);
    
    // Update progress: 60%
    await updateTaskProgress(env.DB, taskId, 60, 'Sparar unika frågor till databas');
    
    // Step 2: Save ONLY unique questions to database (unvalidated)
    const saveResult = await saveQuestionsToDatabase(env.DB, uniqueQuestions, {
      category,
      difficulty,
      provider: effectiveProvider,
      model: selectedProvider.model,
      ageGroup,
      targetAudience
    });
    
    const { savedQuestions, errors } = saveResult;
    console.log(`[Task ${taskId}] Saved ${savedQuestions.length} unique questions to database`);
    
    // Update progress: 70%
    await updateTaskProgress(env.DB, taskId, 70, 'Klar med generering');
    
    // Complete generation task
    await completeTask(env.DB, taskId, {
      success: true,
      questionsGenerated: savedQuestions.length,
      provider: effectiveProvider,
      model: selectedProvider.model,
      questions: savedQuestions,
      validationInfo: {
        totalGenerated: generatedQuestions.length,
        totalSaved: savedQuestions.length,
        uniqueQuestions: savedQuestions.length,
        duplicates: duplicateCount,
        validatedCount: 0,
        invalidCount: 0,
        skippedCount: savedQuestions.length,
        note: 'Validation will run in separate background task'
      },
      ...(errors.length > 0 && { saveErrors: errors })
    });
    
    console.log(`[Task ${taskId}] Completed successfully: ${savedQuestions.length} questions saved (${duplicateCount} duplicates filtered)`);
    
    // Run validation synchronously (covered by context.waitUntil from parent)
    if (savedQuestions.length > 0) {
      const validationTaskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_validation`;
      
      // Create validation task
      await env.DB.prepare(`
        INSERT INTO background_tasks (
          id, user_id, task_type, status, label, description,
          payload, progress, created_at, started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        validationTaskId,
        null,
        'validate_questions',
        'running',
        'AI-validering',
        `Validerar ${uniqueQuestions.length} genererade frågor med AI`,
        JSON.stringify({
          questionIds: uniqueQuestions.map(q => q.id),
          generatorProvider: effectiveProvider,
          category,
          ageGroup,
          difficulty
        }),
        JSON.stringify({ completed: 0, total: 100, phase: 'Startar validering' }),
        Date.now(),
        Date.now()
      ).run();
      
      console.log(`[Task ${taskId}] Started validation task: ${validationTaskId}`);
      console.log(`[Task ${taskId}] Validation metadata before call: { category: '${category}', ageGroup: '${ageGroup}', difficulty: '${difficulty}' }`);
      
      // Run validation synchronously (AWAIT instead of fire-and-forget)
      try {
        await validateQuestionsInBackground(env, validationTaskId, uniqueQuestions, effectiveProvider, {
          category,
          ageGroup,
          difficulty
        });
        console.log(`[Task ${taskId}] Validation completed successfully`);
      } catch (validationError) {
        console.error(`[Task ${taskId}] Validation failed:`, validationError);
        // Don't fail the generation task if validation fails
      }
    }
    
  } catch (error) {
    console.error(`[Task ${taskId}] Failed:`, error);
    
    // Mark task as failed
    await failTask(env.DB, taskId, error.message);
  }
}

/**
 * Validate questions in background
 */
async function validateQuestionsInBackground(env, taskId, questions, generatorProvider, metadata = {}) {
  try {
    console.log(`[Validation ${taskId}] Starting validation of ${questions.length} questions`);
    
    // Ensure database is initialized (background tasks bypass middleware)
    const { ensureDatabase } = await import('../lib/ensureDatabase.js');
    await ensureDatabase(env.DB);
    console.log(`[Validation ${taskId}] Database initialized`);
    
    // Create factory inside background task (can't pass objects through fire-and-forget)
    const factory = new AIProviderFactory(env);
    console.log(`[Validation ${taskId}] Factory created`);
    
    // Fetch task payload to get metadata if not provided
    if (!metadata.category || !metadata.ageGroup || !metadata.difficulty) {
      console.log(`[Validation ${taskId}] Metadata incomplete, fetching from task payload...`);
      const task = await env.DB.prepare(`SELECT payload FROM background_tasks WHERE id = ?`).bind(taskId).first();
      if (task && task.payload) {
        const payload = JSON.parse(task.payload);
        metadata = {
          category: payload.category || metadata.category,
          ageGroup: payload.ageGroup || metadata.ageGroup,
          difficulty: payload.difficulty || metadata.difficulty
        };
        console.log(`[Validation ${taskId}] Metadata from payload:`, metadata);
      }
    }
    
    console.log(`[Validation ${taskId}] Final metadata:`, metadata);
    
    // Update progress to show we're starting
    try {
      await updateTaskProgress(env.DB, taskId, 10, 'Förbereder validering');
      console.log(`[Validation ${taskId}] Progress updated to 10%`);
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
          difficulty: metadata.difficulty
        }
      );
      
      console.log(`[Validation ${taskId}] Validation result:`, validationResult);
    } catch (validationError) {
      console.error(`[Validation ${taskId}] Validation failed:`, validationError);
      console.error(`[Validation ${taskId}] Error stack:`, validationError.stack);
      throw validationError;
    }
    
    console.log(`[Validation ${taskId}] About to update progress to 100%`);
    await updateTaskProgress(env.DB, taskId, 100, 'Validering klar');
    
    console.log(`[Validation ${taskId}] About to complete task`);
    await completeTask(env.DB, taskId, {
      success: true,
      validatedCount: validationResult.validatedCount,
      invalidCount: validationResult.invalidCount,
      skippedCount: validationResult.skippedCount
    });
    
    console.log(`[Validation ${taskId}] Completed: ${validationResult.validatedCount} validated, ${validationResult.invalidCount} invalid`);
    
  } catch (error) {
    console.error(`[Validation ${taskId}] Failed:`, error);
    console.error(`[Validation ${taskId}] Error stack:`, error.stack);
    await failTask(env.DB, taskId, error.message);
  }
}

/**
 * Determine target audience based on age group
 */
function determineTargetAudience(ageGroup) {
  // Children (6-12): Swedish focus
  // Youth (13-25): Global focus
  // Adults (25+): Swedish focus
  const audienceMap = {
    'children': 'swedish',
    'youth': 'global',
    'adults': 'swedish'
  };
  
  return audienceMap[ageGroup] || 'swedish';
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
async function filterDuplicatesBeforeSaving(db, newQuestions) {
  const uniqueQuestions = [];
  let duplicateCount = 0;
  const SIMILARITY_THRESHOLD = 90; // 90% similarity = duplicate
  
  // Get all existing questions from database (we'll compare against these)
  const allExisting = await db.prepare(`
    SELECT id, question_sv FROM questions
  `).all();
  
  const existingQuestions = allExisting.results || [];
  console.log(`[filterDuplicatesBeforeSaving] Comparing ${newQuestions.length} new questions against ${existingQuestions.length} existing questions`);
  
  for (const newQuestion of newQuestions) {
    let isDuplicate = false;
    
    // Check for exact match first
    for (const existing of existingQuestions) {
      if (newQuestion.question_sv === existing.question_sv) {
        duplicateCount++;
        console.log(`[filterDuplicatesBeforeSaving] Exact duplicate found (NOT saving): ${newQuestion.question_sv.substring(0, 60)}...`);
        isDuplicate = true;
        break;
      }
    }
    
    if (isDuplicate) continue;
    
    // Check for similar questions
    for (const existing of existingQuestions) {
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
    }
  }
  
  console.log(`[filterDuplicatesBeforeSaving] Result: ${uniqueQuestions.length} unique, ${duplicateCount} duplicates filtered`);
  return { uniqueQuestions, duplicateCount };
}

/**
 * Validate unique questions using a different AI provider than the generator
 */
async function validateUniqueQuestions(db, factory, questions, generatorProvider, context) {
  console.log('[validateUniqueQuestions] Starting validation...');
  console.log('[validateUniqueQuestions] Questions to validate:', questions.length);
  console.log('[validateUniqueQuestions] Generator provider (to exclude):', generatorProvider);
  
  let validatedCount = 0;
  let invalidCount = 0;
  let skippedCount = 0;
  
  try {
    // Get available providers excluding the generator
    const availableProviderNames = factory.getAvailableProviders()
      .filter(name => name !== generatorProvider);
    
    console.log('[validateUniqueQuestions] Available validation providers:', availableProviderNames);
    
    if (availableProviderNames.length === 0) {
      console.log('[validateUniqueQuestions] No validation providers available (excluding generator)');
      skippedCount = questions.length;
      return { validatedCount, invalidCount, skippedCount };
    }
    
    // Pick a random validation provider (different from generator)
    const validationProviderName = availableProviderNames[Math.floor(Math.random() * availableProviderNames.length)];
    const validationProvider = factory.getProvider(validationProviderName);
    console.log('[validateUniqueQuestions] Using provider:', validationProvider.name);
    
    const now = Date.now();
    
    // Validate each question
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      console.log(`[validateUniqueQuestions] Validating question ${i + 1}/${questions.length}...`);
      
      try {
        const validationResult = await validationProvider.validateQuestion(question, {
          category: context.category,
          ageGroup: context.ageGroup,
          difficulty: context.difficulty
        });
        
        console.log(`[validateUniqueQuestions] Result: isValid=${validationResult.isValid}, confidence=${validationResult.confidence}`);
        
        // Update question in database with validation result
        await db.prepare(`
          UPDATE questions 
          SET validated = ?,
              ai_validated = ?,
              ai_validation_result = ?,
              ai_validated_at = ?,
              validation_generated_at = ?
          WHERE id = ?
        `).bind(
          validationResult.isValid ? 1 : 0,
          validationResult.isValid ? 1 : 0,
          JSON.stringify(validationResult),
          now,
          now,
          question.id
        ).run();
        
        if (validationResult.isValid) {
          validatedCount++;
        } else {
          invalidCount++;
        }
        
      } catch (validationError) {
        console.error(`[validateUniqueQuestions] Error validating question ${i + 1}:`, validationError.message);
        // Mark as unvalidated but don't fail the whole process
        await db.prepare(`
          UPDATE questions 
          SET validated = 0,
              ai_validated = 0,
              ai_validation_result = ?
          WHERE id = ?
        `).bind(
          JSON.stringify({ error: validationError.message }),
          question.id
        ).run();
        invalidCount++;
      }
    }
    
    console.log('[validateUniqueQuestions] Validation complete');
    return { validatedCount, invalidCount, skippedCount };
    
  } catch (error) {
    console.error('[validateUniqueQuestions] Validation process failed:', error);
    skippedCount = questions.length;
    return { validatedCount, invalidCount, skippedCount };
  }
}

// Helper function to update task progress
async function updateTaskProgress(db, taskId, progressPercent, phase, details = null) {
  try {
    console.log(`[updateTaskProgress] Updating task ${taskId} to ${progressPercent}% - ${phase}`);
    
    const progressData = {
      completed: progressPercent,
      total: 100,
      phase: phase,
    };
    
    if (details) {
      progressData.details = details;
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
async function failTask(db, taskId, errorMessage) {
  try {
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
      JSON.stringify({ error: errorMessage }), 
      Date.now(), 
      Date.now(), 
      taskId
    ).run();
  } catch (error) {
    console.error(`[Task ${taskId}] Failed to mark as failed:`, error);
  }
}

// Save questions to D1 database
async function saveQuestionsToDatabase(db, questions, metadata) {
  const { category, difficulty, provider, model, ageGroup, targetAudience } = metadata;
  const savedQuestions = [];
  const errors = [];
  
  for (const q of questions) {
    const id = `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    try {
      await db.prepare(`
        INSERT INTO questions (
          id, question_sv, question_en, options_sv, options_en, correct_option, 
          explanation_sv, explanation_en, illustration_emoji, categories, difficulty, 
          age_groups, target_audience, created_at, updated_at, created_by,
          ai_generation_provider, ai_generation_model, validated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        q.question_sv,
        q.question_en || q.question_sv, // fallback if English not provided
        JSON.stringify(q.options_sv),
        JSON.stringify(q.options_en || q.options_sv), // fallback if English not provided
        q.correctOption,
        q.explanation_sv || '',
        q.explanation_en || q.explanation_sv || '', // fallback
        q.emoji || '❓',
        JSON.stringify(category ? [category] : ['Allmän']), // categories is a JSON array
        difficulty,
        JSON.stringify(q.ageGroup ? [q.ageGroup] : (ageGroup ? [ageGroup] : [])), // Use question's ageGroup if available, fallback to metadata
        q.targetAudience || 'swedish',
        now,
        now,
        'ai-system',
        provider,
        model,
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
        emoji: q.emoji || '❓',
        category,
        difficulty,
        ageGroup,
        targetAudience,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        createdBy: 'ai-system',
        aiGenerated: true,
        validated: false,  // Always false initially
        provider,
        model
      });
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
