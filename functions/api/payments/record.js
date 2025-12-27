import { getPaymentSettingsSnapshot } from '../../lib/paymentSettings.js';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const fetchStripeIntent = async (secretKey, intentId) => {
  const response = await fetch(`https://api.stripe.com/v1/payment_intents/${intentId}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stripe error: ${errorText}`);
  }

  return response.json();
};

const addPeriod = (period, timestampMs) => {
  const date = new Date(timestampMs);
  if (period === 'year') {
    date.setFullYear(date.getFullYear() + 1);
  } else {
    date.setMonth(date.getMonth() + 1);
  }
  return date.getTime();
};

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await request.json();
    const paymentId = payload?.paymentId || null;
    const providerPaymentId = payload?.providerPaymentId || null;
    const testMode = payload?.testMode === true;

    if (!paymentId) {
      return new Response(JSON.stringify({ success: false, error: 'Saknar paymentId.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const payment = await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(paymentId).first();
    if (!payment) {
      return new Response(JSON.stringify({ success: false, error: 'Betalning hittades inte.' }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    if (payment.status === 'succeeded') {
      return new Response(JSON.stringify({ success: true, payment }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    const { settings } = await getPaymentSettingsSnapshot(env, { includeSecrets: true });
    const provider = settings.providers.find((entry) => entry.id === payment.provider_id);
    if (!provider || !provider.encryptedSecret) {
      return new Response(JSON.stringify({ success: false, error: 'Betalprovider saknas eller är felkonfigurerad.' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const finalProviderPaymentId = providerPaymentId || payment.provider_payment_id;

    if (provider.type === 'stripe' && !testMode && finalProviderPaymentId && !finalProviderPaymentId.startsWith('test_')) {
      if (!provider.secretKey) {
        return new Response(JSON.stringify({ success: false, error: 'Stripe-nyckel saknas.' }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      const intent = await fetchStripeIntent(provider.secretKey, finalProviderPaymentId);
      if (intent.status !== 'succeeded') {
        return new Response(JSON.stringify({ success: false, error: 'Betalningen är inte godkänd ännu.' }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      if (intent.amount !== payment.amount || intent.currency !== payment.currency) {
        return new Response(JSON.stringify({ success: false, error: 'Beloppet matchar inte.' }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
    }

    const now = Date.now();
    await env.DB.prepare(
      'UPDATE payments SET status = ?, provider_payment_id = ?, updated_at = ?, user_id = ?, run_id = ?, participant_id = ? WHERE id = ?'
    ).bind(
      'succeeded',
      finalProviderPaymentId,
      now,
      payload?.userId || payment.user_id || null,
      payload?.runId || payment.run_id || null,
      payload?.participantId || payment.participant_id || null,
      paymentId
    ).run();

    if (payment.payment_type === 'donation') {
      const donationId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO donations (id, user_id, run_id, amount, currency, stripe_payment_intent_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        donationId,
        payload?.userId || payment.user_id || null,
        payload?.runId || payment.run_id || null,
        payment.amount,
        payment.currency,
        finalProviderPaymentId || paymentId,
        now
      ).run();
    }

    if (payment.payment_type === 'subscription') {
      const period = settings.subscription?.period || 'month';
      const subscriptionId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO subscriptions (
          id, user_id, provider_id, status, amount, currency, period, started_at, expires_at, provider_payment_id, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        subscriptionId,
        payload?.userId || payment.user_id,
        payment.provider_id,
        'active',
        payment.amount,
        payment.currency,
        period,
        now,
        addPeriod(period, now),
        finalProviderPaymentId,
        payment.metadata || null,
        now,
        now
      ).run();
    }

    const updatedPayment = await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(paymentId).first();

    return new Response(JSON.stringify({ success: true, payment: updatedPayment }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error('[payments/record] Error:', error);
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
