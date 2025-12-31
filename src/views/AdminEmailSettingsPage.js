/**
 * Admin: E-postinställningar
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import { useAuth } from '../context/AuthContext';
import { emailSettingsService } from '../services/emailSettingsService';

const AdminEmailSettingsPage = () => {
  const navigate = useNavigate();
  const { isSuperUser, currentUser } = useAuth();
  const [settings, setSettings] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const loadSettings = useCallback(async () => {
    if (!isSuperUser) return;
    setError('');
    try {
      const response = await emailSettingsService.getEmailSettings(currentUser?.email || '');
      setSettings(response.settings || null);
    } catch (fetchError) {
      setError(fetchError.message || 'Kunde inte hämta e-postinställningar.');
    }
  }, [currentUser?.email, isSuperUser]);

  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
      return;
    }
    loadSettings();
  }, [isSuperUser, loadSettings, navigate]);

  const updateSettings = (updates) => {
    setSettings((prev) => ({
      ...prev,
      ...updates
    }));
  };

  const updateProvider = (id, updates) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const providers = (prev.providers || []).map((provider) => {
        if (provider.id !== id) return provider;
        return { ...provider, ...updates };
      });
      return { ...prev, providers };
    });
  };

  const providerList = useMemo(() => settings?.providers || [], [settings?.providers]);
  const activeProvider = providerList.find((provider) => provider.id === settings?.activeProviderId) || null;

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    setStatus('');
    setError('');
    try {
      const response = await emailSettingsService.saveEmailSettings(settings, currentUser?.email || '');
      setSettings(response.settings || settings);
      setStatus('Inställningarna är sparade.');
    } catch (saveError) {
      setError(saveError.message || 'Kunde inte spara inställningarna.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="min-h-screen bg-slate-950">
        <Header title="E-postinställningar" />
        <div className="max-w-4xl mx-auto px-4 pt-24 text-gray-200">Laddar...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title="E-postinställningar" />
      <div className="max-w-5xl mx-auto px-4 pt-24 pb-12 space-y-6">
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Grundinställningar</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300">Avsändaradress</label>
              <input
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-2"
                value={settings.fromEmail || ''}
                onChange={(event) => updateSettings({ fromEmail: event.target.value })}
                placeholder="no-reply@quizter.se"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300">Avsändarnamn</label>
              <input
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-2"
                value={settings.fromName || ''}
                onChange={(event) => updateSettings({ fromName: event.target.value })}
                placeholder="Quizter"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300">Reply-to (valfritt)</label>
              <input
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-2"
                value={settings.replyTo || ''}
                onChange={(event) => updateSettings({ replyTo: event.target.value })}
                placeholder="support@quizter.se"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300">Aktiv provider</label>
              <select
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-2"
                value={settings.activeProviderId || ''}
                onChange={(event) => updateSettings({ activeProviderId: event.target.value })}
              >
                {providerList.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>
                ))}
              </select>
              {activeProvider && (!activeProvider.hasSecret || !activeProvider.isEnabled) && (
                <p className="mt-1 text-xs text-amber-300">Aktiv provider saknar API-nyckel eller är avstängd.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300">Spara loggar (dagar)</label>
              <select
                className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-2"
                value={settings.retentionDays || 90}
                onChange={(event) => updateSettings({ retentionDays: Number(event.target.value) })}
              >
                <option value={30}>30 dagar</option>
                <option value={90}>90 dagar</option>
                <option value={180}>180 dagar</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Providers</h2>
          <div className="space-y-4">
            {providerList.map((provider) => (
              <div key={provider.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">{provider.label || provider.id}</div>
                    <div className="text-xs text-slate-400">{provider.id}</div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={provider.isEnabled !== false}
                      onChange={(event) => updateProvider(provider.id, { isEnabled: event.target.checked })}
                    />
                    Aktiv
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">API-nyckel</label>
                    <input
                      className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-2"
                      type="password"
                      placeholder={provider.hasSecret ? '••••••••' : 'Klistra in ny nyckel'}
                      value={provider.secretKey || ''}
                      onChange={(event) => updateProvider(provider.id, { secretKey: event.target.value })}
                    />
                    {provider.hasSecret && (
                      <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={Boolean(provider.clearSecret)}
                          onChange={(event) => updateProvider(provider.id, { clearSecret: event.target.checked })}
                        />
                        Rensa sparad nyckel
                      </label>
                    )}
                  </div>

                  {provider.id === 'mailgun' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-300">Domän (Mailgun)</label>
                      <input
                        className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-2"
                        placeholder="mg.din-domän.se"
                        value={provider.domain || ''}
                        onChange={(event) => updateProvider(provider.id, { domain: event.target.value })}
                      />
                    </div>
                  )}
                </div>

                {provider.id === 'custom' && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300">Endpoint</label>
                      <input
                        className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-2"
                        placeholder="https://example.com/email"
                        value={provider.endpoint || ''}
                        onChange={(event) => updateProvider(provider.id, { endpoint: event.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300">HTTP-metod</label>
                      <input
                        className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-2"
                        value={provider.method || 'POST'}
                        onChange={(event) => updateProvider(provider.id, { method: event.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-300">Extra headers (JSON)</label>
                      <textarea
                        className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-2"
                        rows={3}
                        value={provider.extraHeaders || ''}
                        onChange={(event) => updateProvider(provider.id, { extraHeaders: event.target.value })}
                        placeholder='{"X-Api-Key": "..."}'
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-300">Payload-template</label>
                      <textarea
                        className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-3 py-2"
                        rows={4}
                        value={provider.payloadTemplate || ''}
                        onChange={(event) => updateProvider(provider.id, { payloadTemplate: event.target.value })}
                        placeholder='{"to":"{{to}}","subject":"{{subject}}","html":"{{html}}"}'
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {(status || error) && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-500/60 bg-red-900/40 text-red-100' : 'border-emerald-500/60 bg-emerald-900/40 text-emerald-100'}`}>
            {error || status}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm"
            onClick={loadSettings}
            disabled={isSaving}
          >
            Ladda om
          </button>
          <button
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Sparar...' : 'Spara'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminEmailSettingsPage;
