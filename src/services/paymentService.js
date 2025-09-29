/**
 * PaymentService - Hanterar betalningar via Stripe
 */
import { loadStripe } from '@stripe/stripe-js';

// Stripe publishable key (test-nyckel för utveckling)
// I produktion: lägg detta i environment variables
const STRIPE_PUBLISHABLE_KEY = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || 'pk_test_51234567890'; // Dummy test key

// Test-läge kan aktiveras via environment variable eller localStorage
const isTestMode = () => {
  // Kontrollera environment variable först
  if (process.env.REACT_APP_PAYMENT_TEST_MODE === 'true') {
    return true;
  }

  // Kontrollera localStorage för lokal utveckling
  if (typeof window !== 'undefined') {
    return localStorage.getItem('geoquest:paymentTestMode') === 'true';
  }

  return false;
};

// Ladda Stripe (lazy loading)
let stripePromise = null;

const getStripe = () => {
  if (!stripePromise && !isTestMode()) {
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
};

/**
 * Skapar en betalning för runddeltagande
 */
export const createPaymentIntent = async ({ runId, participantId, amount = 500 }) => {
  // I test-läge: simulera framgångsrik betalning
  if (isTestMode()) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[PaymentService] Test-läge aktiverat - simulerar betalning');
    }
    return {
      success: true,
      paymentIntentId: `test_pi_${runId}_${participantId}_${Date.now()}`,
      testMode: true
    };
  }

  try {
    // I riktigt läge: anropa backend för att skapa PaymentIntent
    const response = await fetch('/api/create-payment-intent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        runId,
        participantId,
        amount, // SEK i ören (500 = 5 kr)
        currency: 'sek'
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const { client_secret, payment_intent_id } = await response.json();

    return {
      success: true,
      clientSecret: client_secret,
      paymentIntentId: payment_intent_id,
      testMode: false
    };

  } catch (error) {
    console.error('[PaymentService] Fel vid skapande av betalning:', error);
    return {
      success: false,
      error: error.message,
      testMode: false
    };
  }
};

/**
 * Bekräftar betalning med Stripe Elements
 */
export const confirmPayment = async ({ clientSecret, stripe, elements }) => {
  if (isTestMode()) {
    // I test-läge: simulera framgångsrik bekräftelse
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[PaymentService] Test-läge - simulerar bekräftelse');
    }
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
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: {
        return_url: `${window.location.origin}/payment-result`,
      },
    });

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
    console.error('[PaymentService] Fel vid bekräftelse av betalning:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Kontrollerar om test-läge är aktiverat
 */
export const getTestMode = isTestMode;

/**
 * Aktiverar/deaktiverar test-läge (endast för utveckling)
 */
export const setTestMode = (enabled) => {
  if (typeof window !== 'undefined') {
    if (enabled) {
      localStorage.setItem('geoquest:paymentTestMode', 'true');
    } else {
      localStorage.removeItem('geoquest:paymentTestMode');
    }
  }
};

/**
 * Hämtar Stripe instance
 */
export const getStripeInstance = getStripe;

export const paymentService = {
  createPaymentIntent,
  confirmPayment,
  getTestMode,
  setTestMode,
  getStripeInstance
};