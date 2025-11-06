/**
 * Cloudflare Pages Function: Delete Task
 * Permanently deletes a background task from the database
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { taskId } = await request.json();

    if (!taskId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'taskId is required',
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

    console.log('[deleteTask] Deleting task:', taskId);

    // Check if task exists
    const { results } = await env.DB.prepare(
      'SELECT id FROM background_tasks WHERE id = ?'
    )
      .bind(taskId)
      .all();

    if (results.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Task not found',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Delete the task
    await env.DB.prepare('DELETE FROM background_tasks WHERE id = ?')
      .bind(taskId)
      .run();

    console.log('[deleteTask] Task deleted:', taskId);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Task deleted successfully',
        taskId,
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
    console.error('[deleteTask] Error:', error);
    
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
