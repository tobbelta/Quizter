/**
 * Cloudflare Pages Function: Get Background Tasks
 * Retrieves background tasks for a user
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const limit = parseInt(url.searchParams.get('limit') || '100');

  try {
    console.log('[getBackgroundTasks] Fetching tasks for user:', userId);

    let query;
    if (userId) {
      // Get tasks for specific user
      query = env.DB.prepare(
        `SELECT * FROM background_tasks 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT ?`
      ).bind(userId, limit);
    } else {
      // Get all tasks (admin/superuser view)
      query = env.DB.prepare(
        `SELECT * FROM background_tasks 
         ORDER BY created_at DESC 
         LIMIT ?`
      ).bind(limit);
    }

    const { results } = await query.all();

    console.log(`[getBackgroundTasks] Found ${results.length} tasks`);

    // Transform to frontend format
    const tasks = results.map(row => ({
      id: row.id,
      userId: row.user_id,
      taskType: row.task_type,
      status: row.status,
      label: row.label,
      description: row.description,
      progress: row.progress,
      total: row.total,
      result: row.result ? JSON.parse(row.result) : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        tasks,
        count: tasks.length,
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
    console.error('[getBackgroundTasks] Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        tasks: [],
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-email',
    },
  });
}
