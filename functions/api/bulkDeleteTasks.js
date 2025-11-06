/**
 * Cloudflare Pages Function: Bulk Delete Tasks
 * Permanently deletes multiple background tasks from the database
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { taskIds } = await request.json();

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'taskIds array is required',
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

    console.log('[bulkDeleteTasks] Deleting tasks:', taskIds);

    // Build placeholders for SQL IN clause
    const placeholders = taskIds.map(() => '?').join(',');
    
    // Delete all tasks in one query
    const result = await env.DB.prepare(
      `DELETE FROM background_tasks WHERE id IN (${placeholders})`
    )
      .bind(...taskIds)
      .run();

    const deleted = result.meta?.changes || 0;

    console.log('[bulkDeleteTasks] Deleted:', deleted, 'tasks');

    return new Response(
      JSON.stringify({
        success: true,
        deleted,
        total: taskIds.length,
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
    console.error('[bulkDeleteTasks] Error:', error);
    
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
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
