/**
 * Cloudflare Pages Function - Generate AI Questions
 * Generates quiz questions using OpenAI, Gemini, or Anthropic
 */

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { amount, category, ageGroup, difficulty, provider } = await request.json();
    const userEmail = request.headers.get('x-user-email') || 'anonymous';
    
    console.log('[generateAIQuestions] Request:', { amount, category, ageGroup, difficulty, provider, userEmail });
    
    // Validate input - difficulty is optional, defaults to 'medium'
    if (!amount || !category || !provider) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required parameters: amount, category, and provider are required' 
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
      `Genererar ${amount} frågor om ${category} med ${provider}`,
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
    await updateTaskProgress(env.DB, taskId, 10, 'Preparing AI request...');
    
    // Use default difficulty if not provided
    const effectiveDifficulty = difficulty || 'medium';
    
    // Handle 'random' provider by picking one randomly
    let effectiveProvider = provider.toLowerCase();
    if (effectiveProvider === 'random') {
      const availableProviders = [];
      if (env.OPENAI_API_KEY) availableProviders.push('openai');
      if (env.GEMINI_API_KEY) availableProviders.push('gemini');
      if (env.ANTHROPIC_API_KEY) availableProviders.push('anthropic');
      if (env.MISTRAL_API_KEY) availableProviders.push('mistral');
      
      if (availableProviders.length === 0) {
        throw new Error('No AI providers are configured');
      }
      
      effectiveProvider = availableProviders[Math.floor(Math.random() * availableProviders.length)];
      console.log(`[Task ${taskId}] Random provider selected: ${effectiveProvider}`);
    }
    
    // Update progress: 30%
    await updateTaskProgress(env.DB, taskId, 30, `Generating with ${effectiveProvider}...`);
    
    // Get API key based on provider
    let apiKey;
    let generatedQuestions = [];
    
    switch (effectiveProvider) {
      case 'openai':
        apiKey = env.OPENAI_API_KEY;
        generatedQuestions = await generateWithOpenAI(apiKey, { amount, category, ageGroup, difficulty: effectiveDifficulty });
        break;
      case 'gemini':
        apiKey = env.GEMINI_API_KEY;
        generatedQuestions = await generateWithGemini(apiKey, { amount, category, ageGroup, difficulty: effectiveDifficulty });
        break;
      case 'anthropic':
        apiKey = env.ANTHROPIC_API_KEY;
        generatedQuestions = await generateWithAnthropic(apiKey, { amount, category, ageGroup, difficulty: effectiveDifficulty });
        break;
      case 'mistral':
        apiKey = env.MISTRAL_API_KEY;
        generatedQuestions = await generateWithMistral(apiKey, { amount, category, ageGroup, difficulty: effectiveDifficulty });
        break;
      default:
        throw new Error(`Unknown provider: ${effectiveProvider}`);
    }
    
    if (!apiKey) {
      throw new Error(`API key not configured for provider: ${effectiveProvider}`);
    }
    
    // Update progress: 70%
    await updateTaskProgress(env.DB, taskId, 70, 'Saving questions to database...');
    
    // Save generated questions to D1 database
    const savedQuestions = await saveQuestionsToDatabase(env.DB, generatedQuestions, {
      category,
      difficulty: effectiveDifficulty,
      provider: effectiveProvider,
      model: getModelName(effectiveProvider)
    });
    
    // Complete task
    await completeTask(env.DB, taskId, {
      success: true,
      questionsGenerated: savedQuestions.length,
      provider: effectiveProvider,
      questions: savedQuestions
    });
    
    console.log(`[Task ${taskId}] Completed successfully: ${savedQuestions.length} questions`);
    
  } catch (error) {
    console.error(`[Task ${taskId}] Failed:`, error);
    
    // Mark task as failed
    await failTask(env.DB, taskId, error.message);
  }
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

// OpenAI implementation
async function generateWithOpenAI(apiKey, params) {
  const { amount, category, ageGroup, difficulty } = params;
  
  const prompt = buildPrompt(category, ageGroup, difficulty, amount);
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Du är en expert på att skapa pedagogiska quizfrågor på svenska.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    })
  });
  
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  const content = JSON.parse(data.choices[0].message.content);
  return content.questions || [];
}

// Gemini implementation
async function generateWithGemini(apiKey, params) {
  const { amount, category, ageGroup, difficulty } = params;
  
  const prompt = buildPrompt(category, ageGroup, difficulty, amount);
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `Du är en expert på att skapa pedagogiska quizfrågor på svenska.\n\n${prompt}\n\nSvara med JSON-format.`
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: 'application/json'
      }
    })
  });
  
  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  const content = JSON.parse(data.candidates[0].content.parts[0].text);
  return content.questions || [];
}

// Anthropic implementation
async function generateWithAnthropic(apiKey, params) {
  const { amount, category, ageGroup, difficulty } = params;
  
  const prompt = buildPrompt(category, ageGroup, difficulty, amount);
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Du är en expert på att skapa pedagogiska quizfrågor på svenska.\n\n${prompt}\n\nSvara med JSON-format.`
      }]
    })
  });
  
  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  const content = JSON.parse(data.content[0].text);
  return content.questions || [];
}

// Mistral implementation
async function generateWithMistral(apiKey, params) {
  const { amount, category, ageGroup, difficulty } = params;
  
  const prompt = buildPrompt(category, ageGroup, difficulty, amount);
  
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: 'Du är en expert på att skapa pedagogiska quizfrågor på svenska.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    })
  });
  
  if (!response.ok) {
    throw new Error(`Mistral API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  const content = JSON.parse(data.choices[0].message.content);
  return content.questions || [];
}

// Build prompt for question generation
function buildPrompt(category, ageGroup, difficulty, amount) {
  const difficultyMap = {
    'easy': 'lätt',
    'medium': 'medel',
    'hard': 'svår'
  };
  
  return `Skapa ${amount} quizfrågor om ${category} för åldersgrupp ${ageGroup} med svårighetsgrad ${difficultyMap[difficulty] || difficulty}.

Varje fråga ska ha:
- En tydlig fråga på svenska
- 4 svarsalternativ
- Markera vilket alternativ som är rätt (0-3)
- En kort förklaring av svaret
- En passande emoji som illustration

Returnera JSON i följande format:
{
  "questions": [
    {
      "question": "Frågan här?",
      "options": ["Alt 1", "Alt 2", "Alt 3", "Alt 4"],
      "correctOption": 0,
      "explanation": "Förklaring här",
      "emoji": "🎯"
    }
  ]
}`;
}

// Get model name for each provider
function getModelName(provider) {
  const models = {
    'openai': 'gpt-4o-mini',
    'gemini': 'gemini-1.5-flash',
    'anthropic': 'claude-3-5-sonnet-20241022',
    'mistral': 'mistral-small-latest'
  };
  return models[provider.toLowerCase()] || 'unknown';
}

// Save questions to D1 database
async function saveQuestionsToDatabase(db, questions, metadata) {
  const { category, difficulty, provider, model } = metadata;
  const savedQuestions = [];
  
  for (const q of questions) {
    const id = `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    try {
      await db.prepare(`
        INSERT INTO questions (
          id, question_sv, options_sv, correct_option, explanation_sv, illustration_emoji,
          categories, difficulty, created_at, updated_at, created_by,
          ai_generation_provider, validated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        q.question,
        JSON.stringify(q.options),
        q.correctOption,
        q.explanation || '',
        q.emoji || '❓',
        category,
        difficulty,
        now,
        now,
        'ai-system',
        provider,
        false
      ).run();
      
      savedQuestions.push({
        id,
        ...q,
        category,
        difficulty,
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
