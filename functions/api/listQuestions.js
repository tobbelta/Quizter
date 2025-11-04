/**
 * Cloudflare Pages Function: List Questions
 * Retrieves all questions from D1 database
 */

export async function onRequestGet(context) {
  const { env } = context;

  try {
    console.log('[listQuestions] Fetching questions from D1 database');

    // Query all questions from D1 database
    const { results } = await env.DB.prepare(
      `SELECT * FROM questions ORDER BY createdAt DESC`
    ).all();

    console.log(`[listQuestions] Found ${results.length} questions`);

    // Transform database format to match frontend expectations
    const questions = results.map(row => ({
      id: row.id,
      question: row.question,
      options: JSON.parse(row.options || '[]'),
      correctOption: row.correctOption,
      explanation: row.explanation || '',
      emoji: row.emoji || '❓',
      category: row.category || 'Allmän',
      difficulty: row.difficulty || 'medium',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy || 'system',
      aiGenerated: row.aiGenerated === 1 || row.aiGenerated === true,
      validated: row.validated === 1 || row.validated === true,
      provider: row.provider || null,
      model: row.model || null,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        questions,
        count: questions.length,
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
    console.error('[listQuestions] Error fetching questions:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        questions: [],
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

// Handle CORS preflight
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
