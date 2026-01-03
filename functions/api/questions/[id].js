/**
 * Cloudflare Pages Function: Single Question Management
 * PUT /api/questions/[id] - Update a question
 * DELETE /api/questions/[id] - Delete a question
 */
import { recordQuestionFeedback } from '../../lib/questionFeedback.js';

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

    const parseJson = (value, fallback) => {
      if (!value) return fallback;
      try {
        return JSON.parse(value);
      } catch {
        return fallback;
      }
    };

    const preQuestion = await env.DB.prepare(
      'SELECT id, categories, age_groups, difficulty, target_audience, ai_generation_provider, ai_generation_model, ai_validation_result, reports FROM questions WHERE id = ?'
    ).bind(questionId).first();

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
    const normalizeTimestamp = (value) => {
      if (value === undefined) {
        return undefined;
      }
      if (value === null) {
        return null;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? null : parsed;
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
    if (updateData.timeSensitive !== undefined) {
      fields.push('time_sensitive = ?');
      values.push(updateData.timeSensitive ? 1 : 0);
    }
    if (updateData.bestBeforeAt !== undefined || updateData.best_before_at !== undefined) {
      const value = hasField('bestBeforeAt') ? updateData.bestBeforeAt : updateData.best_before_at;
      fields.push('best_before_at = ?');
      values.push(normalizeTimestamp(value));
    }
    if (updateData.quarantined !== undefined) {
      fields.push('quarantined = ?');
      values.push(updateData.quarantined ? 1 : 0);
    }
    if (updateData.quarantinedAt !== undefined || updateData.quarantined_at !== undefined) {
      const value = hasField('quarantinedAt') ? updateData.quarantinedAt : updateData.quarantined_at;
      fields.push('quarantined_at = ?');
      values.push(normalizeTimestamp(value));
    }
    if (updateData.quarantineReason !== undefined || updateData.quarantine_reason !== undefined) {
      const value = hasField('quarantineReason') ? updateData.quarantineReason : updateData.quarantine_reason;
      fields.push('quarantine_reason = ?');
      values.push(value ?? null);
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

    const actorEmail = String(request.headers.get('x-user-email') || '').trim();
    const normalizedActorEmail = actorEmail.toLowerCase();
    const isSuperUser = Boolean(
      normalizedActorEmail
      && env.SUPERUSER_EMAIL
      && normalizedActorEmail === String(env.SUPERUSER_EMAIL || '').trim().toLowerCase()
    );
    const actorUser = actorEmail
      ? await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(actorEmail).first()
      : null;

    const baseFeedbackMeta = preQuestion
      ? (() => {
          const categories = parseJson(preQuestion.categories, []);
          const ageGroups = parseJson(preQuestion.age_groups, []);
          return {
            category: Array.isArray(categories) ? categories[0] : categories,
            ageGroup: Array.isArray(ageGroups) ? ageGroups[0] : ageGroups,
            difficulty: preQuestion.difficulty || null,
            targetAudience: preQuestion.target_audience || null,
            generationProvider: preQuestion.ai_generation_provider || null,
            generationModel: preQuestion.ai_generation_model || null
          };
        })()
      : {};

    const aiValidation = preQuestion?.ai_validation_result
      ? parseJson(preQuestion.ai_validation_result, null)
      : null;
    const aiValidationType = aiValidation?.validationType || null;
    const aiValidationProvider = aiValidation?.validationContext?.validationProvider || null;
    const aiValid = typeof aiValidation?.isValid === 'boolean'
      ? aiValidation.isValid
      : typeof aiValidation?.valid === 'boolean'
        ? aiValidation.valid
        : null;

    const manualApproved = updateData.manuallyApproved === true;
    const manualRejected = updateData.manuallyRejected === true;

    if (manualApproved || manualRejected) {
      const verdict = manualApproved ? 'approve' : 'reject';
      const reasonIssues = (() => {
        if (manualRejected) {
          const manualIssues = Array.isArray(updateData?.aiValidationResult?.issues)
            ? updateData.aiValidationResult.issues
            : [];
          if (manualIssues.length > 0) return manualIssues;
        }
        return [];
      })();

      try {
        await recordQuestionFeedback(env, {
          questionId,
          feedbackType: 'question',
          rating: manualApproved ? 5 : 1,
          verdict,
          issues: reasonIssues,
          comment: manualRejected && reasonIssues.length === 0 ? 'Manuellt underkänd' : null,
          userId: actorUser?.id || null,
          userEmail: actorEmail || null,
          userRole: isSuperUser ? 'superuser' : actorEmail ? 'user' : null,
          ...baseFeedbackMeta,
          validationProvider: aiValidationProvider || null
        });
      } catch (feedbackError) {
        console.warn('[questions/[id] PUT] Kunde inte logga manuell feedback:', feedbackError.message);
      }

      if (aiValidationType && aiValidationType !== 'manual' && aiValid !== null) {
        const matches = manualApproved ? aiValid === true : aiValid === false;
        const validationIssues = matches
          ? []
          : [manualApproved ? 'falsk_underkänn' : 'falsk_godkänn', manualApproved ? 'för_strikt' : 'för_slapp'];
        try {
          await recordQuestionFeedback(env, {
            questionId,
            feedbackType: 'validation',
            rating: matches ? 5 : 1,
            verdict: matches ? 'approve' : 'reject',
            issues: validationIssues,
            comment: matches ? null : 'Manuell override av AI-validering',
            userId: actorUser?.id || null,
            userEmail: actorEmail || null,
            userRole: isSuperUser ? 'superuser' : actorEmail ? 'user' : null,
            ...baseFeedbackMeta,
            validationProvider: aiValidationProvider || null
          });
        } catch (feedbackError) {
          console.warn('[questions/[id] PUT] Kunde inte logga valideringsfeedback:', feedbackError.message);
        }
      }
    }

    if (updateData.reports !== undefined && preQuestion) {
      const previousReports = Array.isArray(parseJson(preQuestion.reports, []))
        ? parseJson(preQuestion.reports, [])
        : [];
      const incomingReports = Array.isArray(updateData.reports)
        ? updateData.reports
        : parseJson(updateData.reports, []);
      if (Array.isArray(incomingReports) && incomingReports.length > previousReports.length) {
        const latestReport = incomingReports[incomingReports.length - 1] || {};
        const reportReason = latestReport.reason || latestReport.message || null;
        try {
          await recordQuestionFeedback(env, {
            questionId,
            feedbackType: 'question',
            rating: 1,
            verdict: 'reject',
            issues: reportReason ? [reportReason] : [],
            comment: reportReason || 'Rapporterad fråga',
            userRole: 'player',
            ...baseFeedbackMeta,
            validationProvider: aiValidationProvider || null
          });
        } catch (feedbackError) {
          console.warn('[questions/[id] PUT] Kunde inte logga rapport-feedback:', feedbackError.message);
        }
      }
    }

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
