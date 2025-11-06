/**
 * Cloudflare Pages Function: Batch Delete Questions
 * DELETE /api/questions/batch-delete
 * Delete multiple questions at once
 */

export async function onRequestDelete(context) {
  const { env, request } = context;

  try {
    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ids must be a non-empty array',
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

    console.log(`[questions/batch-delete DELETE] Deleting ${ids.length} questions`);

    // Build query with placeholders
    const placeholders = ids.map(() => '?').join(',');
    const query = `DELETE FROM questions WHERE id IN (${placeholders})`;

    const result = await env.DB.prepare(query).bind(...ids).run();

    console.log(`[questions/batch-delete DELETE] Deleted ${result.meta.changes} questions`);

    return new Response(
      JSON.stringify({
        success: true,
        count: result.meta.changes,
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
    console.error('[questions/batch-delete DELETE] Error:', error);
    
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
      'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-email',
    },
  });
}
