/**
 * Cloudflare Pages Function - Generate AI Questions
 * Generates quiz questions using OpenAI, Gemini, Anthropic, or Mistral
 */

import { AIProviderFactory } from '../lib/ai-providers/index.js';

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
    const now = new Date().toISOString();
    
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
  
  try {
    console.log(`[Task ${taskId}] Starting generation...`);
    
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
    await updateTaskProgress(env.DB, taskId, 40, 'Sparar frågor till databas');
    
    // Step 1: Save ALL generated questions to database immediately (unvalidated)
    const saveResult = await saveQuestionsToDatabase(env.DB, generatedQuestions, {
      category,
      difficulty,
      provider: effectiveProvider,
      model: selectedProvider.model,
      ageGroup,
      targetAudience
    });
    
    const { savedQuestions, errors } = saveResult;
    console.log(`[Task ${taskId}] Saved ${savedQuestions.length} questions to database`);
    
    // Update progress: 60%
    await updateTaskProgress(env.DB, taskId, 60, 'Kontrollerar dubletter');
    
    // Step 2: Check for duplicates (compare question text)
    const { uniqueQuestions, duplicateCount } = await filterDuplicateQuestions(
      env.DB, 
      savedQuestions
    );
    
    console.log(`[Task ${taskId}] Found ${uniqueQuestions.length} unique questions, ${duplicateCount} duplicates`);
    
    // Update progress: 70%
    await updateTaskProgress(env.DB, taskId, 70, 'Klar med generering');
    
    // Skip AI validation for now to avoid timeout issues
    // TODO: Move validation to separate background job or queue
    const validationResult = {
      validatedCount: 0,
      invalidCount: 0,
      skippedCount: uniqueQuestions.length
    };
    
    console.log(`[Task ${taskId}] Skipping validation to avoid timeout (${uniqueQuestions.length} questions)`);
    
    // Complete task
    await completeTask(env.DB, taskId, {
      success: true,
      questionsGenerated: savedQuestions.length,
      provider: effectiveProvider,
      model: selectedProvider.model,
      questions: savedQuestions,
      validationInfo: {
        totalGenerated: generatedQuestions.length,
        totalSaved: savedQuestions.length,
        uniqueQuestions: uniqueQuestions.length,
        duplicates: duplicateCount,
        validatedCount: validationResult.validatedCount,
        invalidCount: validationResult.invalidCount,
        skippedCount: validationResult.skippedCount
      },
      ...(errors.length > 0 && { saveErrors: errors })
    });
    
    console.log(`[Task ${taskId}] Completed successfully: ${savedQuestions.length} questions`);
    
  } catch (error) {
    console.error(`[Task ${taskId}] Failed:`, error);
    
    // Mark task as failed
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
 * Filter out duplicate questions by comparing question text
 */
async function filterDuplicateQuestions(db, savedQuestions) {
  const uniqueQuestions = [];
  let duplicateCount = 0;
  
  for (const question of savedQuestions) {
    // Check if a question with similar text already exists (before this batch)
    const existing = await db.prepare(`
      SELECT id FROM questions 
      WHERE question_sv = ? 
      AND id != ?
      LIMIT 1
    `).bind(question.question_sv, question.id).first();
    
    if (existing) {
      duplicateCount++;
      console.log(`[filterDuplicateQuestions] Duplicate found for: ${question.question_sv.substring(0, 50)}...`);
    } else {
      uniqueQuestions.push(question);
    }
  }
  
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
              ai_validation_result = ?,
              validation_generated_at = ?
          WHERE id = ?
        `).bind(
          validationResult.isValid ? 1 : 0,
          JSON.stringify(validationResult),
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
    const progressData = {
      completed: progressPercent,
      total: 100,
      phase: phase,
    };
    
    if (details) {
      progressData.details = details;
    }

    await db.prepare(`
      UPDATE background_tasks 
      SET progress = ?, updated_at = ?
      WHERE id = ?
    `).bind(JSON.stringify(progressData), new Date().toISOString(), taskId).run();
  } catch (error) {
    console.error(`[Task ${taskId}] Failed to update progress:`, error);
  }
}

// Helper function to complete task
async function completeTask(db, taskId, result) {
  try {
    const progressData = {
      completed: 100,
      total: 100,
      phase: 'Completed',
    };

    await db.prepare(`
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
      new Date().toISOString(), 
      new Date().toISOString(), 
      taskId
    ).run();
  } catch (error) {
    console.error(`[Task ${taskId}] Failed to mark as completed:`, error);
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
      new Date().toISOString(), 
      new Date().toISOString(), 
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
          ai_generation_provider, validated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        JSON.stringify([category]), // categories is a JSON array
        difficulty,
        JSON.stringify([ageGroup]), // age_groups is a JSON array
        q.targetAudience || 'swedish',
        now,
        now,
        'ai-system',
        provider,
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
