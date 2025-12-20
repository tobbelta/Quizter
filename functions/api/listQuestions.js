/**
 * Cloudflare Pages Function: List Questions
 * Retrieves all questions from D1 database
 */

export async function onRequestGet(context) {
  const { env } = context;

  try {
    console.log('[listQuestions] Fetching questions from D1 database');

    // Ensure schema is compatible (especially important if local DB was initialized with older schema)
    const { ensureDatabase } = await import('../lib/ensureDatabase.js');
    await ensureDatabase(env.DB);

    // Query all questions from D1 database
    const { results } = await env.DB.prepare(
      `SELECT * FROM questions ORDER BY created_at DESC`
    ).all();

    console.log(`[listQuestions] Found ${results.length} questions`);

    // Transform database format to match frontend expectations
    const questions = results.map(row => ({
      id: row.id,
      // Legacy fields for backwards compatibility
      question: row.question_sv || row.question,
      options: JSON.parse(row.options_sv || row.options || '[]'),
      correctOption: row.correct_option ?? row.correctOption,
      explanation: row.explanation_sv || row.explanation || '',
      background: row.background_sv || row.background || '',
      // Bilingual structure
      languages: {
        sv: {
          text: row.question_sv || row.question || '',
          options: JSON.parse(row.options_sv || row.options || '[]'),
          explanation: row.explanation_sv || row.explanation || '',
          background: row.background_sv || ''
        },
        en: row.question_en ? {
          text: row.question_en || '',
          options: JSON.parse(row.options_en || '[]'),
          explanation: row.explanation_en || '',
          background: row.background_en || ''
        } : null
      },
      emoji: row.illustration_emoji || row.emoji || '❓',
      // Parse categories from JSON, default to ['Allmän'] if missing
      categories: row.categories ? JSON.parse(row.categories) : ['Allmän'],
      category: row.categories ? JSON.parse(row.categories)[0] : 'Allmän',
      ageGroups: row.age_groups ? JSON.parse(row.age_groups) : [],
      targetAudience: row.target_audience || 'swedish',
      difficulty: row.difficulty || 'medium',
      createdAt: row.created_at || row.createdAt,
      updatedAt: row.updated_at || row.updatedAt,
      createdBy: row.created_by || row.createdBy || 'system',
      aiGenerated: row.ai_generation_provider ? true : (row.aiGenerated === 1 || row.aiGenerated === true),
      validated: row.validated === 1 || row.validated === true,
      aiValidated: row.ai_validated === 1 || row.ai_validated === true,
      aiValidationResult: row.ai_validation_result ? JSON.parse(row.ai_validation_result) : null,
      aiValidatedAt: row.ai_validated_at || null,
      validationGeneratedAt: row.validation_generated_at || null,
      manuallyApproved: row.manually_approved === 1 || row.manuallyApproved === true,
      manuallyRejected: row.manually_rejected === 1 || row.manuallyRejected === true,
      reported: row.reported === 1 || row.reported === true,
      provider: row.ai_generation_provider || row.provider || null,
      model: row.ai_generation_model || row.model || null,
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
