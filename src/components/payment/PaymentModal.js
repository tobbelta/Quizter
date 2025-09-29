/**
 * PaymentModal - Modal för att hantera betalning innan rundstart
 */
import React, { useState, useEffect } from 'react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { paymentService } from '../../services/paymentService';

/**
 * Stripe Elements styling
 */
const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#ffffff',
      '::placeholder': {
        color: '#9CA3AF',
      },
      backgroundColor: 'transparent',
    },
    invalid: {
      color: '#EF4444',
      iconColor: '#EF4444',
    },
  },
  hidePostalCode: true,
};

/**
 * PaymentForm - Inre komponent som hanterar själva betalningsformuläret
 */
const PaymentForm = ({ runName, amount, onSuccess, onCancel, runId, participantId, allowSkip = true }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  // Skapa PaymentIntent när komponenten mountas
  useEffect(() => {
    const createPayment = async () => {
      const result = await paymentService.createPaymentIntent({
        runId,
        participantId,
        amount
      });

      if (result.success) {
        if (result.testMode) {
          // I test-läge behöver vi inget clientSecret
          console.debug('[PaymentModal] Test-läge aktiverat');
        } else {
          setClientSecret(result.clientSecret);
        }
      } else {
        setError(result.error);
      }
    };

    createPayment();
  }, [runId, participantId, amount]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isProcessing) return;
    setIsProcessing(true);
    setError('');

    try {
      // Kontrollera test-läge först
      if (paymentService.getTestMode()) {
        // Simulera betalning i test-läge
        await new Promise(resolve => setTimeout(resolve, 1000));
        onSuccess({
          paymentIntentId: `test_payment_${Date.now()}`,
          testMode: true
        });
        return;
      }

      // Riktigt betalningsflöde
      if (!stripe || !elements) {
        setError('Betalningssystem inte laddat');
        return;
      }

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        setError('Kortfält inte tillgängligt');
        return;
      }

      const result = await paymentService.confirmPayment({
        clientSecret,
        stripe,
        elements
      });

      if (result.success) {
        onSuccess({
          paymentIntentId: result.paymentIntent.id,
          testMode: false
        });
      } else {
        setError(result.error);
      }

    } catch (err) {
      setError('Ett oväntat fel inträffade');
      console.error('[PaymentModal] Betalningsfel:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkipPayment = () => {
    // Simulera lyckad betalning utan att faktiskt betala
    onSuccess({
      paymentIntentId: `skipped_payment_${Date.now()}`,
      testMode: true,
      skipped: true
    });
  };

  const isTestMode = paymentService.getTestMode();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-600 p-6 max-w-md w-full">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-2">
            Betala för runddeltagande
          </h2>
          <p className="text-gray-300 text-sm">
            {runName}
          </p>
          {isTestMode && (
            <div className="mt-2 bg-amber-900/30 border border-amber-500/50 rounded p-2">
              <p className="text-amber-200 text-xs">
                🧪 Test-läge aktiverat - ingen riktig betalning krävs
              </p>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-600">
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-300">Belopp:</span>
              <span className="text-white font-semibold">
                {(amount / 100).toFixed(2)} kr
              </span>
            </div>

            {!isTestMode && (
              <div className="space-y-2">
                <label className="text-sm text-gray-300">
                  Kortnummer, datum och CVC
                </label>
                <div className="bg-slate-700 rounded border border-slate-600 p-3">
                  <CardElement options={CARD_ELEMENT_OPTIONS} />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-500/50 rounded p-3">
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-3 pt-4">
            {/* Primära knappar */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={isProcessing}
                className="flex-1 rounded-lg bg-slate-700 px-4 py-2 font-semibold text-gray-200 hover:bg-slate-600 disabled:opacity-50"
              >
                Avbryt
              </button>
              <button
                type="submit"
                disabled={isProcessing || (!isTestMode && !stripe)}
                className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
              >
                {isProcessing
                  ? 'Bearbetar...'
                  : isTestMode
                    ? 'Fortsätt (Test)'
                    : `Betala ${(amount / 100).toFixed(2)} kr`
                }
              </button>
            </div>

            {/* Hoppa över betalning */}
            {allowSkip && (
              <button
                type="button"
                onClick={handleSkipPayment}
                disabled={isProcessing}
                className="w-full rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-500 disabled:opacity-50 text-sm"
              >
                🚫 Hoppa över betalning (gratis tillgång)
              </button>
            )}
          </div>
        </form>

        <div className="mt-4 text-xs text-gray-400 text-center">
          🔒 Säker betalning via Stripe
        </div>
      </div>
    </div>
  );
};

/**
 * PaymentModal - Huvudkomponent som wrappas med Stripe Elements
 */
const PaymentModal = ({
  isOpen,
  runName,
  amount = 500, // 5 kr som standard
  onSuccess,
  onCancel,
  runId,
  participantId,
  allowSkip = true // Tillåt att hoppa över betalning som standard
}) => {
  const [stripePromise, setStripePromise] = useState(null);

  useEffect(() => {
    // Ladda Stripe endast om inte i test-läge
    if (!paymentService.getTestMode()) {
      setStripePromise(paymentService.getStripeInstance());
    }
  }, []);

  if (!isOpen) return null;

  // I test-läge behöver vi inte Stripe Elements
  if (paymentService.getTestMode()) {
    return (
      <PaymentForm
        runName={runName}
        amount={amount}
        onSuccess={onSuccess}
        onCancel={onCancel}
        runId={runId}
        participantId={participantId}
        allowSkip={allowSkip}
      />
    );
  }

  // I riktigt läge använder vi Stripe Elements
  return (
    <Elements stripe={stripePromise}>
      <PaymentForm
        runName={runName}
        amount={amount}
        onSuccess={onSuccess}
        onCancel={onCancel}
        runId={runId}
        participantId={participantId}
        allowSkip={allowSkip}
      />
    </Elements>
  );
};

export default PaymentModal;