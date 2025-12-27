/**
 * Cloudflare Pages Function: Questions Management
 * Handles batch operations on questions (add, update, delete)
 * 
 * Endpoints:
 * - POST /api/questions - Get questions by IDs
 * - POST /api/questions/batch - Add multiple questions
 * - PUT /api/questions/batch-update - Update multiple questions
 * - DELETE /api/questions/batch-delete - Delete multiple questions
 */

/**
 * POST: Get questions by IDs
 */
export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ids must be a non-empty array',
          questions: [],
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    console.log(`[questions POST] Fetching ${ids.length} questions by IDs`);

    // Build query with placeholders
    const placeholders = ids.map(() => '?').join(',');
    const query = `SELECT * FROM questions WHERE id IN (${placeholders})`;

    const { results } = await env.DB.prepare(query).bind(...ids).all();

    console.log(`[questions POST] Found ${results.length} questions`);

    // Transform to frontend format
    const questions = results.map(transformQuestionFromDb);

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
    console.error('[questions POST] Error:', error);
    
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
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-email',
    },
  });
}

/**
 * Transform database row to frontend format
 */
function transformQuestionFromDb(row) {
  // Parse JSON fields
  const optionsSv = JSON.parse(row.options_sv || '[]');
  const optionsEn = JSON.parse(row.options_en || '[]');
  const categories = JSON.parse(row.categories || '["Allmänt"]');
  const ageGroups = JSON.parse(row.age_groups || '["adults"]');
  const aiValidationResult = row.ai_validation_result ? JSON.parse(row.ai_validation_result) : null;
  const structureValidationResult = row.structure_validation_result ? JSON.parse(row.structure_validation_result) : null;
  const bestBeforeAt = row.best_before_at || null;
  const now = Date.now();
  const isExpired = bestBeforeAt ? Number(bestBeforeAt) <= now : false;
  const quarantined = row.quarantined === 1 || row.quarantined === true || isExpired;

  return {
    id: row.id,
    languages: {
      sv: {
        text: row.question_sv || '',
        options: optionsSv,
        explanation: row.explanation_sv || '',
        background: row.background_sv || ''
      },
      en: {
        text: row.question_en || row.question_sv || '',
        options: optionsEn.length === 4 ? optionsEn : optionsSv,
        explanation: row.explanation_en || row.explanation_sv || '',
        background: row.background_en || row.background_sv || ''
      }
    },
    correctOption: row.correct_option,
    categories: categories,
    ageGroups: ageGroups,
    targetAudience: row.target_audience || 'swedish',
    difficulty: row.difficulty || 'medium',
    illustration: row.illustration_svg || null,
    illustrationProvider: row.illustration_provider || null,
    illustrationGeneratedAt: row.illustration_generated_at ? new Date(row.illustration_generated_at) : null,
    aiGenerated: row.ai_generation_provider ? true : (row.ai_generated === 1 || row.ai_generated === true),
    aiGenerationProvider: row.ai_generation_provider || null,
    aiGenerationModel: row.ai_generation_model || null,
    validated: row.validated === 1 || row.validated === true,
    aiValidationResult: aiValidationResult,
    structureValidationResult: structureValidationResult,
    validatedAt: row.validation_generated_at ? new Date(row.validation_generated_at) : null,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    createdBy: row.created_by || 'system',
    timeSensitive: row.time_sensitive === 1 || row.time_sensitive === true,
    bestBeforeAt: bestBeforeAt,
    quarantined: quarantined,
    quarantinedAt: row.quarantined_at ? new Date(row.quarantined_at) : null,
    quarantineReason: row.quarantine_reason || (isExpired ? 'expired' : null),
    isExpired: isExpired,
  };
}
