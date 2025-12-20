/**
 * Cloudflare Pages Function: Batch Add Questions
 * POST /api/questions/batch
 * Add multiple questions to the database at once
 */

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const body = await request.json();
    const { questions } = body;

    if (!Array.isArray(questions) || questions.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'questions must be a non-empty array',
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

    console.log(`[questions/batch POST] Adding ${questions.length} questions`);

    const now = new Date().toISOString();
    const insertedIds = [];

    // Insert each question
    for (const question of questions) {
      const id = question.id || `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Extract language data
      const langSv = question.languages?.sv || {
        text: question.text || '',
        options: question.options || [],
        explanation: question.explanation || '',
        background: question.background || ''
      };
      const langEn = question.languages?.en || langSv;

      const categories = JSON.stringify(question.categories || ['Allmänt']);
      const ageGroups = JSON.stringify(question.ageGroups || ['adults']);
      const optionsSv = JSON.stringify(langSv.options);
      const optionsEn = JSON.stringify(langEn.options);

      await env.DB.prepare(`
        INSERT INTO questions (
          id, question_sv, question_en, options_sv, options_en,
          explanation_sv, explanation_en, background_sv, background_en, correct_option,
          categories, age_groups, target_audience, difficulty,
          illustration_svg, illustration_provider, illustration_generated_at,
          ai_generated, ai_generation_provider, ai_generation_model,
          validated, ai_validation_result, validation_generated_at,
          structure_validation_result,
          created_at, updated_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        langSv.text,
        langEn.text,
        optionsSv,
        optionsEn,
        langSv.explanation,
        langEn.explanation,
        langSv.background || '',
        langEn.background || langSv.background || '',
        question.correctOption || 0,
        categories,
        ageGroups,
        question.targetAudience || 'swedish',
        question.difficulty || 'medium',
        question.illustration || null,
        question.illustrationProvider || null,
        question.illustrationGeneratedAt ? new Date(question.illustrationGeneratedAt).toISOString() : null,
        question.aiGenerated ? 1 : 0,
        question.aiGenerationProvider || null,
        question.aiGenerationModel || null,
        question.validated ? 1 : (question.aiValidated ? 1 : 0),
        question.aiValidationResult ? JSON.stringify(question.aiValidationResult) : null,
        question.validatedAt ? new Date(question.validatedAt).toISOString() : null,
        question.structureValidationResult ? JSON.stringify(question.structureValidationResult) : null,
        question.createdAt ? new Date(question.createdAt).toISOString() : now,
        now,
        question.createdBy || 'system'
      ).run();

      insertedIds.push(id);
    }

    console.log(`[questions/batch POST] Successfully added ${insertedIds.length} questions`);

    return new Response(
      JSON.stringify({
        success: true,
        count: insertedIds.length,
        ids: insertedIds,
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
    console.error('[questions/batch POST] Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-email',
    },
  });
}
