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

    const now = new Date().toISOString();
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
