import { getPaymentSettingsSnapshot } from '../lib/paymentSettings.js';
import { buildRunPaymentQuote } from '../lib/paymentRules.js';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const buildExternalCheckoutUrl = (template, context) => {
  if (!template) return '';
  let url = template;
  Object.entries(context || {}).forEach(([key, value]) => {
    url = url.replaceAll(`{${key}}`, encodeURIComponent(value ?? ''));
  });
  return url;
};

const createStripePaymentIntent = async (secretKey, amount, currency, metadata = {}, description = '') => {
  const body = new URLSearchParams();
  body.set('amount', String(amount));
  body.set('currency', currency);
  body.set('automatic_payment_methods[enabled]', 'true');
  if (description) {
    body.set('description', description);
  }

  Object.entries(metadata).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    body.set(`metadata[${key}]`, String(value));
  });

  const response = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stripe error: ${errorText}`);
  }

  return response.json();
};

const getActiveSubscription = async (db, userId) => {
  if (!userId) return null;
  const now = Date.now();
  return db.prepare(
    'SELECT * FROM subscriptions WHERE user_id = ? AND status = ? AND expires_at > ? ORDER BY expires_at DESC LIMIT 1'
  ).bind(userId, 'active', now).first();
};

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await request.json();
    const purpose = payload?.purpose || 'donation';
    const testMode = payload?.testMode === true;

    const { settings } = await getPaymentSettingsSnapshot(env, { includeSecrets: true });
    const activeProviderId = settings.activeProviderId;
    const provider = settings.providers.find((entry) => entry.id === activeProviderId && entry.isEnabled);

    if (!provider || !provider.encryptedSecret) {
      return new Response(JSON.stringify({ success: false, error: 'Ingen aktiv betalprovider är konfigurerad.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    let currency = payload?.currency || settings.currency || 'sek';
    const providerType = provider.type || 'external';

    let amount = 0;
    let metadata = { purpose };

    if (purpose === 'donation') {
      amount = Number(payload?.amount) || 0;
      metadata.context = payload?.context || null;
    } else if (purpose === 'subscription') {
      if (!payload?.userId) {
        return new Response(JSON.stringify({ success: false, error: 'Prenumeration kräver inloggad användare.' }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      amount = Number(settings.subscription?.amount || 0);
      metadata.period = settings.subscription?.period || 'month';
    } else if (purpose === 'run_host' || purpose === 'run_player') {
      if (purpose === 'run_player' && payload?.runId) {
        const run = await env.DB.prepare(
          'SELECT payment_player_amount, payment_currency, payment_provider_id FROM runs WHERE id = ?'
        ).bind(payload.runId).first();
        if (!run) {
          return new Response(JSON.stringify({ success: false, error: 'Rundan hittades inte.' }), {
            status: 404,
            headers: jsonHeaders,
          });
        }
        if (run?.payment_provider_id && run.payment_provider_id !== provider.id) {
          return new Response(JSON.stringify({ success: false, error: 'Fel betalningsprovider för denna runda.' }), {
            status: 400,
            headers: jsonHeaders,
          });
        }
        amount = Number(run?.payment_player_amount || 0);
        if (run?.payment_currency) {
          currency = run.payment_currency;
          metadata.currency = run.payment_currency;
        }
      } else {
        const questionCount = Number(payload?.questionCount || 0);
        const expectedPlayers = Number(payload?.expectedPlayers || 0);
        const userId = payload?.userId || null;
        const hostHasSubscription = await getActiveSubscription(env.DB, userId);
        const quote = buildRunPaymentQuote(settings, { questionCount, expectedPlayers, hostHasSubscription: Boolean(hostHasSubscription) });
        amount = purpose === 'run_player' ? quote.playerAmount : quote.hostAmount;
        metadata = {
          ...metadata,
          questionCount: quote.questionCount,
          expectedPlayers: quote.expectedPlayers,
          totalAmount: quote.totalAmount,
          payer: quote.payer,
        };
      }
    } else {
      return new Response(JSON.stringify({ success: false, error: 'Okänd betalningspurpose.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    if (!Number.isFinite(amount) || amount < 0) {
      return new Response(JSON.stringify({ success: false, error: 'Ogiltigt betalningsbelopp.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    if (amount === 0) {
      return new Response(JSON.stringify({ success: true, skip: true, amount: 0, currency }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    const paymentId = crypto.randomUUID();
    const now = Date.now();

    await env.DB.prepare(
      `INSERT INTO payments (
        id, user_id, run_id, participant_id, provider_id, provider_type, payment_type,
        status, amount, currency, provider_payment_id, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      paymentId,
      payload?.userId || null,
      payload?.runId || null,
      payload?.participantId || null,
      provider.id,
      providerType,
      purpose,
      'pending',
      Math.round(amount),
      currency,
      null,
      JSON.stringify(metadata),
      now,
      now
    ).run();

    if (providerType === 'stripe' && !testMode) {
      if (!provider.secretKey) {
        return new Response(JSON.stringify({ success: false, error: 'Stripe-nyckel saknas.' }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      const intent = await createStripePaymentIntent(provider.secretKey, Math.round(amount), currency, {
        paymentId,
        purpose,
      });

      await env.DB.prepare('UPDATE payments SET provider_payment_id = ?, updated_at = ? WHERE id = ?')
        .bind(intent.id, Date.now(), paymentId).run();

      return new Response(JSON.stringify({
        success: true,
        paymentId,
        amount: Math.round(amount),
        currency,
        providerId: provider.id,
        providerType,
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
      }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    const providerPaymentId = testMode
      ? `test_${paymentId}`
      : `external_${paymentId}`;

    await env.DB.prepare('UPDATE payments SET provider_payment_id = ?, updated_at = ? WHERE id = ?')
      .bind(providerPaymentId, Date.now(), paymentId).run();

    const checkoutUrl = buildExternalCheckoutUrl(provider.checkoutUrlTemplate, {
      paymentId,
      amount: Math.round(amount),
      currency,
      runId: payload?.runId || '',
      participantId: payload?.participantId || '',
      purpose,
    });

    return new Response(JSON.stringify({
      success: true,
      paymentId,
      amount: Math.round(amount),
      currency,
      providerId: provider.id,
      providerType,
      paymentIntentId: providerPaymentId,
      checkoutUrl,
      testMode,
    }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[createPaymentIntent] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
