import { ensureAiRulesTable, getAiRulesConfig, saveAiRulesConfig } from '../../lib/aiRules.js';
import { logAuditEvent } from '../../lib/auditLogs.js';

const isSuperUserRequest = (request, env) => {
  const userEmail = request.headers.get('x-user-email');
  const superuserEmail = env.SUPERUSER_EMAIL || 'admin@admin.se';
  if (!userEmail) return false;
  return userEmail.toLowerCase() === superuserEmail.toLowerCase();
};

export async function onRequest(context) {
  const { request, env } = context;
  const { method } = request;

  await ensureAiRulesTable(env.DB);

  if (method === 'GET') {
    try {
      const config = await getAiRulesConfig(env.DB);
      return new Response(JSON.stringify({ success: true, config }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    } catch (error) {
      console.error('[ai-rules] GET error:', error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }

  if (method === 'POST') {
    if (!isSuperUserRequest(request, env)) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    try {
      const payload = await request.json();
      await saveAiRulesConfig(env.DB, payload?.config || {});
      const config = await getAiRulesConfig(env.DB);
      const actorEmail = request.headers.get('x-user-email');
      const globalConfig = config?.global || {};
      const targetAudiences = config?.targetAudiences || {};
      try {
        await logAuditEvent(env.DB, {
          actorEmail,
          action: 'update',
          targetType: 'ai-rules',
          details: {
            globalEnabled: globalConfig?.enabled !== false,
            answerInQuestion: Boolean(globalConfig?.answerInQuestion?.enabled ?? globalConfig?.answerInQuestion),
            autoCorrection: Boolean(globalConfig?.autoCorrection?.enabled),
            freshness: Boolean(globalConfig?.freshness?.enabled),
            blocklistCount: Array.isArray(globalConfig?.blocklist) ? globalConfig.blocklist.length : 0,
            maxLengthGroups: Object.keys(globalConfig?.maxQuestionLengthByAgeGroup || {}).length,
            targetAudienceCount: Object.keys(targetAudiences).length
          }
        });
      } catch (error) {
        console.warn('[ai-rules] Audit log failed:', error.message);
      }
      return new Response(JSON.stringify({ success: true, config }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    } catch (error) {
      console.error('[ai-rules] POST error:', error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }

  return new Response('Method not allowed', { status: 405 });
}
