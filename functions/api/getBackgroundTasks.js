/**
 * Cloudflare Pages Function: Get Background Tasks
 * Retrieves background tasks for a user
 */

import { markStaleBackgroundTasks } from '../lib/backgroundTaskWatchdog.js';

const scheduleValidationContinuation = async (env, origin, endpointPath, taskId) => {
  if (!origin || !taskId) return false;
  try {
    const url = new URL(endpointPath || '/api/generateAIQuestions', origin);
    const headers = { 'Content-Type': 'application/json' };
    if (env.INTERNAL_TASK_SECRET) {
      headers['x-task-secret'] = env.INTERNAL_TASK_SECRET;
    }
    await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mode: 'validate',
        taskId
      })
    });
    return true;
  } catch (error) {
    console.warn('[getBackgroundTasks] Failed to schedule validation continuation:', error.message);
    return false;
  }
};

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const taskId = url.searchParams.get('taskId');
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const origin = url.origin;
  const now = Date.now();
  const scheduledTasks = [];

  try {
    console.log('[getBackgroundTasks] Fetching tasks:', { userId, taskId });
    await markStaleBackgroundTasks(env.DB, { userId, taskId });

    let query;
    if (taskId) {
      query = env.DB.prepare(
        `SELECT * FROM background_tasks
         WHERE id = ?
         LIMIT 1`
      ).bind(taskId);
    } else if (userId) {
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
      payload: row.payload ? JSON.parse(row.payload) : null,
      progress: row.progress ? JSON.parse(row.progress) : null,
      result: row.result ? JSON.parse(row.result) : null,
      error: row.error,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    }));

    for (const task of tasks) {
      if (!task.progress || task.taskType !== 'validate_questions') continue;
      if (!['running', 'processing', 'pending'].includes(task.status)) continue;
      const details = task.progress.details || {};
      const totalCount = Number(details.totalCount || task.progress.total || 0);
      const nextIndex = Number(details.nextIndex ?? 0);
      const nextValidationAt = Number(details.nextValidationAt || 0);
      const lastKickAt = Number(details.lastKickAt || 0);
      if (!totalCount || nextIndex >= totalCount) continue;
      if (nextValidationAt && nextValidationAt > now) continue;
      if (now - lastKickAt < 5000) continue;
      const payload = task.payload || {};
      const scheduled = await scheduleValidationContinuation(
        env,
        payload.origin || origin,
        payload.endpointPath,
        task.id
      );
      if (scheduled) {
        scheduledTasks.push(task.id);
        await env.DB.prepare(`
          UPDATE background_tasks
          SET progress = ?, updated_at = ?
          WHERE id = ?
        `).bind(
          JSON.stringify({
            ...task.progress,
            details: {
              ...details,
              lastKickAt: now
            }
          }),
          now,
          task.id
        ).run();
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        tasks,
        count: tasks.length,
        scheduledTasks
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
