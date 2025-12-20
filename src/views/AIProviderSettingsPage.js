/**
 * AI Provider Settings Page
 * Superuser interface för att konfigurera vilka AI-providers som ska användas för olika ändamål
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/layout/Header';
// ...existing code...

const BUILTIN_PROVIDERS = {
  gemini: { name: 'Google Gemini', color: 'bg-blue-500', defaultModel: 'gemini-2.0-flash' },
  openai: { name: 'OpenAI GPT-4', color: 'bg-green-500', defaultModel: 'gpt-4o-mini' },
  anthropic: { name: 'Anthropic Claude', color: 'bg-orange-500', defaultModel: 'claude-3-5-sonnet-20241022' },
  mistral: { name: 'Mistral AI', color: 'bg-rose-500', defaultModel: 'mistral-small-latest' },
  groq: { name: 'Groq', color: 'bg-yellow-500', defaultModel: 'llama-3.1-8b-instant' },
  openrouter: { name: 'OpenRouter', color: 'bg-cyan-500', defaultModel: 'openai/gpt-4o-mini' },
  together: { name: 'Together AI', color: 'bg-indigo-500', defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo' },
  fireworks: { name: 'Fireworks AI', color: 'bg-red-500', defaultModel: 'accounts/fireworks/models/llama-v3p1-8b-instruct' }
};

const BUILTIN_ORDER = Object.keys(BUILTIN_PROVIDERS);

const buildDefaultPurposeSettings = () => ({
  generation: BUILTIN_ORDER.reduce((acc, key) => ({ ...acc, [key]: true }), {}),
  validation: BUILTIN_ORDER.reduce((acc, key) => ({ ...acc, [key]: true }), {}),
  migration: BUILTIN_ORDER.reduce((acc, key) => ({ ...acc, [key]: key === 'anthropic' }), {}),
  illustration: BUILTIN_ORDER.reduce((acc, key) => ({ ...acc, [key]: true }), {})
});

const buildDefaultProviderConfigs = () => BUILTIN_ORDER.reduce((acc, key) => {
  const meta = BUILTIN_PROVIDERS[key];
  acc[key] = {
    model: meta.defaultModel,
    apiKey: '',
    hasKey: false,
    keyHint: null,
    keySource: null,
    displayName: meta.name,
    baseUrl: '',
    extraHeaders: '',
    supportsResponseFormat: true,
    maxQuestionsPerRequest: null,
    providerType: 'builtin',
    isCustom: false
  };
  return acc;
}, {});

const AIProviderSettingsPage = () => {
  const { isSuperUser, currentUser } = useAuth();
  const navigate = useNavigate();
  const AUTO_TEST_KEY = 'quizter.aiProviders.autoTestAfterSave';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [providerStatus, setProviderStatus] = useState(null);
  const [providerStatusError, setProviderStatusError] = useState(null);
  const [providerStatusLoading, setProviderStatusLoading] = useState(false);
  const [providerStatusCheckedAt, setProviderStatusCheckedAt] = useState(null);
  const [autoTestEnabled, setAutoTestEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(AUTO_TEST_KEY);
    if (stored === null) return true;
    return stored === 'true';
  });
  const [settings, setSettings] = useState(buildDefaultPurposeSettings);
  const [providerConfigs, setProviderConfigs] = useState(buildDefaultProviderConfigs);
  const [newProvider, setNewProvider] = useState({
    id: '',
    displayName: '',
    baseUrl: '',
    model: '',
    extraHeaders: '',
    supportsResponseFormat: true,
    maxQuestionsPerRequest: ''
  });
  const [customProviderError, setCustomProviderError] = useState(null);

  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
      return;
    }

    loadSettings();
  }, [isSuperUser, navigate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(AUTO_TEST_KEY, String(autoTestEnabled));
  }, [autoTestEnabled]);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/getProviderSettings', {
        headers: {
          'x-user-email': currentUser?.email || ''
        }
      });
      const data = await response.json();
      if (response.ok) {
        if (data.settings?.purposes) {
          setSettings(data.settings.purposes);
        }
        if (data.settings?.providers) {
          setProviderConfigs(() => {
            const next = { ...buildDefaultProviderConfigs() };
            Object.entries(data.settings.providers).forEach(([key, value]) => {
              next[key] = {
                ...next[key],
                ...value,
                apiKey: '',
                displayName: value.displayName || value.label || next[key]?.displayName || key,
                baseUrl: value.baseUrl || next[key]?.baseUrl || '',
                extraHeaders: value.extraHeaders || next[key]?.extraHeaders || '',
                supportsResponseFormat: value.supportsResponseFormat ?? next[key]?.supportsResponseFormat ?? true,
                maxQuestionsPerRequest: value.maxQuestionsPerRequest ?? next[key]?.maxQuestionsPerRequest ?? null,
                providerType: value.providerType || next[key]?.providerType || (value.isCustom ? 'openai_compat' : 'builtin'),
                isCustom: value.isCustom || false
              };
            });
            return next;
          });
        }
      } else {
        throw new Error(data.error || 'Failed to load settings');
      }
    } catch (err) {
      setError(`Kunde inte ladda inställningar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (purpose, provider) => {
    setSettings(prev => ({
      ...prev,
      [purpose]: {
        ...(prev[purpose] || {}),
        [provider]: prev[purpose] ? !prev[purpose][provider] : true
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const providerPayload = Object.entries(providerConfigs).reduce((acc, [key, config]) => {
        acc[key] = {
          model: config.model,
          apiKey: config.apiKey,
          displayName: config.displayName,
          baseUrl: config.baseUrl,
          extraHeaders: config.extraHeaders,
          supportsResponseFormat: config.supportsResponseFormat,
          maxQuestionsPerRequest: config.maxQuestionsPerRequest,
          providerType: config.providerType,
          isCustom: config.isCustom
        };
        return acc;
      }, {});
      const customProviders = Object.entries(providerConfigs)
        .filter(([, config]) => config.isCustom)
        .map(([key]) => key);
      const response = await fetch('/api/updateProviderSettings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': currentUser?.email || ''
        },
        body: JSON.stringify({ settings: { purposes: settings, providers: providerPayload, customProviders } })
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess('✅ Inställningar sparade!');
        if (data.settings?.purposes) {
          setSettings(prev => ({
            ...prev,
            ...data.settings.purposes
          }));
        }
        if (data.settings?.providers) {
          setProviderConfigs(() => {
            const next = { ...buildDefaultProviderConfigs() };
            Object.entries(data.settings.providers).forEach(([key, value]) => {
              next[key] = {
                ...next[key],
                ...value,
                apiKey: '',
                displayName: value.displayName || value.label || next[key]?.displayName || key,
                baseUrl: value.baseUrl || next[key]?.baseUrl || '',
                extraHeaders: value.extraHeaders || next[key]?.extraHeaders || '',
                supportsResponseFormat: value.supportsResponseFormat ?? next[key]?.supportsResponseFormat ?? true,
                maxQuestionsPerRequest: value.maxQuestionsPerRequest ?? next[key]?.maxQuestionsPerRequest ?? null,
                providerType: value.providerType || next[key]?.providerType || (value.isCustom ? 'openai_compat' : 'builtin'),
                isCustom: value.isCustom || false
              };
            });
            return next;
          });
        } else {
          setProviderConfigs(prev => Object.fromEntries(
            Object.entries(prev).map(([key, value]) => [key, { ...value, apiKey: '' }])
          ));
        }
        setTimeout(() => setSuccess(null), 5000);
        if (autoTestEnabled) {
          await handleTestProviders();
        }
      } else {
        throw new Error(data.error || 'Failed to save settings');
      }
    } catch (err) {
      setError(`Kunde inte spara inställningar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestProviders = async () => {
    setProviderStatusError(null);
    setProviderStatusLoading(true);
    try {
      const response = await fetch('/api/getProviderStatus', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': currentUser?.email || ''
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Kunde inte testa providers');
      }
      setProviderStatus(data);
      setProviderStatusCheckedAt(new Date());
    } catch (err) {
      setProviderStatusError(err.message || 'Kunde inte testa providers');
      setProviderStatus(null);
      setProviderStatusCheckedAt(new Date());
    } finally {
      setProviderStatusLoading(false);
    }
  };

  const purposes = [
    {
      key: 'generation',
      title: 'Generering',
      description: 'Vilka providers ska användas för att generera nya frågor',
      icon: '🎯'
    },
    {
      key: 'validation',
      title: 'Validering',
      description: 'Vilka providers ska användas för att validera frågor (fler = bättre kvalitet)',
      icon: '✓'
    },
    {
      key: 'illustration',
      title: 'Illustration (SVG)',
      description: 'Vilka providers ska användas för att generera SVG-illustrationer till frågor',
      icon: '🎨'
    },
    {
      key: 'migration',
      title: 'Migrering',
      description: 'Vilka providers ska användas för schema-migrering (rekommenderat: endast Anthropic)',
      icon: '🔄'
    }
  ];

  const providerList = useMemo(() => {
    const entries = Object.entries(providerConfigs).map(([key, config]) => {
      const meta = BUILTIN_PROVIDERS[key];
      return {
        key,
        name: config?.displayName || meta?.name || key,
        color: meta?.color || 'bg-slate-500',
        isCustom: config?.isCustom === true
      };
    });

    entries.sort((a, b) => {
      const aIndex = BUILTIN_ORDER.indexOf(a.key);
      const bIndex = BUILTIN_ORDER.indexOf(b.key);
      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      }
      return a.name.localeCompare(b.name);
    });

    return entries;
  }, [providerConfigs]);

  if (!isSuperUser) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Header title="AI Provider-inställningar" />
        <div className="flex items-center justify-center pt-32">
          <div className="text-lg text-slate-400">Laddar inställningar...</div>
        </div>
      </div>
    );
  }

  const handleProviderConfigChange = (provider, field, value) => {
    setProviderConfigs(prev => ({
      ...prev,
      [provider]: {
        ...(prev[provider] || {}),
        [field]: value
      }
    }));
  };

  const handleAddCustomProvider = () => {
    setCustomProviderError(null);
    const providerId = (newProvider.id || '').trim().toLowerCase();
    if (!providerId) {
      setCustomProviderError('Ange ett unikt ID för providern.');
      return;
    }
    if (!/^[a-z0-9-_]+$/.test(providerId)) {
      setCustomProviderError('ID får bara innehålla a-z, 0-9, bindestreck och underscore.');
      return;
    }
    if (providerConfigs[providerId]) {
      setCustomProviderError('En provider med samma ID finns redan.');
      return;
    }
    if (!newProvider.baseUrl.trim()) {
      setCustomProviderError('Base URL är obligatorisk för custom providers.');
      return;
    }

    const displayName = newProvider.displayName.trim() || providerId;
    const maxQuestions = newProvider.maxQuestionsPerRequest
      ? Number(newProvider.maxQuestionsPerRequest)
      : null;

    setProviderConfigs(prev => ({
      ...prev,
      [providerId]: {
        model: newProvider.model.trim(),
        apiKey: '',
        hasKey: false,
        keyHint: null,
        keySource: null,
        displayName,
        baseUrl: newProvider.baseUrl.trim(),
        extraHeaders: newProvider.extraHeaders.trim(),
        supportsResponseFormat: newProvider.supportsResponseFormat,
        maxQuestionsPerRequest: Number.isNaN(maxQuestions) ? null : maxQuestions,
        providerType: 'openai_compat',
        isCustom: true
      }
    }));

    setSettings(prev => {
      const next = { ...prev };
      ['generation', 'validation', 'illustration', 'migration'].forEach((purpose) => {
        next[purpose] = {
          ...(next[purpose] || {}),
          [providerId]: purpose === 'migration' ? false : purpose !== 'illustration'
        };
      });
      return next;
    });

    setNewProvider({
      id: '',
      displayName: '',
      baseUrl: '',
      model: '',
      extraHeaders: '',
      supportsResponseFormat: true,
      maxQuestionsPerRequest: ''
    });
  };

  const handlePrefillCustomExample = () => {
    setNewProvider({
      id: 'custom-llm',
      displayName: 'Custom LLM',
      baseUrl: 'https://api.example.com/v1/chat/completions',
      model: 'my-model-001',
      extraHeaders: '{"x-app-id":"quizter"}',
      supportsResponseFormat: true,
      maxQuestionsPerRequest: '20'
    });
  };

  const handleRemoveCustomProvider = (providerId) => {
    if (!window.confirm(`Ta bort custom providern "${providerId}"?`)) return;

    setProviderConfigs(prev => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });

    setSettings(prev => {
      const next = { ...prev };
      Object.keys(next).forEach((purpose) => {
        if (next[purpose]) {
          const { [providerId]: removed, ...rest } = next[purpose];
          next[purpose] = rest;
        }
      });
      return next;
    });
  };

  const formatKeyStatus = (providerKey) => {
    const config = providerConfigs[providerKey];
    if (!config?.hasKey) return 'Ej konfigurerad';
    if (config.keySource === 'env') return 'Konfigurerad via env';
    if (config.keyHint) return `Sparad nyckel ••••${config.keyHint}`;
    return 'Nyckel sparad';
  };

  const STATUS_LABELS = {
    active: 'Aktiv',
    no_credits: 'Inga krediter',
    rate_limited: 'Rate limit',
    auth_error: 'Auth-fel',
    error: 'Fel'
  };

  const STATUS_BADGES = {
    active: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40',
    no_credits: 'bg-amber-500/20 text-amber-200 border border-amber-500/40',
    rate_limited: 'bg-amber-500/20 text-amber-200 border border-amber-500/40',
    auth_error: 'bg-red-500/20 text-red-200 border border-red-500/40',
    error: 'bg-red-500/20 text-red-200 border border-red-500/40'
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header title="AI Provider-inställningar" />
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6 pt-24">
        {/* Info section */}
        <section className="rounded-xl bg-slate-900 border border-slate-800 p-6">
          <h2 className="text-lg font-semibold text-cyan-200 mb-2">Om Provider-inställningar</h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            Här kan du konfigurera vilka AI-providers som ska användas för olika ändamål.
            Providers som är inaktiverade kommer inte att användas, även om de är konfigurerade med API-nycklar.
          </p>
          <div className="mt-4 space-y-2 text-sm text-slate-400">
            <div>• <strong className="text-slate-300">Generering:</strong> Providers roteras slumpmässigt för variation</div>
            <div>• <strong className="text-slate-300">Validering:</strong> Alla aktiverade providers används parallellt för högre kvalitet</div>
            <div>• <strong className="text-slate-300">Migrering:</strong> Endast en provider används (rekommenderat: Anthropic)</div>
          </div>
        </section>

        {error && (
          <div className="rounded-xl bg-red-900/40 border border-red-500/40 p-4 text-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl bg-green-900/40 border border-green-500/40 p-4 text-green-200">
            {success}
          </div>
        )}

        {/* API keys + models */}
        <section className="rounded-xl bg-slate-900 border border-slate-800 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">🔐 API-nycklar & modeller</h3>
              <p className="text-sm text-slate-400 mt-1">
                Nycklar lagras krypterat i databasen. Lämna tomt om du vill behålla befintlig nyckel.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {providerList.map(provider => {
              const config = providerConfigs[provider.key] || {};
              return (
                <div key={provider.key} className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${provider.color}`} />
                      <span className="font-medium text-white">{provider.name}</span>
                      {provider.isCustom && (
                        <span className="text-[10px] uppercase tracking-wide text-slate-400 border border-slate-700 rounded px-1.5 py-0.5">
                          Custom
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">{formatKeyStatus(provider.key)}</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs text-slate-400">Modell</label>
                      <input
                        value={config.model || ''}
                        onChange={(event) => handleProviderConfigChange(provider.key, 'model', event.target.value)}
                        className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        placeholder="Ange modell-ID"
                      />
                      <div className="mt-1 text-xs text-slate-500">
                        Ange exakt modell-ID från provider. Lämna standard om du är osäker.
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">API-nyckel</label>
                      <input
                        type="password"
                        value={config.apiKey || ''}
                        onChange={(event) => handleProviderConfigChange(provider.key, 'apiKey', event.target.value)}
                        className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        placeholder="Lämna tomt för att behålla"
                        autoComplete="new-password"
                      />
                      <div className="mt-1 text-xs text-slate-500">
                        Nyckeln visas aldrig igen efter sparning.
                      </div>
                    </div>
                  </div>

                  {provider.isCustom && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="text-xs text-slate-400">Display name</label>
                        <input
                          value={config.displayName || ''}
                          onChange={(event) => handleProviderConfigChange(provider.key, 'displayName', event.target.value)}
                          className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          placeholder="Visningsnamn"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400">Base URL</label>
                        <input
                          value={config.baseUrl || ''}
                          onChange={(event) => handleProviderConfigChange(provider.key, 'baseUrl', event.target.value)}
                          className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          placeholder="https://api.example.com/v1/chat/completions"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs text-slate-400">Extra headers (JSON)</label>
                        <textarea
                          rows={3}
                          value={config.extraHeaders || ''}
                          onChange={(event) => handleProviderConfigChange(provider.key, 'extraHeaders', event.target.value)}
                          className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          placeholder='{"x-app-id":"quizter"}'
                        />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={config.supportsResponseFormat !== false}
                          onChange={(event) => handleProviderConfigChange(provider.key, 'supportsResponseFormat', event.target.checked)}
                          className="w-4 h-4 bg-slate-700 border-slate-600 rounded"
                        />
                        Stöd för response_format (JSON)
                      </div>
                      <div>
                        <label className="text-xs text-slate-400">Max frågor per request</label>
                        <input
                          type="number"
                          min="1"
                          value={config.maxQuestionsPerRequest ?? ''}
                          onChange={(event) => handleProviderConfigChange(provider.key, 'maxQuestionsPerRequest', event.target.value)}
                          className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          placeholder="50"
                        />
                      </div>
                      <div className="md:col-span-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomProvider(provider.key)}
                          className="text-xs text-red-300 hover:text-red-200"
                        >
                          Ta bort provider
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Custom providers */}
        <section className="rounded-xl bg-slate-900 border border-slate-800 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">➕ Custom providers</h3>
              <p className="text-sm text-slate-400 mt-1">
                Lägg till OpenAI-kompatibla endpoints (chat/completions). Du kan lägga till flera.
              </p>
            </div>
            <button
              type="button"
              onClick={handlePrefillCustomExample}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:text-white"
            >
              Fyll exempel
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-slate-400">Provider-ID</label>
              <input
                value={newProvider.id}
                onChange={(event) => setNewProvider(prev => ({ ...prev, id: event.target.value }))}
                className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="custom-llm"
              />
              <div className="mt-1 text-xs text-slate-500">Används internt och i databasen.</div>
            </div>
            <div>
              <label className="text-xs text-slate-400">Visningsnamn</label>
              <input
                value={newProvider.displayName}
                onChange={(event) => setNewProvider(prev => ({ ...prev, displayName: event.target.value }))}
                className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="Custom LLM"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-slate-400">Base URL</label>
              <input
                value={newProvider.baseUrl}
                onChange={(event) => setNewProvider(prev => ({ ...prev, baseUrl: event.target.value }))}
                className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="https://api.example.com/v1/chat/completions"
              />
              <div className="mt-1 text-xs text-slate-500">Peka direkt på chat/completions-endpoint.</div>
            </div>
            <div>
              <label className="text-xs text-slate-400">Modell</label>
              <input
                value={newProvider.model}
                onChange={(event) => setNewProvider(prev => ({ ...prev, model: event.target.value }))}
                className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="my-model-001"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Max frågor per request</label>
              <input
                type="number"
                min="1"
                value={newProvider.maxQuestionsPerRequest}
                onChange={(event) => setNewProvider(prev => ({ ...prev, maxQuestionsPerRequest: event.target.value }))}
                className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="50"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-slate-400">Extra headers (JSON)</label>
              <textarea
                rows={3}
                value={newProvider.extraHeaders}
                onChange={(event) => setNewProvider(prev => ({ ...prev, extraHeaders: event.target.value }))}
                className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder='{"x-app-id":"quizter"}'
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={newProvider.supportsResponseFormat}
                onChange={(event) => setNewProvider(prev => ({ ...prev, supportsResponseFormat: event.target.checked }))}
                className="w-4 h-4 bg-slate-700 border-slate-600 rounded"
              />
              Stöd response_format (JSON)
            </div>
          </div>

          {customProviderError && (
            <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {customProviderError}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleAddCustomProvider}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-400"
            >
              Lägg till provider
            </button>
          </div>
        </section>

        {/* Provider tests */}
        <section className="rounded-xl bg-slate-900 border border-slate-800 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">🧪 Testa providers</h3>
              <p className="text-sm text-slate-400 mt-1">
                Kör en snabb statuskontroll för att se om nycklar och modeller fungerar.
              </p>
              {providerStatusCheckedAt && (
                <div className="mt-2 text-xs text-slate-500">
                  Senast testad: {providerStatusCheckedAt.toLocaleString('sv-SE')}
                </div>
              )}
            </div>
            <button
              onClick={handleTestProviders}
              disabled={providerStatusLoading}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 transition-colors disabled:opacity-60"
            >
              {providerStatusLoading ? 'Testar...' : 'Kör test'}
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400 mb-4">
            <span>Auto-test efter sparning</span>
            <button
              onClick={() => setAutoTestEnabled((prev) => !prev)}
              className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
                autoTestEnabled ? 'bg-cyan-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoTestEnabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {providerStatusError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {providerStatusError}
            </div>
          )}

          {providerStatus && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                Status: {providerStatus.summary?.active || 0}/{providerStatus.summary?.total || 0} aktiva
              </div>
              {providerStatus.providers?.map((provider) => {
                const statusKey = provider.status || 'error';
                return (
                  <div key={provider.name} className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium text-white">{provider.label || provider.name}</div>
                      <span className={`text-xs px-2 py-1 rounded-full ${STATUS_BADGES[statusKey] || STATUS_BADGES.error}`}>
                        {STATUS_LABELS[statusKey] || 'Okänd status'}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      Modell: {provider.model || '—'}
                    </div>
                    {provider.error && (
                      <div className="mt-2 text-xs text-slate-500">
                        {provider.error}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Settings sections */}
        {purposes.map(purpose => (
          <section key={purpose.key} className="rounded-xl bg-slate-900 border border-slate-800 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span>{purpose.icon}</span>
                  {purpose.title}
                </h3>
                <p className="text-sm text-slate-400 mt-1">{purpose.description}</p>
              </div>
              <div className="text-xs text-slate-500">
                {settings[purpose.key] ? Object.values(settings[purpose.key]).filter(Boolean).length : 0} / {providerList.length} aktiva
              </div>
            </div>

            <div className="space-y-3">
              {providerList.map(provider => {
                const isEnabled = settings[purpose.key] ? settings[purpose.key][provider.key] : false;
                return (
                  <div
                    key={provider.key}
                    className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                      isEnabled
                        ? 'bg-slate-800 border-cyan-500/30'
                        : 'bg-slate-900/50 border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${provider.color}`} />
                      <span className={`font-medium ${isEnabled ? 'text-white' : 'text-slate-500'}`}>
                        {provider.name}
                      </span>
                    </div>
                    <button
                      onClick={() => handleToggle(purpose.key, provider.key)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isEnabled ? 'bg-cyan-500' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 min-w-[200px] rounded-lg bg-cyan-500 px-6 py-3 font-bold text-black hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-400 transition-colors"
          >
            {saving ? '💾 Sparar...' : '💾 Spara inställningar'}
          </button>
          <button
            onClick={() => navigate('/admin/tasks')}
            className="rounded-lg bg-slate-700 px-6 py-3 font-semibold text-white hover:bg-slate-600 transition-colors"
          >
            Tillbaka
          </button>
        </div>
      </main>
    </div>
  );
};

export default AIProviderSettingsPage;
