/**
 * USERS API - Runs and answers for a user
 * GET /api/users/:id/runs
 */

import { ensureDatabase } from '../../../lib/ensureDatabase.js';

const safeJsonParse = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeTimestamp = (value) => {
  if (typeof value === 'number') {
    return value < 1e12 ? value * 1000 : value;
  }
  return value;
};

const normalizeRun = (run) => {
  if (!run) return null;
  return {
    id: run.id,
    name: run.name,
    joinCode: run.join_code,
    status: run.status,
    createdAt: normalizeTimestamp(run.created_at),
    updatedAt: normalizeTimestamp(run.updated_at),
    createdBy: run.created_by,
    questionIds: safeJsonParse(run.question_ids, []),
    checkpoints: safeJsonParse(run.checkpoints, []),
    route: safeJsonParse(run.route, null)
  };
};

const normalizeParticipant = (participant) => {
  if (!participant) return null;
  return {
    id: participant.id,
    runId: participant.run_id,
    userId: participant.user_id,
    alias: participant.alias,
    deviceId: participant.device_id || null,
    joinedAt: normalizeTimestamp(participant.joined_at),
    completedAt: normalizeTimestamp(participant.completed_at),
    lastSeen: normalizeTimestamp(participant.last_seen)
  };
};

const normalizeAnswer = (answer) => {
  if (!answer) return null;
  return {
    id: answer.id,
    participantId: answer.participant_id,
    questionId: answer.question_id,
    answerIndex: answer.answer_index,
    isCorrect: answer.is_correct === 1 || answer.is_correct === true,
    answeredAt: normalizeTimestamp(answer.answered_at)
  };
};

export async function onRequest(context) {
  const { request, env, params } = context;
  const { method } = request;

  if (method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const userId = params.id ? decodeURIComponent(params.id) : null;
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Missing user id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  await ensureDatabase(env.DB);

  const isDevice = userId.startsWith('device:');
  const isAnonymous = isDevice || userId.startsWith('anon:');
  const anonKey = userId.startsWith('anon:') ? userId.slice(5).trim() : null;
  const deviceKey = isDevice ? userId.slice(7).trim() : null;

  try {
    let participants = [];
    if (deviceKey) {
      const participantsResult = await env.DB.prepare(
        'SELECT * FROM participants WHERE device_id = ? ORDER BY joined_at DESC'
      ).bind(deviceKey).all();
      participants = participantsResult.results || [];
    } else if (anonKey) {
      const participant = await env.DB.prepare('SELECT * FROM participants WHERE id = ?')
        .bind(anonKey)
        .first();
      if (participant) {
        participants = [participant];
      } else if (anonKey) {
        const participantsResult = await env.DB.prepare(
          'SELECT * FROM participants WHERE LOWER(TRIM(alias)) = LOWER(?) ORDER BY joined_at DESC'
        ).bind(anonKey).all();
        participants = participantsResult.results || [];
      }
    } else {
      const participantsResult = await env.DB.prepare(
        'SELECT * FROM participants WHERE user_id = ? ORDER BY joined_at DESC'
      ).bind(userId).all();
      participants = participantsResult.results || [];
    }

    if (participants.length === 0) {
      return new Response(JSON.stringify({ userId, runs: [] }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const runIds = Array.from(new Set(participants.map((participant) => participant.run_id).filter(Boolean)));
    const runsById = new Map();
    if (runIds.length > 0) {
      const placeholders = runIds.map(() => '?').join(', ');
      const runsResult = await env.DB.prepare(
        `SELECT * FROM runs WHERE id IN (${placeholders})`
      ).bind(...runIds).all();
      (runsResult.results || []).forEach((run) => {
        runsById.set(run.id, normalizeRun(run));
      });
    }

    const participantIds = participants.map((participant) => participant.id);
    const answersByParticipant = new Map();
    if (participantIds.length > 0) {
      const placeholders = participantIds.map(() => '?').join(', ');
      const answersResult = await env.DB.prepare(
        `SELECT * FROM answers WHERE participant_id IN (${placeholders}) ORDER BY answered_at ASC`
      ).bind(...participantIds).all();
      (answersResult.results || []).forEach((answer) => {
        const normalized = normalizeAnswer(answer);
        if (!normalized) return;
        if (!answersByParticipant.has(normalized.participantId)) {
          answersByParticipant.set(normalized.participantId, []);
        }
        answersByParticipant.get(normalized.participantId).push(normalized);
      });
    }

    const runs = participants.map((participant) => {
      const run = runsById.get(participant.run_id) || null;
      const answers = answersByParticipant.get(participant.id) || [];
      const correctAnswers = answers.filter((answer) => answer.isCorrect).length;
      const totalQuestions = Array.isArray(run?.questionIds) ? run.questionIds.length : 0;

      return {
        run,
        participant: normalizeParticipant(participant),
        answers,
        correctAnswers,
        totalQuestions
      };
    });

    return new Response(JSON.stringify({
      userId,
      isAnonymous,
      runs
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[users/runs] Error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to load user runs',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
