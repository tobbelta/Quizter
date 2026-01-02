/**
 * Cloudflare Pages Function: Subscribe to Background Tasks
 * SSE endpoint for task list updates (user or global).
 */

import { ensureDatabase } from '../lib/ensureDatabase.js';
import { markStaleBackgroundTasks } from '../lib/backgroundTaskWatchdog.js';

const buildQuery = (env, { userId, taskType, limit }) => {
  let query = '';
  const params = [];

  if (userId) {
    query = `
      SELECT * FROM background_tasks
      WHERE user_id = ?
    `;
    params.push(userId);
  } else {
    query = `
      SELECT * FROM background_tasks
      WHERE 1 = 1
    `;
  }

  if (taskType) {
    query += ' AND task_type = ?';
    params.push(taskType);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  return env.DB.prepare(query).bind(...params);
};

const transformTask = (row) => ({
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
  createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
});

const buildSignature = (tasks) => tasks
  .map((task) => `${task.id}:${task.status}:${task.updatedAt || ''}`)
  .join('|');

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const taskType = url.searchParams.get('taskType');
  const limit = Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10));

  await ensureDatabase(env.DB);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  let isClosed = false;
  let lastSignature = null;
  const pollIntervalMs = 3000;

  const sendSnapshot = async (tasks) => {
    if (isClosed) return;
    const payload = {
      success: true,
      tasks,
      count: tasks.length,
    };
    await writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  };

  const fetchTasks = async () => {
    await markStaleBackgroundTasks(env.DB, { userId });
    const query = buildQuery(env, { userId, taskType, limit });
    const { results } = await query.all();
    return (results || []).map(transformTask);
  };

  const poll = async () => {
    if (isClosed) return;
    try {
      const tasks = await fetchTasks();
      const signature = buildSignature(tasks);
      if (signature !== lastSignature) {
        lastSignature = signature;
        await sendSnapshot(tasks);
      }
    } catch (error) {
      console.error('[subscribeToTasks] Failed to fetch tasks:', error);
    }
  };

  poll();

  const interval = setInterval(poll, pollIntervalMs);

  request.signal?.addEventListener('abort', () => {
    isClosed = true;
    clearInterval(interval);
    writer.close();
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

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
