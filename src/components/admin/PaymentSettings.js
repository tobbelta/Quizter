/**
 * PaymentSettings - Komponent för administratörer att hantera betalningsinställningar
 */
import React, { useState, useEffect } from 'react';
import { paymentService } from '../../services/paymentService';

const PaymentSettings = () => {
  const [isTestMode, setIsTestMode] = useState(false);

  useEffect(() => {
    setIsTestMode(paymentService.getTestMode());
  }, []);

  const handleTestModeToggle = () => {
    const newTestMode = !isTestMode;
    paymentService.setTestMode(newTestMode);
    setIsTestMode(newTestMode);
  };

  return (
    <div className="rounded border border-slate-600 bg-slate-900/60 p-4">
      <h3 className="text-lg font-semibold mb-3 text-cyan-200">Betalningsinställningar</h3>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <label className="text-sm font-semibold text-slate-200">Test-läge för betalningar</label>
            <p className="text-xs text-gray-400 mt-1">
              Aktiverar test-läge där användare kan ansluta utan riktig betalning
            </p>
          </div>
          <button
            type="button"
            onClick={handleTestModeToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isTestMode ? 'bg-emerald-500' : 'bg-slate-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isTestMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className={`rounded-lg border p-3 text-sm ${
          isTestMode
            ? 'border-emerald-500/50 bg-emerald-900/20 text-emerald-100'
            : 'border-slate-600 bg-slate-800/50 text-gray-300'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <span>{isTestMode ? '🧪' : '💳'}</span>
            <span className="font-semibold">
              {isTestMode ? 'Test-läge aktiverat' : 'Produktionsläge aktiverat'}
            </span>
          </div>
          <p>
            {isTestMode
              ? 'Användare kan ansluta till rundor utan att betala. Perfekt för testning och utveckling.'
              : 'Användare måste genomföra riktig betalning (5 kr) för att ansluta till rundor.'
            }
          </p>
        </div>

        {!isTestMode && (
          <div className="bg-amber-900/30 border border-amber-500/50 rounded-lg p-3 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <span>⚠️</span>
              <span className="font-semibold text-amber-200">Produktionsläge</span>
            </div>
            <p className="text-amber-100">
              Kontrollera att Stripe-konfigurationen är korrekt innan du aktiverar produktionsläge.
              Du behöver giltiga API-nycklar och webhook-endpoints.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentSettings;