/**
 * ANSWERS API ENDPOINTS - CLEAN VERSION
 */

import { ensureDatabase } from '../../lib/ensureDatabase.js';

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
        // GET /api/answers?participantId=xxx - Get answers for participant
        const urlParams = new URL(url).searchParams;
        const participantId = urlParams.get('participantId');
        
        if (participantId) {
          return await getParticipantAnswers(env.DB, participantId);
        }
        
        return new Response(JSON.stringify({ 
          error: 'participantId parameter required' 
        }), { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' }
        });

      case 'POST':
        // POST /api/answers - Record new answer
        const body = await request.json();
        return await recordAnswer(env.DB, body);

      case 'DELETE':
        if (answerId) {
          // DELETE /api/answers/{id} - Delete specific answer
          return await deleteAnswer(env.DB, answerId);
        }
        break;

      default:
        return new Response('Method not allowed', { status: 405 });
    }

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
 * Get answers for a participant
 */
async function getParticipantAnswers(db, participantId) {
  const answers = await db.prepare('SELECT * FROM answers WHERE participant_id = ? ORDER BY answered_at ASC').bind(participantId).all();
  
  return new Response(JSON.stringify({ 
    answers: answers.results || []
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Record new answer
 */
async function recordAnswer(db, data) {
  const { participant_id, question_id, answer_index, is_correct } = data;

  if (participant_id === undefined || question_id === undefined || answer_index === undefined || is_correct === undefined) {
    return new Response(JSON.stringify({ 
      error: 'Missing required fields: participant_id, question_id, answer_index, is_correct' 
    }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Validate participant exists
  const participant = await db.prepare('SELECT * FROM participants WHERE id = ?').bind(participant_id).first();
  
  if (!participant) {
    return new Response(JSON.stringify({ 
      error: 'Participant not found' 
    }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check if answer already exists for this question
  const existingAnswer = await db.prepare('SELECT id FROM answers WHERE participant_id = ? AND question_id = ?').bind(participant_id, question_id).first();
  
  if (existingAnswer) {
    return new Response(JSON.stringify({ 
      error: 'Answer already recorded for this question' 
    }), { 
      status: 409, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const answerId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    // Record answer
    await db.prepare('INSERT INTO answers (id, participant_id, question_id, answer_index, is_correct, answered_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
      answerId,
      participant_id,
      question_id,
      answer_index,
      is_correct,
      now
    ).run();

    console.log('Answer recorded successfully:', answerId);

    const answer = {
      id: answerId,
      participant_id: participant_id,
      question_id: question_id,
      answer_index: answer_index,
      is_correct: is_correct,
      answered_at: now
    };

    return new Response(JSON.stringify({
      success: true,
      answer: answer
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error recording answer:', error);
    return new Response(JSON.stringify({
      error: 'Failed to record answer',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Delete answer by ID
 */
async function deleteAnswer(db, answerId) {
  const answer = await db.prepare('SELECT * FROM answers WHERE id = ?').bind(answerId).first();
  
  if (!answer) {
    return new Response(JSON.stringify({ error: 'Answer not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Delete answer
  await db.prepare('DELETE FROM answers WHERE id = ?').bind(answerId).run();

  return new Response(JSON.stringify({ 
    success: true,
    message: 'Answer deleted successfully'
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}