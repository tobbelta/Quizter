/**
 * PaymentModal - Modal för betalning och donationer
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { paymentService } from '../../services/paymentService';

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

const formatAmount = (amount, currency) => {
  const safeAmount = Number(amount) || 0;
  const safeCurrency = currency ? currency.toUpperCase() : 'SEK';
  return `${(safeAmount / 100).toFixed(2)} ${safeCurrency}`;
};

const TestModePaymentForm = ({ title, description, amount, currency, onSuccess, onCancel, allowSkip }) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 600));
    onSuccess({ providerPaymentId: `test_${Date.now()}` });
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-slate-600 bg-slate-900 p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-2">{title}</h2>
          {description && <p className="text-gray-400 text-sm">{description}</p>}
          <div className="mt-3 bg-emerald-900/30 border border-emerald-500/50 rounded p-2">
            <p className="text-emerald-200 text-xs">🧪 Test-läge aktiverat - ingen riktig betalning krävs</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-600">
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-300">Belopp:</span>
              <span className="text-white font-semibold">{formatAmount(amount, currency)}</span>
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
                onClick={() => onSuccess({ providerPaymentId: `test_skip_${Date.now()}`, skipped: true })}
                disabled={isProcessing}
                className="w-full rounded-lg bg-slate-700 px-4 py-2 font-semibold text-gray-300 hover:bg-slate-600 disabled:opacity-50 text-sm"
              >
                Fortsätt utan betalning
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

const StripePaymentForm = ({
  title,
  description,
  amount,
  currency,
  clientSecret,
  onSuccess,
  onCancel,
  allowSkip,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isProcessing) return;
    setIsProcessing(true);
    setError('');

    const result = await paymentService.confirmPayment({ clientSecret, stripe, elements });

    if (result.success) {
      onSuccess({ providerPaymentId: result.paymentIntent.id });
    } else {
      setError(result.error || 'Betalningen misslyckades.');
    }

    setIsProcessing(false);
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-slate-600 bg-slate-900 p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-2">{title}</h2>
          {description && <p className="text-gray-400 text-sm">{description}</p>}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-600">
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-300">Belopp:</span>
              <span className="text-white font-semibold">{formatAmount(amount, currency)}</span>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-300">Kortnummer, datum och CVC</label>
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
                {isProcessing ? 'Bearbetar...' : `Betala ${formatAmount(amount, currency)}`}
              </button>
            </div>

            {allowSkip && (
              <button
                type="button"
                onClick={() => onSuccess({ providerPaymentId: `skip_${Date.now()}`, skipped: true })}
                disabled={isProcessing}
                className="w-full rounded-lg bg-slate-700 px-4 py-2 font-semibold text-gray-300 hover:bg-slate-600 disabled:opacity-50 text-sm"
              >
                Fortsätt utan betalning
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

const ExternalPaymentForm = ({
  title,
  description,
  amount,
  currency,
  checkoutUrl,
  onSuccess,
  onCancel,
  allowSkip,
}) => {
  const [reference, setReference] = useState('');
  const [opened, setOpened] = useState(false);

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-slate-600 bg-slate-900 p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-2">{title}</h2>
          {description && <p className="text-gray-400 text-sm">{description}</p>}
        </div>

        <div className="bg-slate-800 rounded-lg p-4 border border-slate-600 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-300">Belopp:</span>
            <span className="text-white font-semibold">{formatAmount(amount, currency)}</span>
          </div>
          {checkoutUrl ? (
            <button
              type="button"
              onClick={() => {
                window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
                setOpened(true);
              }}
              className="w-full rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
            >
              Öppna betalning
            </button>
          ) : (
            <p className="text-sm text-gray-400">Ingen betalningslänk är konfigurerad.</p>
          )}
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Referens (valfritt)</label>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              placeholder="Kvittens-ID eller notering"
            />
          </div>
        </div>

        <div className="space-y-3 pt-4">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg bg-slate-700 px-4 py-2 font-semibold text-gray-200 hover:bg-slate-600"
            >
              Avbryt
            </button>
            <button
              type="button"
              onClick={() => onSuccess({ providerPaymentId: reference || `external_${Date.now()}` })}
              className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
            >
              {opened ? 'Jag har betalat' : 'Bekräfta betalning'}
            </button>
          </div>

          {allowSkip && (
            <button
              type="button"
              onClick={() => onSuccess({ providerPaymentId: `skip_${Date.now()}`, skipped: true })}
              className="w-full rounded-lg bg-slate-700 px-4 py-2 font-semibold text-gray-300 hover:bg-slate-600 text-sm"
            >
              Fortsätt utan betalning
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const PaymentModal = ({
  isOpen,
  title,
  description,
  purpose = 'donation',
  amount,
  currency,
  context = {},
  allowSkip = false,
  onSuccess,
  onCancel,
  paymentConfig: paymentConfigProp
}) => {
  const [paymentConfig, setPaymentConfig] = useState(paymentConfigProp || null);
  const [paymentIntent, setPaymentIntent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stripePromise, setStripePromise] = useState(null);

  const intentPayload = useMemo(() => ({
    purpose,
    amount,
    currency,
    runId: context.runId,
    participantId: context.participantId,
    questionCount: context.questionCount,
    expectedPlayers: context.expectedPlayers,
    userId: context.userId,
    context: context.context
  }), [
    purpose,
    amount,
    currency,
    context.runId,
    context.participantId,
    context.questionCount,
    context.expectedPlayers,
    context.userId,
    context.context
  ]);

  useEffect(() => {
    let isActive = true;
    if (!isOpen) return undefined;

    const loadConfig = async () => {
      const config = paymentConfigProp || await paymentService.getPaymentConfig();
      if (!isActive) return;
      setPaymentConfig(config || null);
    };

    loadConfig();
    return () => {
      isActive = false;
    };
  }, [isOpen, paymentConfigProp]);

  useEffect(() => {
    if (!paymentConfig || !paymentConfig.activeProvider || !paymentConfig.activeProvider.publicKey) {
      setStripePromise(null);
      return;
    }
    setStripePromise(paymentService.getStripeInstance(paymentConfig.activeProvider.publicKey));
  }, [paymentConfig]);

  useEffect(() => {
    let isActive = true;
    if (!isOpen || !paymentConfig) return undefined;

    const createIntent = async () => {
      setLoading(true);
      setError('');
      const result = await paymentService.createPaymentIntent(intentPayload);

      if (!isActive) return;
      setLoading(false);
      if (!result.success) {
        setError(result.error || 'Kunde inte skapa betalning.');
        return;
      }

      if (result.skip) {
        onSuccess({ skipped: true, paymentId: null });
        return;
      }

      setPaymentIntent(result);
    };

    setPaymentIntent(null);
    createIntent();

    return () => {
      isActive = false;
    };
  }, [isOpen, paymentConfig, intentPayload, onSuccess]);

  if (!isOpen) return null;

  if (loading && !paymentIntent) {
    return (
      <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-4">
        <div className="rounded-xl border border-slate-600 bg-slate-900 px-6 py-4 text-gray-200">
          Förbereder betalning...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-md rounded-xl border border-red-500/60 bg-slate-900 p-5 text-red-100">
          <p className="font-semibold">{title || 'Betalning misslyckades'}</p>
          <p className="mt-2 text-sm text-red-200">{error}</p>
          <button
            onClick={onCancel}
            className="mt-4 w-full rounded-lg bg-slate-700 px-4 py-2 font-semibold text-gray-200 hover:bg-slate-600"
          >
            Stäng
          </button>
        </div>
      </div>
    );
  }

  if (!paymentIntent) return null;

  const resolvedAmount = paymentIntent.amount ?? amount ?? 0;
  const resolvedCurrency = paymentIntent.currency || currency || paymentConfig?.currency || 'sek';
  const providerType = paymentIntent.providerType || paymentConfig?.activeProvider?.type || 'external';

  const handleSuccess = async ({ providerPaymentId, skipped }) => {
    if (skipped) {
      onSuccess({ skipped: true, paymentId: paymentIntent.paymentId || null });
      return;
    }

    const record = await paymentService.recordPayment({
      paymentId: paymentIntent.paymentId,
      providerPaymentId: providerPaymentId || paymentIntent.paymentIntentId,
      runId: context.runId,
      participantId: context.participantId,
      userId: context.userId,
    });

    if (!record.success) {
      setError(record.error || 'Kunde inte registrera betalning.');
      return;
    }

    onSuccess({
      paymentId: paymentIntent.paymentId,
      providerPaymentId: providerPaymentId || paymentIntent.paymentIntentId,
      amount: resolvedAmount,
      currency: resolvedCurrency,
    });
  };

  if (paymentService.getTestMode()) {
    return (
      <TestModePaymentForm
        title={title}
        description={description}
        amount={resolvedAmount}
        currency={resolvedCurrency}
        onSuccess={handleSuccess}
        onCancel={onCancel}
        allowSkip={allowSkip}
      />
    );
  }

  if (providerType !== 'stripe') {
    return (
      <ExternalPaymentForm
        title={title}
        description={description}
        amount={resolvedAmount}
        currency={resolvedCurrency}
        checkoutUrl={paymentIntent.checkoutUrl}
        onSuccess={handleSuccess}
        onCancel={onCancel}
        allowSkip={allowSkip}
      />
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <StripePaymentForm
        title={title}
        description={description}
        amount={resolvedAmount}
        currency={resolvedCurrency}
        clientSecret={paymentIntent.clientSecret}
        onSuccess={handleSuccess}
        onCancel={onCancel}
        allowSkip={allowSkip}
      />
    </Elements>
  );
};

export default PaymentModal;
