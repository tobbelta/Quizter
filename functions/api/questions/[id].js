/**
 * Cloudflare Pages Function: Single Question Management
 * PUT /api/questions/[id] - Update a question
 * DELETE /api/questions/[id] - Delete a question
 */

/**
 * PUT: Update a single question
 */
export async function onRequestPut(context) {
  const { env, request, params } = context;
  const questionId = params.id;

  try {
    if (!questionId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'questionId is required',
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

    const updateData = await request.json();

    console.log(`[questions/[id] PUT] Updating question ${questionId}`);

    const hasField = (key) => Object.prototype.hasOwnProperty.call(updateData || {}, key);
    const readField = (primary, fallback) => {
      if (hasField(primary)) {
        return { present: true, value: updateData[primary] };
      }
      if (fallback && hasField(fallback)) {
        return { present: true, value: updateData[fallback] };
      }
      return { present: false, value: undefined };
    };
    const normalizeJsonArray = (value) => {
      if (value === undefined) {
        return undefined;
      }
      if (value === null) {
        return null;
      }
      if (Array.isArray(value)) {
        return JSON.stringify(value);
      }
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return JSON.stringify(parsed);
        } catch {
          return JSON.stringify([value]);
        }
      }
      return JSON.stringify(value);
    };

    const now = new Date().toISOString();
    const fields = [];
    const values = [];

    // Handle all possible update fields
    const questionSv = readField('question_sv', 'questionSv');
    if (questionSv.present) {
      fields.push('question_sv = ?');
      values.push(questionSv.value ?? null);
    }
    const questionEn = readField('question_en', 'questionEn');
    if (questionEn.present) {
      fields.push('question_en = ?');
      values.push(questionEn.value ?? null);
    }
    const optionsSv = readField('options_sv', 'optionsSv');
    const optionsSvValue = optionsSv.present ? normalizeJsonArray(optionsSv.value) : undefined;
    if (optionsSvValue !== undefined) {
      fields.push('options_sv = ?');
      values.push(optionsSvValue);
    }
    const optionsEn = readField('options_en', 'optionsEn');
    const optionsEnValue = optionsEn.present ? normalizeJsonArray(optionsEn.value) : undefined;
    if (optionsEnValue !== undefined) {
      fields.push('options_en = ?');
      values.push(optionsEnValue);
    }
    const correctOption = readField('correct_option', 'correctOption');
    if (correctOption.present) {
      let value = correctOption.value;
      if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        if (!Number.isNaN(parsed)) {
          value = parsed;
        }
      }
      fields.push('correct_option = ?');
      values.push(value);
    }
    const explanationSv = readField('explanation_sv', 'explanationSv');
    if (explanationSv.present) {
      fields.push('explanation_sv = ?');
      values.push(explanationSv.value ?? null);
    }
    const explanationEn = readField('explanation_en', 'explanationEn');
    if (explanationEn.present) {
      fields.push('explanation_en = ?');
      values.push(explanationEn.value ?? null);
    }
    const backgroundSv = readField('background_sv', 'backgroundSv');
    if (backgroundSv.present) {
      fields.push('background_sv = ?');
      values.push(backgroundSv.value ?? null);
    }
    const backgroundEn = readField('background_en', 'backgroundEn');
    if (backgroundEn.present) {
      fields.push('background_en = ?');
      values.push(backgroundEn.value ?? null);
    }
    const categoriesField = readField('categories', 'category');
    const categoriesValue = categoriesField.present ? normalizeJsonArray(categoriesField.value) : undefined;
    if (categoriesValue !== undefined) {
      fields.push('categories = ?');
      values.push(categoriesValue);
    }
    const ageGroupsField = readField('age_groups', 'ageGroups');
    const ageGroupsValue = ageGroupsField.present ? normalizeJsonArray(ageGroupsField.value) : undefined;
    if (ageGroupsValue !== undefined) {
      fields.push('age_groups = ?');
      values.push(ageGroupsValue);
    }
    const difficultyField = readField('difficulty');
    if (difficultyField.present) {
      fields.push('difficulty = ?');
      values.push(difficultyField.value ?? null);
    }
    const audienceField = readField('audience');
    if (audienceField.present) {
      fields.push('audience = ?');
      values.push(audienceField.value ?? null);
    }
    const targetAudienceField = readField('target_audience', 'targetAudience');
    if (targetAudienceField.present) {
      fields.push('target_audience = ?');
      values.push(targetAudienceField.value ?? null);
    }
    const sourceField = readField('source');
    if (sourceField.present) {
      fields.push('source = ?');
      values.push(sourceField.value ?? null);
    }
    const illustrationEmoji = readField('illustration_emoji', 'emoji');
    if (illustrationEmoji.present) {
      fields.push('illustration_emoji = ?');
      values.push(illustrationEmoji.value ?? null);
    }
    if (updateData.validated !== undefined) {
      fields.push('validated = ?');
      values.push(updateData.validated ? 1 : 0);
    }
    if (updateData.aiValidated !== undefined) {
      fields.push('ai_validated = ?');
      values.push(updateData.aiValidated ? 1 : 0);
    }
    if (updateData.aiValidationResult !== undefined) {
      fields.push('ai_validation_result = ?');
      values.push(updateData.aiValidationResult ? JSON.stringify(updateData.aiValidationResult) : null);
    }
    if (updateData.aiValidatedAt !== undefined) {
      fields.push('ai_validated_at = ?');
      values.push(updateData.aiValidatedAt ? new Date(updateData.aiValidatedAt).toISOString() : null);
    }
    if (updateData.validationGeneratedAt !== undefined) {
      fields.push('validation_generated_at = ?');
      values.push(updateData.validationGeneratedAt ? new Date(updateData.validationGeneratedAt).toISOString() : null);
    }
    if (updateData.structureValidationResult !== undefined) {
      fields.push('structure_validation_result = ?');
      values.push(updateData.structureValidationResult ? JSON.stringify(updateData.structureValidationResult) : null);
    }
    if (updateData.manuallyApproved !== undefined) {
      fields.push('manually_approved = ?');
      values.push(updateData.manuallyApproved ? 1 : 0);
    }
    if (updateData.manuallyRejected !== undefined) {
      fields.push('manually_rejected = ?');
      values.push(updateData.manuallyRejected ? 1 : 0);
    }
    if (updateData.manuallyApprovedAt !== undefined) {
      fields.push('manually_approved_at = ?');
      values.push(updateData.manuallyApprovedAt ? new Date(updateData.manuallyApprovedAt).toISOString() : null);
    }
    if (updateData.manuallyRejectedAt !== undefined) {
      fields.push('manually_rejected_at = ?');
      values.push(updateData.manuallyRejectedAt ? new Date(updateData.manuallyRejectedAt).toISOString() : null);
    }
    if (updateData.illustration !== undefined) {
      fields.push('illustration_svg = ?');
      values.push(updateData.illustration);
    }
    if (updateData.illustrationProvider !== undefined) {
      fields.push('illustration_provider = ?');
      values.push(updateData.illustrationProvider);
    }
    if (updateData.illustrationGeneratedAt !== undefined) {
      fields.push('illustration_generated_at = ?');
      values.push(updateData.illustrationGeneratedAt ? new Date(updateData.illustrationGeneratedAt).toISOString() : null);
    }
    if (updateData.emojiProvider !== undefined) {
      fields.push('illustration_provider = ?');
      values.push(updateData.emojiProvider);
    }
    if (updateData.emojiGeneratedAt !== undefined) {
      fields.push('illustration_generated_at = ?');
      values.push(updateData.emojiGeneratedAt ? new Date(updateData.emojiGeneratedAt).toISOString() : null);
    }
    if (updateData.reported !== undefined) {
      fields.push('reported = ?');
      values.push(updateData.reported ? 1 : 0);
    }
    if (updateData.reportCount !== undefined) {
      fields.push('report_count = ?');
      values.push(updateData.reportCount);
    }
    if (updateData.reports !== undefined) {
      fields.push('reports = ?');
      values.push(updateData.reports ? JSON.stringify(updateData.reports) : null);
    }
    if (updateData.reportResolvedAt !== undefined) {
      fields.push('report_resolved_at = ?');
      values.push(updateData.reportResolvedAt ? new Date(updateData.reportResolvedAt).toISOString() : null);
    }

    // Always update updated_at
    fields.push('updated_at = ?');
    values.push(now);

    if (fields.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No valid fields to update',
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

    // Add questionId at the end for WHERE clause
    values.push(questionId);

    const query = `UPDATE questions SET ${fields.join(', ')} WHERE id = ?`;
    
    const result = await env.DB.prepare(query).bind(...values).run();

    console.log(`[questions/[id] PUT] Updated question ${questionId}`);

    return new Response(
      JSON.stringify({
        success: true,
        updated: result.meta.changes > 0,
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
    console.error('[questions/[id] PUT] Error:', error);
    
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

/**
 * DELETE: Delete a single question
 */
export async function onRequestDelete(context) {
  const { env, params } = context;
  const questionId = params.id;

  try {
    if (!questionId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'questionId is required',
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

    console.log(`[questions/[id] DELETE] Deleting question ${questionId}`);

    const result = await env.DB.prepare('DELETE FROM questions WHERE id = ?').bind(questionId).run();

    console.log(`[questions/[id] DELETE] Deleted question ${questionId}`);

    return new Response(
      JSON.stringify({
        success: true,
        deleted: result.meta.changes > 0,
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
    console.error('[questions/[id] DELETE] Error:', error);
    
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
      'Access-Control-Allow-Methods': 'PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-email',
    },
  });
}
