/**
 * PARTICIPANTS API ENDPOINTS - CLEAN VERSION
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
  const participantId = pathSegments[2]; // /api/participants/{participantId}

  try {
    switch (method) {
      case 'GET':
        if (!participantId) {
          // GET /api/participants?runId=xxx - List participants for run
          const urlParams = new URL(url).searchParams;
          const runId = urlParams.get('runId');
          
          if (runId) {
            return await listParticipants(env.DB, runId);
          }
          
          return new Response(JSON.stringify({ 
            error: 'runId parameter required' 
          }), { 
            status: 400, 
            headers: { 'Content-Type': 'application/json' }
          });
          
        } else {
          // GET /api/participants/{id} - Get specific participant
          return await getParticipant(env.DB, participantId);
        }

      case 'POST':
        if (!participantId) {
          // POST /api/participants - Register new participant
          const body = await request.json();
          return await registerParticipant(env.DB, body);
        } else {
          // POST /api/participants/{id}/heartbeat - Update last seen
          let payload = null;
          try {
            payload = await request.json();
          } catch (error) {
            payload = null;
          }
          return await heartbeatParticipant(env.DB, participantId, payload);
        }

      case 'DELETE':
        if (participantId) {
          // DELETE /api/participants/{id} - Delete specific participant
          return await deleteParticipant(env.DB, participantId);
        }
        break;

      default:
        return new Response('Method not allowed', { status: 405 });
    }

  } catch (error) {
    console.error('[participants] Error:', error);
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
 * List participants for a run
 */
async function listParticipants(db, runId) {
  const participants = await db.prepare('SELECT * FROM participants WHERE run_id = ? ORDER BY joined_at ASC').bind(runId).all();
  
  return new Response(JSON.stringify({ 
    participants: participants.results || []
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Get specific participant
 */
async function getParticipant(db, participantId) {
  const participant = await db.prepare('SELECT * FROM participants WHERE id = ?').bind(participantId).first();
  
  if (!participant) {
    return new Response(JSON.stringify({ error: 'Participant not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ 
    participant: participant 
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Register new participant
 */
async function registerParticipant(db, data) {
  const {
    run_id,
    user_id = null,
    alias,
    payment_id = null,
    paymentId = null,
    is_anonymous = null,
    isAnonymous = null,
    device_id = null,
    deviceId = null
  } = data;

  if (!run_id || !alias) {
    return new Response(JSON.stringify({ 
      error: 'Missing required fields: run_id, alias' 
    }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const normalizedAlias = String(alias).trim();
  if (!normalizedAlias) {
    return new Response(JSON.stringify({ 
      error: 'Missing required field: alias' 
    }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Validate run exists and is active
  const run = await db.prepare(
    `SELECT id, status, created_by, payment_player_amount, payment_currency, payment_provider_id, anonymous_policy, max_anonymous
     FROM runs WHERE id = ? AND status = ?`
  ).bind(run_id, 'active').first();
  
  if (!run) {
    return new Response(JSON.stringify({ 
      error: 'Run not found or closed' 
    }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const resolvedIsAnonymous = Boolean(is_anonymous ?? isAnonymous ?? !user_id);
  const resolvedDeviceId = String(device_id || deviceId || '').trim() || null;
  const anonymousPolicy = run?.anonymous_policy || 'allow';
  const maxAnonymous = Number.isFinite(Number(run?.max_anonymous))
    ? Math.max(0, Math.round(Number(run.max_anonymous)))
    : 0;

  if (resolvedIsAnonymous && anonymousPolicy === 'block') {
    return new Response(JSON.stringify({
      error: 'Oregistrerade spelare är inte tillåtna i denna runda.'
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (resolvedIsAnonymous && anonymousPolicy === 'limit' && maxAnonymous > 0) {
    const anonymousCount = await db.prepare(
      'SELECT COUNT(*) AS count FROM participants WHERE run_id = ? AND (is_anonymous = 1 OR user_id IS NULL)'
    ).bind(run_id).first();
    const currentCount = Number(anonymousCount?.count || 0);
    if (currentCount >= maxAnonymous) {
      return new Response(JSON.stringify({
        error: 'Maximalt antal oregistrerade spelare är uppnått.'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Check if alias is already taken in this run
  const existingAlias = await db.prepare('SELECT id FROM participants WHERE run_id = ? AND alias = ?')
    .bind(run_id, normalizedAlias)
    .first();
  
  if (existingAlias) {
    return new Response(JSON.stringify({ 
      error: 'Alias already taken in this run' 
    }), { 
      status: 409, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const participantId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const playerAmount = Number(run?.payment_player_amount || 0);
    const isHostParticipant = Boolean(user_id && run?.created_by && user_id === run.created_by);
    const playerPaymentRequired = playerAmount > 0 && !isHostParticipant;
    const requiredPaymentId = payment_id || paymentId || null;
    let paymentRecord = null;

    if (playerPaymentRequired) {
      if (!requiredPaymentId) {
        return new Response(JSON.stringify({
          error: 'Betalning krävs för att ansluta till denna runda.'
        }), {
          status: 402,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      paymentRecord = await db.prepare('SELECT * FROM payments WHERE id = ?').bind(requiredPaymentId).first();
      if (!paymentRecord || paymentRecord.status !== 'succeeded') {
        return new Response(JSON.stringify({
          error: 'Betalningen kunde inte verifieras.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (paymentRecord.payment_type !== 'run_player') {
        return new Response(JSON.stringify({
          error: 'Felaktig betalningstyp för anslutning.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (run?.payment_provider_id && paymentRecord.provider_id !== run.payment_provider_id) {
        return new Response(JSON.stringify({
          error: 'Betalningsprovidern stämmer inte.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (Number(paymentRecord.amount) !== Math.round(playerAmount)) {
        return new Response(JSON.stringify({
          error: 'Betalningsbeloppet stämmer inte.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (run?.payment_currency && paymentRecord.currency !== run.payment_currency) {
        return new Response(JSON.stringify({
          error: 'Valutan stämmer inte.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (paymentRecord.participant_id) {
        return new Response(JSON.stringify({
          error: 'Betalningen är redan använd.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Create participant
    await db.prepare(
      `INSERT INTO participants (
        id, run_id, user_id, alias, device_id, joined_at, last_seen, payment_status, payment_amount,
        payment_currency, payment_provider_id, payment_id, is_anonymous
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      participantId,
      run_id,
      user_id,
      normalizedAlias,
      resolvedDeviceId,
      now,
      now,
      playerPaymentRequired ? 'paid' : null,
      playerPaymentRequired ? Math.round(playerAmount) : null,
      playerPaymentRequired ? run?.payment_currency || null : null,
      playerPaymentRequired ? run?.payment_provider_id || null : null,
      playerPaymentRequired ? requiredPaymentId : null,
      resolvedIsAnonymous ? 1 : 0
    ).run();

    console.log('Participant registered successfully:', participantId);

    if (paymentRecord && requiredPaymentId) {
      await db.prepare('UPDATE payments SET run_id = ?, participant_id = ?, updated_at = ? WHERE id = ?')
        .bind(run_id, participantId, Date.now(), requiredPaymentId).run();
    }

    const participant = {
      id: participantId,
      run_id: run_id,
      user_id: user_id,
      alias: normalizedAlias,
      device_id: resolvedDeviceId,
      joined_at: now,
      last_seen: now,
      completed_at: null,
      payment_status: playerPaymentRequired ? 'paid' : null,
      payment_amount: playerPaymentRequired ? Math.round(playerAmount) : null,
      payment_currency: playerPaymentRequired ? run?.payment_currency || null : null,
      payment_provider_id: playerPaymentRequired ? run?.payment_provider_id || null : null,
      payment_id: playerPaymentRequired ? requiredPaymentId : null,
      is_anonymous: resolvedIsAnonymous ? 1 : 0
    };

    return new Response(JSON.stringify({
      success: true,
      participant: participant
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error registering participant:', error);
    return new Response(JSON.stringify({
      error: 'Failed to register participant',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Update participant heartbeat
 */
async function heartbeatParticipant(db, participantId, payload = null) {
  try {
    const now = Math.floor(Date.now() / 1000);

    const instanceId = payload?.instanceId || payload?.instance_id || null;
    let result;
    if (instanceId) {
      result = await db.prepare(
        'UPDATE participants SET last_seen = ?, active_instance_id = ?, active_instance_at = ? WHERE id = ?'
      ).bind(now, instanceId, now, participantId).run();
    } else {
      result = await db.prepare('UPDATE participants SET last_seen = ? WHERE id = ?').bind(now, participantId).run();
    }
    
    if (result.changes === 0) {
      return new Response(JSON.stringify({ 
        error: 'Participant not found' 
      }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      last_seen: now,
      active_instance_id: instanceId || null,
      active_instance_at: instanceId ? now : null
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error updating heartbeat:', error);
    return new Response(JSON.stringify({
      error: 'Failed to update heartbeat',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Delete participant by ID
 */
async function deleteParticipant(db, participantId) {
  const participant = await db.prepare('SELECT * FROM participants WHERE id = ?').bind(participantId).first();
  
  if (!participant) {
    return new Response(JSON.stringify({ error: 'Participant not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Delete participant (cascade will handle answers)
  await db.prepare('DELETE FROM participants WHERE id = ?').bind(participantId).run();

  return new Response(JSON.stringify({ 
    success: true,
    message: 'Participant deleted successfully'
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}
