/**
 * Cloudflare Pages Function: Batch Update Questions
 * PUT /api/questions/batch-update
 * Update multiple questions at once
 */

export async function onRequestPut(context) {
  const { env, request } = context;

  try {
    const body = await request.json();
    const { updates } = body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'updates must be a non-empty array',
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

    console.log(`[questions/batch-update PUT] Updating ${updates.length} questions`);

    const now = new Date().toISOString();
    let updatedCount = 0;
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

    // Update each question
    for (const { questionId, updateData } of updates) {
      if (!questionId || !updateData) {
        console.warn('[questions/batch-update PUT] Skipping invalid update:', { questionId, updateData });
        continue;
      }

      // Build dynamic UPDATE query based on provided fields
      const fields = [];
      const values = [];

      // Handle all possible update fields
      if (updateData.validated !== undefined) {
        fields.push('validated = ?');
        values.push(updateData.validated ? 1 : 0);
      }
      if (updateData.aiValidated !== undefined) {
        fields.push('validated = ?');
        values.push(updateData.aiValidated ? 1 : 0);
      }
      if (updateData.aiValidationResult !== undefined) {
        fields.push('ai_validation_result = ?');
        values.push(updateData.aiValidationResult ? JSON.stringify(updateData.aiValidationResult) : null);
      }
      if (updateData.aiValidatedAt !== undefined) {
        fields.push('validation_generated_at = ?');
        values.push(updateData.aiValidatedAt ? new Date(updateData.aiValidatedAt).toISOString() : null);
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
        const value = updateData.bestBeforeAt !== undefined ? updateData.bestBeforeAt : updateData.best_before_at;
        fields.push('best_before_at = ?');
        values.push(normalizeTimestamp(value));
      }
      if (updateData.quarantined !== undefined) {
        fields.push('quarantined = ?');
        values.push(updateData.quarantined ? 1 : 0);
      }
      if (updateData.quarantinedAt !== undefined || updateData.quarantined_at !== undefined) {
        const value = updateData.quarantinedAt !== undefined ? updateData.quarantinedAt : updateData.quarantined_at;
        fields.push('quarantined_at = ?');
        values.push(normalizeTimestamp(value));
      }
      if (updateData.quarantineReason !== undefined || updateData.quarantine_reason !== undefined) {
        const value = updateData.quarantineReason !== undefined ? updateData.quarantineReason : updateData.quarantine_reason;
        fields.push('quarantine_reason = ?');
        values.push(value ?? null);
      }

      // Always update updated_at
      fields.push('updated_at = ?');
      values.push(now);

      if (fields.length === 0) {
        console.warn('[questions/batch-update PUT] No valid fields to update for:', questionId);
        continue;
      }

      // Add questionId at the end for WHERE clause
      values.push(questionId);

      const query = `UPDATE questions SET ${fields.join(', ')} WHERE id = ?`;
      
      await env.DB.prepare(query).bind(...values).run();
      updatedCount++;
    }

    console.log(`[questions/batch-update PUT] Successfully updated ${updatedCount} questions`);

    return new Response(
      JSON.stringify({
        success: true,
        count: updatedCount,
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
    console.error('[questions/batch-update PUT] Error:', error);
    
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
      'Access-Control-Allow-Methods': 'PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-email',
    },
  });
}
