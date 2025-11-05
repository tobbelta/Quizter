/**
 * Cloudflare Pages Function: Bulk Stop Tasks
 * Cancels multiple running background tasks
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

    console.log('[bulkStopTasks] Stopping tasks:', taskIds);

    let stopped = 0;
    const errors = [];

    for (const taskId of taskIds) {
      try {
        // Get current task
        const { results } = await env.DB.prepare(
          'SELECT * FROM background_tasks WHERE id = ?'
        )
          .bind(taskId)
          .all();

        if (results.length === 0) {
          errors.push(`Task ${taskId} not found`);
          continue;
        }

        const task = results[0];

        // Only stop tasks that are not already finished
        const finalStatuses = ['completed', 'failed', 'cancelled'];
        if (finalStatuses.includes(task.status)) {
          errors.push(`Task ${taskId} already ${task.status}`);
          continue;
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

        stopped++;
      } catch (error) {
        errors.push(`Failed to stop task ${taskId}: ${error.message}`);
      }
    }

    console.log('[bulkStopTasks] Stopped:', stopped, 'Errors:', errors.length);

    return new Response(
      JSON.stringify({
        success: true,
        stopped,
        total: taskIds.length,
        errors: errors.length > 0 ? errors : undefined,
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
    console.error('[bulkStopTasks] Error:', error);
    
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
