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
    
    // Validate input
    if (!amount || !category || !provider || !ageGroup) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required parameters: amount, category, ageGroup, and provider are required' 
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
    
    await env.DB.prepare(`
      INSERT INTO background_tasks (
        id, user_id, task_type, status, label, description,
        progress, total, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      taskId,
      userEmail,
      'generation',
      'processing',
      'AI-generering',
      `Genererar ${amount} frågor om ${category} för ${ageGroup} med ${provider}`,
      0,
      100,
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
        generateIllustrations: generateIllustrations !== false // default true
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
  const { amount, category, ageGroup, difficulty, provider, generateIllustrations } = params;
  
  try {
    console.log(`[Task ${taskId}] Starting generation...`);
    
    // Update progress: 10%
    await updateTaskProgress(env.DB, taskId, 10, 'Preparing AI request...');
    
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
    await updateTaskProgress(env.DB, taskId, 30, `Generating with ${effectiveProvider}...`);
    
    // Generate questions using the selected provider
    const generatedQuestions = await selectedProvider.generateQuestions({
      amount,
      category,
      ageGroup,
      difficulty,
      targetAudience,
      language: 'sv'
    });
    
    console.log(`[Task ${taskId}] Generated ${generatedQuestions.length} questions`);
    
    // Update progress: 70%
    await updateTaskProgress(env.DB, taskId, 70, 'Saving questions to database...');
    
    // Save generated questions to D1 database
    const savedQuestions = await saveQuestionsToDatabase(env.DB, generatedQuestions, {
      category,
      difficulty,
      provider: effectiveProvider,
      model: selectedProvider.model,
      ageGroup,
      targetAudience,
      generateIllustrations
    });
    
    // Complete task
    await completeTask(env.DB, taskId, {
      success: true,
      questionsGenerated: savedQuestions.length,
      provider: effectiveProvider,
      model: selectedProvider.model,
      questions: savedQuestions
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

// Helper function to update task progress
async function updateTaskProgress(db, taskId, progress, description) {
  try {
    await db.prepare(`
      UPDATE background_tasks 
      SET progress = ?, description = ?, updated_at = ?
      WHERE id = ?
    `).bind(progress, description, Date.now(), taskId).run();
  } catch (error) {
    console.error(`[Task ${taskId}] Failed to update progress:`, error);
  }
}

// Helper function to complete task
async function completeTask(db, taskId, result) {
  const now = Date.now();
  try {
    await db.prepare(`
      UPDATE background_tasks 
      SET status = ?, progress = 100, result = ?, updated_at = ?, completed_at = ?
      WHERE id = ?
    `).bind('completed', JSON.stringify(result), now, now, taskId).run();
  } catch (error) {
    console.error(`[Task ${taskId}] Failed to mark as completed:`, error);
  }
}

// Helper function to fail task
async function failTask(db, taskId, errorMessage) {
  const now = Date.now();
  try {
    await db.prepare(`
      UPDATE background_tasks 
      SET status = ?, result = ?, updated_at = ?, completed_at = ?
      WHERE id = ?
    `).bind('failed', JSON.stringify({ error: errorMessage }), now, now, taskId).run();
  } catch (error) {
    console.error(`[Task ${taskId}] Failed to mark as failed:`, error);
  }
}

// Save questions to D1 database
async function saveQuestionsToDatabase(db, questions, metadata) {
  const { category, difficulty, provider, model, ageGroup, targetAudience } = metadata;
  const savedQuestions = [];
  
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
        category,
        difficulty,
        ageGroup,
        targetAudience,
        now,
        now,
        'ai-system',
        provider,
        model,
        false
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
        validated: false,
        provider,
        model
      });
    } catch (error) {
      console.error('[generateAIQuestions] Error saving question:', error);
      // Continue with other questions even if one fails
    }
  }
  
  console.log(`[generateAIQuestions] Saved ${savedQuestions.length}/${questions.length} questions to database`);
  return savedQuestions;
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
