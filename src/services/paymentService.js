/**
 * PaymentService - Hanterar betalflöden och inställningar
 */
import { loadStripe } from '@stripe/stripe-js';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const isTestMode = () => {
  if (process.env.REACT_APP_PAYMENT_TEST_MODE === 'true') {
    return true;
  }

  if (typeof window !== 'undefined') {
    return localStorage.getItem('quizter:paymentTestMode') === 'true';
  }

  return false;
};

let stripePromise = null;
let stripeKey = null;

const getStripeInstance = (publishableKey) => {
  if (!publishableKey) return null;
  if (!stripePromise || stripeKey !== publishableKey) {
    stripeKey = publishableKey;
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
};

let cachedConfig = null;
let configPromise = null;

const fetchPaymentConfig = async (force = false) => {
  if (!force && cachedConfig) return cachedConfig;
  if (!force && configPromise) return configPromise;

  configPromise = fetch(`${API_BASE_URL}/api/paymentConfig`)
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Kunde inte hämta betalningskonfig.');
      }
      cachedConfig = data.config || null;
      return cachedConfig;
    })
    .finally(() => {
      configPromise = null;
    });

  return configPromise;
};

const getPaymentConfig = async (force = false) => {
  try {
    return await fetchPaymentConfig(force);
  } catch (error) {
    console.error('[paymentService] Kunde inte hämta paymentConfig:', error);
    return null;
  }
};

const createPaymentIntent = async ({
  purpose,
  amount,
  currency,
  runId,
  participantId,
  questionCount,
  expectedPlayers,
  userId,
  context
}) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/createPaymentIntent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose,
        amount,
        currency,
        runId,
        participantId,
        questionCount,
        expectedPlayers,
        userId,
        context,
        testMode: isTestMode(),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Betalningsförfrågan misslyckades.');
    }

    return {
      success: true,
      ...data,
      testMode: isTestMode() || data.testMode
    };
  } catch (error) {
    console.error('[paymentService] Fel vid skapande av betalning:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

const confirmPayment = async ({ clientSecret, stripe, elements }) => {
  if (isTestMode()) {
    return {
      success: true,
      paymentIntent: {
        id: `test_pi_confirmed_${Date.now()}`,
        status: 'succeeded'
      },
      testMode: true
    };
  }

  if (!stripe || !elements) {
    return {
      success: false,
      error: 'Stripe har inte laddats korrekt'
    };
  }

  try {
    const { error, paymentIntent } = await stripe.confirmCardPayment(
      clientSecret,
      {
        payment_method: {
          card: elements.getElement('card'),
        }
      }
    );

    if (error) {
      return {
        success: false,
        error: error.message
      };
    }

    return {
      success: true,
      paymentIntent,
      testMode: false
    };
  } catch (error) {
    console.error('[paymentService] Fel vid bekräftelse av betalning:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const recordPayment = async ({ paymentId, providerPaymentId, runId, participantId, userId }) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/payments/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentId,
        providerPaymentId,
        runId,
        participantId,
        userId,
        testMode: isTestMode(),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Kunde inte registrera betalning.');
    }

    return {
      success: true,
      payment: data.payment || null
    };
  } catch (error) {
    console.error('[paymentService] Fel vid registrering av betalning:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const getPaymentSettings = async (userEmail) => {
  const response = await fetch(`${API_BASE_URL}/api/paymentSettings`, {
    headers: {
      'x-user-email': userEmail || ''
    }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte hämta betalningsinställningar.');
  }
  return data;
};

const savePaymentSettings = async (settings, userEmail) => {
  const response = await fetch(`${API_BASE_URL}/api/paymentSettings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': userEmail || ''
    },
    body: JSON.stringify({ settings })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte spara betalningsinställningar.');
  }
  cachedConfig = null;
  return data;
};

const setTestMode = (enabled) => {
  if (typeof window !== 'undefined') {
    if (enabled) {
      localStorage.setItem('quizter:paymentTestMode', 'true');
    } else {
      localStorage.removeItem('quizter:paymentTestMode');
    }
  }
};

export const paymentService = {
  getPaymentConfig,
  createPaymentIntent,
  confirmPayment,
  recordPayment,
  getPaymentSettings,
  savePaymentSettings,
  getStripeInstance,
  getTestMode: isTestMode,
  setTestMode,
};
