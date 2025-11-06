/**
 * Cloudflare Pages Function: Stop Task
 * Cancels a running background task
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

    console.log('[stopTask] Stopping task:', taskId);

    // Get current task
    const { results } = await env.DB.prepare(
      'SELECT * FROM background_tasks WHERE id = ?'
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

    const task = results[0];

    // Only allow stopping tasks that are not already finished
    const finalStatuses = ['completed', 'failed', 'cancelled'];
    if (finalStatuses.includes(task.status)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Cannot stop task with status: ${task.status}`,
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

    // Update task status to cancelled
    await env.DB.prepare(
      `UPDATE background_tasks 
       SET status = ?, 
           finished_at = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind('cancelled', new Date().toISOString(), new Date().toISOString(), taskId)
      .run();

    console.log('[stopTask] Task cancelled:', taskId);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Task cancelled successfully',
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
    console.error('[stopTask] Error:', error);
    
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
