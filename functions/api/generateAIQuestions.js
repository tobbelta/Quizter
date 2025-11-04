/**
 * Cloudflare Pages Function - Generate AI Questions
 * Generates quiz questions using OpenAI, Gemini, or Anthropic
 */

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { amount, category, ageGroup, difficulty, provider } = await request.json();
    
    // Validate input
    if (!amount || !category || !difficulty || !provider) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required parameters' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get API key based on provider
    let apiKey;
    let generatedQuestions = [];
    
    switch (provider.toLowerCase()) {
      case 'openai':
        apiKey = env.OPENAI_API_KEY;
        generatedQuestions = await generateWithOpenAI(apiKey, { amount, category, ageGroup, difficulty });
        break;
      case 'gemini':
        apiKey = env.GEMINI_API_KEY;
        generatedQuestions = await generateWithGemini(apiKey, { amount, category, ageGroup, difficulty });
        break;
      case 'anthropic':
        apiKey = env.ANTHROPIC_API_KEY;
        generatedQuestions = await generateWithAnthropic(apiKey, { amount, category, ageGroup, difficulty });
        break;
      default:
        return new Response(JSON.stringify({ 
          success: false, 
          error: `Unknown provider: ${provider}` 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }
    
    if (!apiKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `API key not configured for provider: ${provider}` 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ 
      success: true,
      taskId: `task_${Date.now()}`, // Placeholder task ID
      questions: generatedQuestions
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Error generating AI questions:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
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
