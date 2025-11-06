/**
 * Cloudflare Pages Function: Subscribe to Background Task Updates
 * Server-Sent Events (SSE) endpoint for real-time task updates
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const taskId = url.searchParams.get('taskId');

  if (!taskId) {
    return new Response('Missing taskId parameter', { status: 400 });
  }

  // Create SSE stream
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Helper to send SSE message
  const sendEvent = async (data) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  // Start monitoring task
  context.waitUntil((async () => {
    try {
      let lastStatus = null;
      let attempts = 0;
      const maxAttempts = 150; // 150 attempts * 2 seconds = 5 minutes max

      // Poll database for updates (we'll optimize this with Durable Objects later if needed)
      const checkTask = async () => {
        try {
          const result = await env.DB.prepare(
            'SELECT * FROM background_tasks WHERE id = ?'
          ).bind(taskId).first();

          if (!result) {
            await sendEvent({ type: 'error', error: 'Task not found' });
            await writer.close();
            return true; // Stop checking
          }

          // Parse result
          const task = {
            id: result.id,
            status: result.status,
            progress: result.progress,
            description: result.description,
            result: result.result ? JSON.parse(result.result) : null,
          };

          // Send update if status or progress changed
          const currentStatus = `${task.status}-${task.progress}`;
          if (currentStatus !== lastStatus) {
            lastStatus = currentStatus;
            await sendEvent({
              type: 'update',
              task
            });
          }

          // Stop if task is complete or failed
          if (task.status === 'completed' || task.status === 'failed') {
            await sendEvent({
              type: task.status === 'completed' ? 'complete' : 'error',
              task
            });
            await writer.close();
            return true; // Stop checking
          }

          return false; // Continue checking
        } catch (error) {
          console.error('[subscribeToTask] Error checking task:', error);
          return false;
        }
      };

      // Check immediately
      const shouldStop = await checkTask();
      if (shouldStop) return;

      // Then check every 2 seconds
      const interval = setInterval(async () => {
        attempts++;
        
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          await sendEvent({ type: 'timeout', error: 'Task monitoring timeout' });
          await writer.close();
          return;
        }

        const shouldStop = await checkTask();
        if (shouldStop) {
          clearInterval(interval);
        }
      }, 2000);

    } catch (error) {
      console.error('[subscribeToTask] Fatal error:', error);
      await sendEvent({ type: 'error', error: error.message });
      await writer.close();
    }
  })());

  // Return SSE response
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
