/**
 * AdminPaymentsPage - Hantera betalningsinställningar
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/layout/Header';
import { paymentService } from '../services/paymentService';

const toMinor = (value) => Math.max(0, Math.round(Number(value) * 100));
const toMajor = (value) => (Number(value || 0) / 100).toFixed(2);

const currencyOptions = ['sek', 'eur', 'usd', 'nok', 'dkk'];

const AdminPaymentsPage = () => {
  const { isSuperUser, currentUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [settings, setSettings] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [newProvider, setNewProvider] = useState({
    id: '',
    label: '',
    type: 'external',
    methods: ['card'],
    publicKey: '',
    secretKey: '',
    checkoutUrlTemplate: ''
  });

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await paymentService.getPaymentSettings(currentUser?.email || '');
      setSettings(data.settings || null);
      setCatalog(data.catalog || null);
    } catch (err) {
      setError(`Kunde inte ladda betalningsinställningar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.email]);

  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
      return;
    }

    loadSettings();
  }, [isSuperUser, loadSettings, navigate]);

  const providerList = useMemo(() => settings?.providers || [], [settings?.providers]);
  const methodCatalog = useMemo(() => catalog?.methods || [], [catalog?.methods]);

  const updateSettings = (updates) => {
    setSettings((prev) => ({
      ...prev,
      ...updates,
    }));
  };

  const updateNested = (path, value) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      let cursor = next;
      for (let i = 0; i < path.length - 1; i += 1) {
        const key = path[i];
        cursor[key] = { ...(cursor[key] || {}) };
        cursor = cursor[key];
      }
      cursor[path[path.length - 1]] = value;
      return next;
    });
  };

  const updateProvider = (providerId, updates) => {
    setSettings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        providers: prev.providers.map((provider) => (
          provider.id === providerId
            ? { ...provider, ...updates }
            : provider
        ))
      };
    });
  };

  const addTier = (tierKey) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const tiers = Array.isArray(prev.perRun?.[tierKey]) ? prev.perRun[tierKey] : [];
      return {
        ...prev,
        perRun: {
          ...prev.perRun,
          [tierKey]: [...tiers, { min: 1, max: null, amount: 0 }]
        }
      };
    });
  };

  const updateTier = (tierKey, index, field, value) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const tiers = Array.isArray(prev.perRun?.[tierKey]) ? [...prev.perRun[tierKey]] : [];
      const current = { ...(tiers[index] || {}) };
      current[field] = value;
      tiers[index] = current;
      return {
        ...prev,
        perRun: {
          ...prev.perRun,
          [tierKey]: tiers
        }
      };
    });
  };

  const removeTier = (tierKey, index) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const tiers = Array.isArray(prev.perRun?.[tierKey]) ? [...prev.perRun[tierKey]] : [];
      tiers.splice(index, 1);
      return {
        ...prev,
        perRun: {
          ...prev.perRun,
          [tierKey]: tiers
        }
      };
    });
  };

  const addDonationAmount = () => {
    setSettings((prev) => {
      if (!prev) return prev;
      const amounts = Array.isArray(prev.donations?.amounts) ? [...prev.donations.amounts] : [];
      amounts.push(1000);
      return {
        ...prev,
        donations: {
          ...prev.donations,
          amounts
        }
      };
    });
  };

  const updateDonationAmount = (index, value) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const amounts = Array.isArray(prev.donations?.amounts) ? [...prev.donations.amounts] : [];
      amounts[index] = toMinor(value);
      return {
        ...prev,
        donations: {
          ...prev.donations,
          amounts
        }
      };
    });
  };

  const removeDonationAmount = (index) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const amounts = Array.isArray(prev.donations?.amounts) ? [...prev.donations.amounts] : [];
      amounts.splice(index, 1);
      return {
        ...prev,
        donations: {
          ...prev.donations,
          amounts
        }
      };
    });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await paymentService.savePaymentSettings(settings, currentUser?.email || '');
      setSettings(response.settings || settings);
      setCatalog(response.catalog || catalog);
      setSuccess('Betalningsinställningar sparade.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addCustomProvider = () => {
    if (!newProvider.id.trim()) {
      setError('Ange ett id för den nya providern.');
      return;
    }
    const normalizedId = newProvider.id.trim().toLowerCase();
    if (providerList.some((provider) => provider.id === normalizedId)) {
      setError('En provider med detta id finns redan.');
      return;
    }
    const entry = {
      id: normalizedId,
      label: newProvider.label.trim() || normalizedId,
      type: newProvider.type || 'external',
      methods: newProvider.methods || ['card'],
      isEnabled: true,
      publicKey: newProvider.publicKey || '',
      secretKey: newProvider.secretKey || '',
      checkoutUrlTemplate: newProvider.checkoutUrlTemplate || '',
      isCustom: true,
    };
    setSettings((prev) => ({
      ...prev,
      providers: [...(prev.providers || []), entry]
    }));
    setNewProvider({
      id: '',
      label: '',
      type: 'external',
      methods: ['card'],
      publicKey: '',
      secretKey: '',
      checkoutUrlTemplate: ''
    });
  };

  const activeProvider = useMemo(() => (
    providerList.find((provider) => provider.id === settings?.activeProviderId) || null
  ), [providerList, settings?.activeProviderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <Header title="Betalningar" />
        <div className="mx-auto max-w-4xl px-4 pt-24 pb-10 text-gray-200">
          Laddar betalningsinställningar...
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-slate-950">
        <Header title="Betalningar" />
        <div className="mx-auto max-w-4xl px-4 pt-24 pb-10 text-gray-200">
          Ingen betalningskonfiguration hittades.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title="Betalningar" />
      <div className="mx-auto max-w-5xl px-4 pt-24 pb-10 space-y-8">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
          <h1 className="text-2xl font-semibold text-slate-100">Betalningsinställningar</h1>
          <p className="text-sm text-gray-400 mt-1">Konfigurera providers, priser och regler för betalningar.</p>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-900/40 px-4 py-3 text-red-100">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-900/30 px-4 py-3 text-emerald-100">
            {success}
          </div>
        )}

        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-100">Aktiv provider</h2>
          <select
            value={settings.activeProviderId || ''}
            onChange={(event) => updateSettings({ activeProviderId: event.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
          >
            <option value="">Ingen aktiv provider</option>
            {providerList.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.label}</option>
            ))}
          </select>
          {activeProvider && !activeProvider.hasSecret && (
            <p className="text-sm text-amber-200">Aktiv provider saknar hemlig nyckel.</p>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-100">Betalningspolicy</h2>
            <div className="space-y-2">
              <label className="text-sm text-gray-300">Vem ska betala?</label>
              <select
                value={settings.payer}
                onChange={(event) => updateSettings({ payer: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              >
                <option value="host">Värd</option>
                <option value="player">Spelare</option>
                <option value="split">Båda (delar)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-gray-300">Valuta</label>
              <select
                value={settings.currency}
                onChange={(event) => updateSettings({ currency: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              >
                {currencyOptions.map((option) => (
                  <option key={option} value={option}>{option.toUpperCase()}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-gray-300">Anonyma spelare</label>
              <select
                value={settings.anonymous?.policy || 'allow'}
                onChange={(event) => updateNested(['anonymous', 'policy'], event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              >
                <option value="allow">Tillåt</option>
                <option value="limit">Begränsa</option>
                <option value="block">Blockera</option>
              </select>
              {settings.anonymous?.policy === 'limit' && (
                <div className="mt-2">
                  <label className="text-xs text-gray-400">Max antal oregistrerade per runda</label>
                  <input
                    type="number"
                    min="0"
                    value={settings.anonymous?.maxPerRun || 0}
                    onChange={(event) => updateNested(['anonymous', 'maxPerRun'], Number(event.target.value) || 0)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-100">Betalningsmetoder</h2>
            <div className="flex flex-wrap gap-2">
              {methodCatalog.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => {
                    const enabled = settings.enabledMethods || [];
                    const isActive = enabled.includes(method.id);
                    const next = isActive
                      ? enabled.filter((item) => item !== method.id)
                      : [...enabled, method.id];
                    updateSettings({ enabledMethods: next });
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    settings.enabledMethods?.includes(method.id)
                      ? 'bg-cyan-500 text-black'
                      : 'bg-slate-800 text-gray-200 hover:bg-slate-700'
                  }`}
                >
                  {method.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-100">Prenumeration</h2>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={Boolean(settings.subscription?.enabled)}
              onChange={(event) => updateNested(['subscription', 'enabled'], event.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-emerald-500"
            />
            Aktivera prenumeration
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs text-gray-400">Period</label>
              <select
                value={settings.subscription?.period || 'month'}
                onChange={(event) => updateNested(['subscription', 'period'], event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              >
                <option value="month">Månad</option>
                <option value="year">År</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400">Belopp ({settings.currency.toUpperCase()})</label>
              <input
                type="number"
                min="0"
                value={toMajor(settings.subscription?.amount || 0)}
                onChange={(event) => updateNested(['subscription', 'amount'], toMinor(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-slate-100">Pris per runda</h2>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={Boolean(settings.perRun?.enabled)}
              onChange={(event) => updateNested(['perRun', 'enabled'], event.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-emerald-500"
            />
            Aktivera debitering per runda
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs text-gray-400">Basbelopp ({settings.currency.toUpperCase()})</label>
              <input
                type="number"
                min="0"
                value={toMajor(settings.perRun?.baseAmount || 0)}
                onChange={(event) => updateNested(['perRun', 'baseAmount'], toMinor(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Prisintervall per antal spelare</h3>
              <button
                type="button"
                onClick={() => addTier('playerTiers')}
                className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-slate-600"
              >
                Lägg till
              </button>
            </div>
            {(settings.perRun?.playerTiers || []).map((tier, index) => (
              <div key={`player-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input
                  type="number"
                  min="1"
                  value={tier.min || 0}
                  onChange={(event) => updateTier('playerTiers', index, 'min', Number(event.target.value) || 0)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                  placeholder="Min"
                />
                <input
                  type="number"
                  min="0"
                  value={tier.max ?? ''}
                  onChange={(event) => updateTier('playerTiers', index, 'max', event.target.value === '' ? null : Number(event.target.value))}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                  placeholder="Max (tom = ingen)"
                />
                <input
                  type="number"
                  min="0"
                  value={toMajor(tier.amount || 0)}
                  onChange={(event) => updateTier('playerTiers', index, 'amount', toMinor(event.target.value))}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                  placeholder="Belopp"
                />
                <button
                  type="button"
                  onClick={() => removeTier('playerTiers', index)}
                  className="rounded-lg bg-slate-700 px-3 py-2 text-xs text-gray-200 hover:bg-slate-600"
                >
                  Ta bort
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Prisintervall per antal frågor</h3>
              <button
                type="button"
                onClick={() => addTier('questionTiers')}
                className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-slate-600"
              >
                Lägg till
              </button>
            </div>
            {(settings.perRun?.questionTiers || []).map((tier, index) => (
              <div key={`question-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input
                  type="number"
                  min="1"
                  value={tier.min || 0}
                  onChange={(event) => updateTier('questionTiers', index, 'min', Number(event.target.value) || 0)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                  placeholder="Min"
                />
                <input
                  type="number"
                  min="0"
                  value={tier.max ?? ''}
                  onChange={(event) => updateTier('questionTiers', index, 'max', event.target.value === '' ? null : Number(event.target.value))}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                  placeholder="Max (tom = ingen)"
                />
                <input
                  type="number"
                  min="0"
                  value={toMajor(tier.amount || 0)}
                  onChange={(event) => updateTier('questionTiers', index, 'amount', toMinor(event.target.value))}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                  placeholder="Belopp"
                />
                <button
                  type="button"
                  onClick={() => removeTier('questionTiers', index)}
                  className="rounded-lg bg-slate-700 px-3 py-2 text-xs text-gray-200 hover:bg-slate-600"
                >
                  Ta bort
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-100">Donationer</h2>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={Boolean(settings.donations?.enabled)}
              onChange={(event) => updateNested(['donations', 'enabled'], event.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-emerald-500"
            />
            Aktivera donationer
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={Boolean(settings.donations?.placements?.landing)}
                onChange={(event) => updateNested(['donations', 'placements'], {
                  ...settings.donations?.placements,
                  landing: event.target.checked
                })}
                className="rounded border-slate-600 bg-slate-800 text-emerald-500"
              />
              Startsida
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={Boolean(settings.donations?.placements?.createRun)}
                onChange={(event) => updateNested(['donations', 'placements'], {
                  ...settings.donations?.placements,
                  createRun: event.target.checked
                })}
                className="rounded border-slate-600 bg-slate-800 text-emerald-500"
              />
              Skapa runda
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={Boolean(settings.donations?.placements?.afterRun)}
                onChange={(event) => updateNested(['donations', 'placements'], {
                  ...settings.donations?.placements,
                  afterRun: event.target.checked
                })}
                className="rounded border-slate-600 bg-slate-800 text-emerald-500"
              />
              Efter runda
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={Boolean(settings.donations?.placements?.menu)}
                onChange={(event) => updateNested(['donations', 'placements'], {
                  ...settings.donations?.placements,
                  menu: event.target.checked
                })}
                className="rounded border-slate-600 bg-slate-800 text-emerald-500"
              />
              Meny
            </label>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Förvalda belopp ({settings.currency.toUpperCase()})</h3>
              <button
                type="button"
                onClick={addDonationAmount}
                className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-slate-600"
              >
                Lägg till
              </button>
            </div>
            {(settings.donations?.amounts || []).map((amount, index) => (
              <div key={`donation-${index}`} className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={toMajor(amount)}
                  onChange={(event) => updateDonationAmount(index, event.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => removeDonationAmount(index)}
                  className="rounded-lg bg-slate-700 px-3 py-2 text-xs text-gray-200 hover:bg-slate-600"
                >
                  Ta bort
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-100">Providers</h2>
          <div className="grid gap-4">
            {providerList.map((provider) => (
              <div key={provider.id} className="rounded-xl border border-slate-700 bg-slate-900/80 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-100">{provider.label}</h3>
                    <p className="text-xs text-gray-400">{provider.type}</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={provider.isEnabled !== false}
                      onChange={(event) => updateProvider(provider.id, { isEnabled: event.target.checked })}
                      className="rounded border-slate-600 bg-slate-800 text-emerald-500"
                    />
                    Aktiv
                  </label>
                </div>
                {provider.type === 'stripe' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-gray-400">Public key</label>
                      <input
                        type="text"
                        value={provider.publicKey || ''}
                        onChange={(event) => updateProvider(provider.id, { publicKey: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">Secret key</label>
                      <input
                        type="password"
                        value={provider.secretKey || ''}
                        placeholder={provider.hasSecret ? provider.secretHint || 'Sparad' : ''}
                        onChange={(event) => updateProvider(provider.id, { secretKey: event.target.value, clearSecret: false })}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                      />
                      {provider.hasSecret && (
                        <button
                          type="button"
                          onClick={() => updateProvider(provider.id, { clearSecret: true, secretKey: '' })}
                          className="mt-2 text-xs text-amber-200 hover:text-amber-100"
                        >
                          Rensa sparad nyckel
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {provider.type !== 'stripe' && (
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400">
                      {'Checkout URL (använd {paymentId}, {amount}, {currency})'}
                    </label>
                    <input
                      type="text"
                      value={provider.checkoutUrlTemplate || ''}
                      onChange={(event) => updateProvider(provider.id, { checkoutUrlTemplate: event.target.value })}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                    />
                    <label className="text-xs text-gray-400">Secret key</label>
                    <input
                      type="password"
                      value={provider.secretKey || ''}
                      placeholder={provider.hasSecret ? provider.secretHint || 'Sparad' : ''}
                      onChange={(event) => updateProvider(provider.id, { secretKey: event.target.value, clearSecret: false })}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                    />
                    {provider.hasSecret && (
                      <button
                        type="button"
                        onClick={() => updateProvider(provider.id, { clearSecret: true, secretKey: '' })}
                        className="text-xs text-amber-200 hover:text-amber-100"
                      >
                        Rensa sparad nyckel
                      </button>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {(provider.methods || []).map((method) => (
                    <span key={method} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-gray-300">
                      {method}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-100">Lägg till custom provider</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-gray-400">ID</label>
              <input
                type="text"
                value={newProvider.id}
                onChange={(event) => setNewProvider((prev) => ({ ...prev, id: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Namn</label>
              <input
                type="text"
                value={newProvider.label}
                onChange={(event) => setNewProvider((prev) => ({ ...prev, label: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Secret key</label>
              <input
                type="password"
                value={newProvider.secretKey}
                onChange={(event) => setNewProvider((prev) => ({ ...prev, secretKey: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Checkout URL</label>
              <input
                type="text"
                value={newProvider.checkoutUrlTemplate}
                onChange={(event) => setNewProvider((prev) => ({ ...prev, checkoutUrlTemplate: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={addCustomProvider}
            className="rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-black hover:bg-indigo-400"
          >
            Lägg till provider
          </button>
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-emerald-500 px-5 py-2 font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
          >
            {saving ? 'Sparar...' : 'Spara inställningar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminPaymentsPage;
