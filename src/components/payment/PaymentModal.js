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
 * TestModePaymentForm - Enklare form för test-läge utan Stripe hooks
 */
const TestModePaymentForm = ({ runName, amount, onSuccess, onCancel, allowSkip = true }) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsProcessing(true);

    // Simulera betalning i test-läge
    await new Promise(resolve => setTimeout(resolve, 1000));
    onSuccess({
      paymentIntentId: `test_payment_${Date.now()}`,
      testMode: true
    });
  };

  const handleSkipPayment = () => {
    onSuccess({
      paymentIntentId: `skipped_payment_${Date.now()}`,
      testMode: true,
      skipped: true
    });
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-slate-600 bg-slate-900 p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-2">
            Stöd projektet (valfritt)
          </h2>
          <p className="text-gray-300 text-sm mb-2">
            {runName}
          </p>
          <p className="text-gray-400 text-sm">
            Vill du stödja utvecklingen av Quizter med en frivillig donation?
          </p>
          <div className="mt-2 bg-emerald-900/30 border border-emerald-500/50 rounded p-2">
            <p className="text-emerald-200 text-xs">
              🧪 Test-läge aktiverat - ingen riktig betalning krävs
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-600">
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-300">Belopp:</span>
              <span className="text-white font-semibold">
                {(amount / 100).toFixed(2)} kr
              </span>
            </div>
            <p className="text-sm text-gray-400">Test-läge: Ingen riktig betalning krävs</p>
          </div>

          <div className="space-y-3 pt-4">
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
                disabled={isProcessing}
                className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
              >
                {isProcessing ? 'Bearbetar...' : 'Fortsätt (Test)'}
              </button>
            </div>

            {allowSkip && (
              <button
                type="button"
                onClick={handleSkipPayment}
                disabled={isProcessing}
                className="w-full rounded-lg bg-slate-700 px-4 py-2 font-semibold text-gray-300 hover:bg-slate-600 disabled:opacity-50 text-sm"
              >
                Fortsätt utan donation
              </button>
            )}
          </div>
        </form>

        <div className="mt-4 text-xs text-gray-400 text-center">
          🧪 Test-läge aktiverat
        </div>
      </div>
    </div>
  );
};

/**
 * StripePaymentForm - Form för riktig betalning med Stripe hooks
 */
const StripePaymentForm = ({ runName, amount, onSuccess, onCancel, runId, participantId, allowSkip = true }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  // Skapa PaymentIntent när komponenten mountas
  useEffect(() => {
    const createPayment = async () => {
      // Validera att vi har nödvändig data innan vi försöker skapa betalning
      if (!runId || !amount) {
        setError('Saknar nödvändig information för betalning');
        return;
      }

      const result = await paymentService.createPaymentIntent({
        runId,
        participantId: participantId || 'anonymous',
        amount
      });

      if (result.success) {
        setClientSecret(result.clientSecret);
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
    onSuccess({
      paymentIntentId: `skipped_payment_${Date.now()}`,
      testMode: true,
      skipped: true
    });
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-slate-600 bg-slate-900 p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-2">
            Stöd projektet (valfritt)
          </h2>
          <p className="text-gray-300 text-sm mb-2">
            {runName}
          </p>
          <p className="text-gray-400 text-sm">
            Vill du stödja utvecklingen av Quizter med en frivillig donation?
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-600">
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-300">Belopp:</span>
              <span className="text-white font-semibold">
                {(amount / 100).toFixed(2)} kr
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-300">
                Kortnummer, datum och CVC
              </label>
              <div className="bg-slate-700 rounded border border-slate-600 p-3">
                <CardElement options={CARD_ELEMENT_OPTIONS} />
              </div>
            </div>
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
                disabled={isProcessing || !stripe}
                className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
              >
                {isProcessing ? 'Bearbetar...' : `Donera ${(amount / 100).toFixed(2)} kr`}
              </button>
            </div>

            {/* Hoppa över betalning */}
            {allowSkip && (
              <button
                type="button"
                onClick={handleSkipPayment}
                disabled={isProcessing}
                className="w-full rounded-lg bg-slate-700 px-4 py-2 font-semibold text-gray-300 hover:bg-slate-600 disabled:opacity-50 text-sm"
              >
                Fortsätt utan donation
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

  // I test-läge använder vi TestModePaymentForm (utan Stripe hooks)
  if (paymentService.getTestMode()) {
    return (
      <TestModePaymentForm
        runName={runName}
        amount={amount}
        onSuccess={onSuccess}
        onCancel={onCancel}
        allowSkip={allowSkip}
      />
    );
  }

  // I riktigt läge använder vi Stripe Elements
  return (
    <Elements stripe={stripePromise}>
      <StripePaymentForm
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