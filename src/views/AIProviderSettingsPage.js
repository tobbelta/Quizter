/**
 * AI Provider Settings Page
 * Superuser interface för att konfigurera vilka AI-providers som ska användas för olika ändamål
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/layout/Header';
// ...existing code...

const AIProviderSettingsPage = () => {
  const { isSuperUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [settings, setSettings] = useState({
    generation: {
      anthropic: true,
      openai: true,
      gemini: true
    },
    validation: {
      anthropic: true,
      openai: true,
      gemini: true
    },
    migration: {
      anthropic: true,
      openai: false,
      gemini: false
    },
    illustration: {
      anthropic: true,
      openai: true,
      gemini: true
    }
  });

  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
      return;
    }

    loadSettings();
  }, [isSuperUser, navigate]);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/getProviderSettings');
      const data = await response.json();
      if (response.ok) {
        setSettings(prev => ({
          ...prev,
          ...data.settings
        }));
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
      const response = await fetch('/api/updateProviderSettings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ settings })
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess('✅ Inställningar sparade!');
        setTimeout(() => setSuccess(null), 5000);
      } else {
        throw new Error(data.error || 'Failed to save settings');
      }
    } catch (err) {
      setError(`Kunde inte spara inställningar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

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

  const providers = [
    { key: 'anthropic', name: 'Anthropic Claude', color: 'bg-orange-500' },
    { key: 'openai', name: 'OpenAI GPT-4', color: 'bg-green-500' },
    { key: 'gemini', name: 'Google Gemini', color: 'bg-blue-500' }
  ];

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
                {settings[purpose.key] ? Object.values(settings[purpose.key]).filter(Boolean).length : 0} / {providers.length} aktiva
              </div>
            </div>

            <div className="space-y-3">
              {providers.map(provider => {
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
            onClick={() => navigate('/superuser/tasks')}
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
