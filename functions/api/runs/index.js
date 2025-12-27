/**
 * RUNS API ENDPOINTS - SIMPLIFIED VERSION
 */

import { ensureDatabase } from '../../lib/ensureDatabase.js';
import { getPaymentSettingsSnapshot } from '../../lib/paymentSettings.js';
import { buildRunPaymentQuote } from '../../lib/paymentRules.js';

// Helper för att generera unika join codes
function generateJoinCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper för att säkerställa unik join code
async function generateUniqueJoinCode(db) {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const code = generateJoinCode();
    const existing = await db.prepare('SELECT id FROM runs WHERE join_code = ?').bind(code).first();
    
    if (!existing) {
      return code;
    }
    attempts++;
  }
  
  throw new Error('Could not generate unique join code after ' + maxAttempts + ' attempts');
}

export async function onRequest(context) {
  const { request, env } = context;
  const { method } = request;
  const url = new URL(request.url);
  const { pathname } = url;

  // Initialize database
  await ensureDatabase(env.DB);

  // Parse path segments
  const pathSegments = pathname.split('/').filter(Boolean);
  const runId = pathSegments[2]; // /api/runs/{runId}

  try {
    switch (method) {
      case 'GET':
        if (!runId) {
          // GET /api/runs - List all runs
          return await listRuns(env.DB);
        } else {
          // GET /api/runs/{id} - Get specific run
          return await getRun(env.DB, runId);
        }

      case 'POST':
        if (!runId) {
          // POST /api/runs - Create new run
          const body = await request.json();
          return await createRun(env, body);
        }
        break;

      case 'DELETE':
        if (runId) {
          // DELETE /api/runs/{id} - Delete specific run
          return await deleteRun(env.DB, runId);
        }
        break;

      default:
        return new Response('Method not allowed', { status: 405 });
    }

    return new Response('Not found', { status: 404 });

  } catch (error) {
    console.error('[runs] Error:', error);
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
 * List all runs
 */
async function listRuns(db) {
  const runs = await db.prepare('SELECT * FROM runs ORDER BY created_at DESC').all();
  
  // Parse JSON fields
  const processedRuns = runs.results?.map(run => ({
    ...run,
    question_ids: run.question_ids ? JSON.parse(run.question_ids) : [],
    checkpoints: run.checkpoints ? JSON.parse(run.checkpoints) : [],
    route: run.route ? JSON.parse(run.route) : null,
  })) || [];

  return new Response(JSON.stringify({ 
    runs: processedRuns 
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Get specific run by ID
 */
async function getRun(db, runId) {
  const run = await db.prepare('SELECT * FROM runs WHERE id = ?').bind(runId).first();
  
  if (!run) {
    return new Response(JSON.stringify({ error: 'Run not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Parse JSON fields
  const processedRun = {
    ...run,
    question_ids: run.question_ids ? JSON.parse(run.question_ids) : [],
    checkpoints: run.checkpoints ? JSON.parse(run.checkpoints) : [],
    route: run.route ? JSON.parse(run.route) : null,
  };

  return new Response(JSON.stringify({ 
    run: processedRun 
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Create new run
 */
const getActiveSubscription = async (db, userId) => {
  if (!userId) return null;
  const now = Date.now();
  return db.prepare(
    'SELECT * FROM subscriptions WHERE user_id = ? AND status = ? AND expires_at > ? ORDER BY expires_at DESC LIMIT 1'
  ).bind(userId, 'active', now).first();
};

async function createRun(env, data) {
  const db = env.DB;
  const {
    name,
    question_ids = [],
    checkpoints = [],
    route = null,
    created_by = null,
    createdBy = null,
    expected_players = null,
    expectedPlayers = null,
    payment_id = null,
    paymentId = null
  } = data;

  if (!name) {
    return new Response(JSON.stringify({ 
      error: 'Missing required field: name' 
    }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const runId = crypto.randomUUID();
    console.log('Creating run with ID:', runId);
    
    // Generate unique join code
    const joinCode = await generateUniqueJoinCode(db);
    const now = Date.now();
    
    // Create run in database
    const creatorId = created_by || createdBy || null;
    const normalizedExpectedPlayers = Number(expected_players ?? expectedPlayers ?? 0);
    const resolvedExpectedPlayers = Number.isFinite(normalizedExpectedPlayers) && normalizedExpectedPlayers > 0
      ? Math.round(normalizedExpectedPlayers)
      : null;

    const { settings } = await getPaymentSettingsSnapshot(env, { includeSecrets: false });
    const activeProvider = settings.providers.find((provider) => provider.id === settings.activeProviderId && provider.isEnabled);
    const providerReady = Boolean(activeProvider && activeProvider.encryptedSecret);
    const questionCount = Array.isArray(question_ids) && question_ids.length > 0
      ? question_ids.length
      : Number(route?.meta?.questionCount || 0);
    const hostHasSubscription = Boolean(await getActiveSubscription(db, creatorId));
    const quote = buildRunPaymentQuote(settings, {
      questionCount,
      expectedPlayers: resolvedExpectedPlayers || 0,
      hostHasSubscription
    });

    if (quote.payer !== 'host' && (!resolvedExpectedPlayers || resolvedExpectedPlayers < 1)) {
      return new Response(JSON.stringify({
        error: 'Saknar förväntat antal spelare för prissättning.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (quote.hostAmount > 0 && !providerReady) {
      return new Response(JSON.stringify({
        error: 'Betalning krävs men ingen aktiv betalprovider är konfigurerad.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const hostPaymentId = payment_id || paymentId || null;
    if (quote.hostAmount > 0 && !hostPaymentId) {
      return new Response(JSON.stringify({
        error: 'Betalning krävs innan rundan kan skapas.'
      }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let hostPaymentRecord = null;
    if (hostPaymentId) {
      hostPaymentRecord = await db.prepare('SELECT * FROM payments WHERE id = ?').bind(hostPaymentId).first();
      if (!hostPaymentRecord || hostPaymentRecord.status !== 'succeeded') {
        return new Response(JSON.stringify({
          error: 'Betalningen kunde inte verifieras.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (hostPaymentRecord.payment_type !== 'run_host') {
        return new Response(JSON.stringify({
          error: 'Felaktig betalningstyp för skapande av runda.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (quote.hostAmount > 0 && Number(hostPaymentRecord.amount) !== Math.round(quote.hostAmount)) {
        return new Response(JSON.stringify({
          error: 'Betalningsbeloppet stämmer inte.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (hostPaymentRecord.currency !== quote.currency) {
        return new Response(JSON.stringify({
          error: 'Valutan stämmer inte.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    const anonymousPolicy = settings.anonymous?.policy || 'allow';
    const maxAnonymous = Number.isFinite(Number(settings.anonymous?.maxPerRun))
      ? Math.max(0, Math.round(Number(settings.anonymous?.maxPerRun)))
      : 0;
    const paymentStatus = quote.hostAmount > 0
      ? hostPaymentRecord
        ? 'host_paid'
        : 'pending'
      : 'not_required';

    await db.prepare(
      `INSERT INTO runs (
        id, name, join_code, created_by, created_at, status, question_ids, checkpoints, route, updated_at,
        payment_policy, payment_status, payment_total_amount, payment_host_amount, payment_player_amount,
        payment_currency, payment_provider_id, expected_players, anonymous_policy, max_anonymous, host_payment_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      runId,
      name,
      joinCode,
      creatorId,
      Math.floor(now / 1000),
      'active',
      JSON.stringify(question_ids),
      JSON.stringify(checkpoints),
      route ? JSON.stringify(route) : null,
      Math.floor(now / 1000),
      quote.payer,
      paymentStatus,
      Math.round(quote.totalAmount || 0),
      Math.round(quote.hostAmount || 0),
      Math.round(quote.playerAmount || 0),
      quote.currency,
      activeProvider?.id || null,
      resolvedExpectedPlayers,
      anonymousPolicy,
      maxAnonymous,
      hostPaymentId
    ).run();
    
    console.log('Run created successfully!');
    
    const createdRun = {
      id: runId,
      name,
      join_code: joinCode,
      created_by: creatorId,
      status: 'active',
      created_at: Math.floor(now / 1000),
      question_ids,
      checkpoints,
      route,
      payment_policy: quote.payer,
      payment_status: paymentStatus,
      payment_total_amount: Math.round(quote.totalAmount || 0),
      payment_host_amount: Math.round(quote.hostAmount || 0),
      payment_player_amount: Math.round(quote.playerAmount || 0),
      payment_currency: quote.currency,
      payment_provider_id: activeProvider?.id || null,
      expected_players: resolvedExpectedPlayers,
      anonymous_policy: anonymousPolicy,
      max_anonymous: maxAnonymous,
      host_payment_id: hostPaymentId
    };

    if (hostPaymentRecord) {
      await db.prepare('UPDATE payments SET run_id = ?, updated_at = ? WHERE id = ?')
        .bind(runId, Date.now(), hostPaymentId).run();
    }

    return new Response(JSON.stringify({
      success: true,
      run: createdRun
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

    } catch (error) {
    console.error('Error creating run:', error);
    return new Response(JSON.stringify({
      error: 'Failed to create run',
      details: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Delete run by ID
 */
async function deleteRun(db, runId) {
  const run = await db.prepare('SELECT * FROM runs WHERE id = ?').bind(runId).first();
  
  if (!run) {
    return new Response(JSON.stringify({ error: 'Run not found' }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Delete run (cascade will handle participants and answers)
  await db.prepare('DELETE FROM runs WHERE id = ?').bind(runId).run();

  return new Response(JSON.stringify({ 
    success: true,
    message: 'Run deleted successfully'
  }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}
