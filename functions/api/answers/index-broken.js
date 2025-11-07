/**
 * ANSWERS API ENDPOINTS
 * 
 * Handles participant answers and results for game sessions
 * Migrated from Firebase Firestore to Cloudflare D1 database
 */

import { ensureDatabase } from '../../lib/ensureDatabase.js';
import { triggerBroadcast } from '../sse/index.js';

export async function onRequest(context) {
  const { request, env } = context;
  const { method, url } = request;
  const { pathname } = new URL(url);

  // Initialize database
  await ensureDatabase(env.DB);

  // Parse path segments
  const pathSegments = pathname.split('/').filter(Boolean);
  const answerId = pathSegments[2]; // /api/answers/{answerId}

  try {
    switch (method) {
      case 'GET':
        if (!answerId) {
          // GET /api/answers?participantId=xxx or ?runId=xxx - List answers
          const urlParams = new URL(url).searchParams;
          const participantId = urlParams.get('participantId');
          const runId = urlParams.get('runId');
          
          if (participantId) {
            return await getParticipantAnswers(env.DB, participantId);
          } else if (runId) {
            return await getRunAnswers(env.DB, runId);
          }
          
          return new Response(JSON.stringify({ 
            error: 'participantId or runId parameter required' 
          }), { 
            status: 400, 
            headers: { 'Content-Type': 'application/json' }
          });
          
        } else {
          // GET /api/answers/{id} - Get specific answer
          return await getAnswer(env.DB, answerId);
        }

      case 'POST':
        if (!answerId) {
          // POST /api/answers - Record new answer
          const body = await request.json();
          return await recordAnswer(env.DB, body);
        }
        break;

      case 'PUT':
        if (answerId) {
          // PUT /api/answers/{id} - Update answer (usually not needed in quiz games)
          const body = await request.json();
          return await updateAnswer(env.DB, answerId, body);
        }
        break;

      case 'DELETE':
        if (answerId) {
          // DELETE /api/answers/{id} - Delete answer
          return await deleteAnswer(env.DB, answerId);
        }
        break;

      default:
        return new Response('Method not allowed', { status: 405 });
    }

    return new Response('Not found', { status: 404 });

  } catch (error) {
    console.error('[answers] Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error', 
      details: error.message 
    }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get all answers for a participant
 */
async function getParticipantAnswers(db, participantId) {
  // Validate participant exists
  const participant = await db.prepare('SELECT id, run_id FROM participants WHERE id = ?').first(participantId);
  
  if (!participant) {
    return new Response(JSON.stringify({ error: 'Participant not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const stmt = db.prepare(`
    SELECT a.*, q.question_sv, q.options_sv, q.correct_option
    FROM answers a 
    LEFT JOIN questions q ON a.question_id = q.id 
    WHERE a.participant_id = ? 
    ORDER BY a.answered_at ASC
  `);
  
  const answers = await stmt.all(participantId);

  // Calculate stats
  const results = answers.results || [];
  const totalAnswers = results.length;
  const correctAnswers = results.filter(a => a.is_correct).length;
  const score = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;

  return new Response(JSON.stringify({ 
    participant_id: participantId,
    answers: results,
    stats: {
      total_questions: totalAnswers,
      correct_answers: correctAnswers,
      score_percentage: score
    }
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Get all answers for a run (leaderboard data)
 */
async function getRunAnswers(db, runId) {
  // Validate run exists
  const run = await db.prepare('SELECT id FROM runs WHERE id = ?').first(runId);
  
  if (!run) {
    return new Response(JSON.stringify({ error: 'Run not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const stmt = db.prepare(`
    SELECT 
      p.id as participant_id,
      p.alias,
      p.user_id,
      u.display_name as user_name,
      COUNT(a.id) as total_answers,
      COUNT(CASE WHEN a.is_correct = 1 THEN 1 END) as correct_answers,
      ROUND(
        CASE 
          WHEN COUNT(a.id) > 0 
          THEN (COUNT(CASE WHEN a.is_correct = 1 THEN 1 END) * 100.0 / COUNT(a.id))
          ELSE 0 
        END
      ) as score_percentage,
      MIN(a.answered_at) as first_answer_at,
      MAX(a.answered_at) as last_answer_at,
      p.completed_at
    FROM participants p 
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN answers a ON p.id = a.participant_id
    WHERE p.run_id = ?
    GROUP BY p.id, p.alias, p.user_id, u.display_name, p.completed_at
    ORDER BY score_percentage DESC, last_answer_at ASC
  `);
  
  const leaderboard = await stmt.all(runId);

  return new Response(JSON.stringify({ 
    run_id: runId,
    leaderboard: leaderboard.results || []
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Get specific answer
 */
async function getAnswer(db, answerId) {
  const stmt = db.prepare(`
    SELECT a.*, p.alias, q.question_sv, q.options_sv, q.correct_option
    FROM answers a 
    LEFT JOIN participants p ON a.participant_id = p.id
    LEFT JOIN questions q ON a.question_id = q.id 
    WHERE a.id = ?
  `);
  
  const answer = await stmt.first(answerId);
  
  if (!answer) {
    return new Response(JSON.stringify({ error: 'Answer not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ 
    answer 
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Record new answer
 */
async function recordAnswer(db, data) {
  const { participant_id, question_id, answer_index } = data;

  if (participant_id === undefined || question_id === undefined || answer_index === undefined) {
    return new Response(JSON.stringify({ 
      error: 'Missing required fields: participant_id, question_id, answer_index' 
    }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Validate participant exists and is in active run
  const participant = await db.prepare(`
    SELECT p.id, p.run_id, r.status as run_status 
    FROM participants p 
    LEFT JOIN runs r ON p.run_id = r.id 
    WHERE p.id = ?
  `).first(participant_id);
  
  if (!participant) {
    return new Response(JSON.stringify({ 
      error: 'Participant not found' 
    }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (participant.run_status !== 'active') {
    return new Response(JSON.stringify({ 
      error: 'Run is not active' 
    }), { 
      status: 409, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Validate question exists and get correct answer
  const question = await db.prepare('SELECT id, correct_option FROM questions WHERE id = ?').first(question_id);
  
  if (!question) {
    return new Response(JSON.stringify({ 
      error: 'Question not found' 
    }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check if participant already answered this question
  const existingAnswer = await db.prepare(
    'SELECT id FROM answers WHERE participant_id = ? AND question_id = ?'
  ).first(participant_id, question_id);
  
  if (existingAnswer) {
    return new Response(JSON.stringify({ 
      error: 'Participant already answered this question' 
    }), { 
      status: 409, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const answerId = crypto.randomUUID();
  const now = Date.now();
  const isCorrect = answer_index === question.correct_option;

  const stmt = db.prepare(`
    INSERT INTO answers (id, participant_id, question_id, answer_index, is_correct, answered_at) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  await stmt.run(answerId, participant_id, question_id, answer_index, isCorrect, now);

  // Update participant last_seen
  await db.prepare('UPDATE participants SET last_seen = ? WHERE id = ?').run(now, participant_id);

  // Return the recorded answer
  const recordedAnswer = {
    id: answerId,
    participant_id,
    question_id,
    answer_index,
    is_correct: isCorrect,
    answered_at: now
  };

  // Broadcast new answer for live leaderboard updates
  try {
    await triggerBroadcast(participant.run_id, 'answer-submitted', { 
      answer: recordedAnswer,
      participant_id,
      is_correct: isCorrect
    });
  } catch (broadcastError) {
    console.warn('[answers] Failed to broadcast answer:', broadcastError);
  }

  return new Response(JSON.stringify({ 
    answer: recordedAnswer 
  }), { 
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Update answer (rarely used)
 */
async function updateAnswer(db, answerId, updates) {
  // Validate answer exists
  const existing = await db.prepare('SELECT id FROM answers WHERE id = ?').first(answerId);
  
  if (!existing) {
    return new Response(JSON.stringify({ error: 'Answer not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Build update query dynamically
  const allowedFields = ['answer_index', 'is_correct'];
  const updateFields = [];
  const values = [];

  for (const [field, value] of Object.entries(updates)) {
    if (allowedFields.includes(field)) {
      updateFields.push(`${field} = ?`);
      values.push(value);
    }
  }

  if (updateFields.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid fields to update' }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  values.push(answerId);

  const stmt = db.prepare(`
    UPDATE answers 
    SET ${updateFields.join(', ')} 
    WHERE id = ?
  `);

  await stmt.run(...values);

  // Return updated answer
  return await getAnswer(db, answerId);
}

/**
 * Delete answer
 */
async function deleteAnswer(db, answerId) {
  // Check if answer exists
  const existing = await db.prepare('SELECT id FROM answers WHERE id = ?').first(answerId);
  
  if (!existing) {
    return new Response(JSON.stringify({ error: 'Answer not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Delete answer
  const stmt = db.prepare('DELETE FROM answers WHERE id = ?');
  await stmt.run(answerId);

  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Answer deleted successfully' 
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}