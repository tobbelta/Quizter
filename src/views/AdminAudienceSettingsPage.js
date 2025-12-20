/**
 * Admin-sida för åldersgrupper och målgrupper.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/layout/Header';
import { audienceService } from '../services/audienceService';
import { DEFAULT_AGE_GROUPS, DEFAULT_TARGET_AUDIENCES, formatAgeGroupLabel } from '../data/audienceOptions';

const buildEmptyAgeGroup = () => ({
  rowKey: `age_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  id: `new_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  label: '',
  description: '',
  prompt: '',
  minAge: '',
  maxAge: '',
  isActive: true,
  sortOrder: 0,
  targetAudiences: [],
  originalId: '',
  isNew: true
});

const buildEmptyTargetAudience = () => ({
  rowKey: `target_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  id: `new_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  label: '',
  description: '',
  prompt: '',
  isActive: true,
  sortOrder: 0,
  originalId: '',
  isNew: true
});

const normalizeAgeGroup = (group, mapping = []) => ({
  rowKey: `age_${group.id}`,
  id: group.id,
  label: group.label || group.id,
  description: group.description || '',
  prompt: group.prompt || '',
  minAge: Number.isFinite(group.minAge) ? group.minAge : '',
  maxAge: Number.isFinite(group.maxAge) ? group.maxAge : '',
  isActive: group.isActive !== false,
  sortOrder: Number.isFinite(group.sortOrder) ? group.sortOrder : 0,
  targetAudiences: mapping,
  originalId: group.id || '',
  isNew: false
});

const normalizeTargetAudience = (audience) => ({
  rowKey: `target_${audience.id}`,
  id: audience.id,
  label: audience.label || audience.id,
  description: audience.description || '',
  prompt: audience.prompt || '',
  isActive: audience.isActive !== false,
  sortOrder: Number.isFinite(audience.sortOrder) ? audience.sortOrder : 0,
  originalId: audience.id || '',
  isNew: false
});

const AdminAudienceSettingsPage = () => {
  const { isSuperUser, currentUser } = useAuth();
  const navigate = useNavigate();
  const [ageGroups, setAgeGroups] = useState(DEFAULT_AGE_GROUPS.map((group) => normalizeAgeGroup(group, ['swedish'])));
  const [targetAudiences, setTargetAudiences] = useState(DEFAULT_TARGET_AUDIENCES.map(normalizeTargetAudience));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
      return;
    }
    loadConfig();
  }, [isSuperUser, navigate]);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await audienceService.getAudienceConfig({
        includeInactive: true,
        userEmail: currentUser?.email || '',
        force: true
      });
      const mappingMap = new Map();
      (data.mappings || []).forEach((mapping) => {
        if (!mappingMap.has(mapping.ageGroupId)) {
          mappingMap.set(mapping.ageGroupId, []);
        }
        mappingMap.get(mapping.ageGroupId).push(mapping.targetAudienceId);
      });
      const normalizedAgeGroups = (data.ageGroups || []).map((group) => (
        normalizeAgeGroup(group, mappingMap.get(group.id) || [])
      ));
      const normalizedTargets = (data.targetAudiences || []).map(normalizeTargetAudience);

      normalizedAgeGroups.sort((a, b) => (
        a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'sv')
      ));
      normalizedTargets.sort((a, b) => (
        a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'sv')
      ));

      setAgeGroups(normalizedAgeGroups);
      setTargetAudiences(normalizedTargets);
      setIsDirty(false);
    } catch (loadError) {
      setError(`Kunde inte ladda ålders-/målgrupper: ${loadError.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAgeGroupChange = (index, field, value) => {
    setAgeGroups((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setIsDirty(true);
  };

  const handleTargetAudienceChange = (index, field, value) => {
    setTargetAudiences((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setIsDirty(true);
  };

  const toggleAgeGroupTarget = (groupIndex, targetId) => {
    setAgeGroups((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      const existing = new Set(group.targetAudiences || []);
      if (existing.has(targetId)) {
        existing.delete(targetId);
      } else {
        existing.add(targetId);
      }
      next[groupIndex] = { ...group, targetAudiences: Array.from(existing) };
      return next;
    });
    setIsDirty(true);
  };

  const handleAddAgeGroup = () => {
    setAgeGroups((prev) => ([...prev, buildEmptyAgeGroup()]));
    setIsDirty(true);
  };

  const handleAddTargetAudience = () => {
    setTargetAudiences((prev) => ([...prev, buildEmptyTargetAudience()]));
    setIsDirty(true);
  };

  const handleRemoveAgeGroup = (index) => {
    setAgeGroups((prev) => prev.filter((_, idx) => idx !== index));
    setIsDirty(true);
  };

  const handleRemoveTargetAudience = (index) => {
    setTargetAudiences((prev) => prev.filter((_, idx) => idx !== index));
    setIsDirty(true);
  };

  const validateConfig = () => {
    const ageIds = new Set();
    for (const group of ageGroups) {
      const id = String(group.id || '').trim();
      if (!id) return 'Alla åldersgrupper måste ha ett ID.';
      const lower = id.toLowerCase();
      if (ageIds.has(lower)) return `Dubblett-ID hittades för åldersgrupp: ${id}`;
      ageIds.add(lower);
    }

    const targetIds = new Set();
    for (const target of targetAudiences) {
      const id = String(target.id || '').trim();
      if (!id) return 'Alla målgrupper måste ha ett ID.';
      const lower = id.toLowerCase();
      if (targetIds.has(lower)) return `Dubblett-ID hittades för målgrupp: ${id}`;
      targetIds.add(lower);
    }

    const validTargets = new Set(targetAudiences.map((target) => target.id));
    for (const group of ageGroups) {
      const invalidTargets = (group.targetAudiences || []).filter((id) => !validTargets.has(id));
      if (invalidTargets.length > 0) {
        return `Åldersgruppen ${group.label || group.id} har okända målgrupper: ${invalidTargets.join(', ')}`;
      }
    }

    return null;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const validationError = validateConfig();
    if (validationError) {
      setError(validationError);
      setSaving(false);
      return;
    }

    try {
      const payloadAgeGroups = ageGroups.map((group) => ({
        id: String(group.id || '').trim(),
        label: group.label,
        description: group.description,
        prompt: group.prompt,
        minAge: group.minAge === '' ? null : Number(group.minAge),
        maxAge: group.maxAge === '' ? null : Number(group.maxAge),
        isActive: group.isActive,
        sortOrder: Number.isFinite(group.sortOrder) ? group.sortOrder : 0,
        targetAudiences: group.targetAudiences || [],
        originalId: group.originalId
      }));
      const payloadTargets = targetAudiences.map((target) => ({
        id: String(target.id || '').trim(),
        label: target.label,
        description: target.description,
        prompt: target.prompt,
        isActive: target.isActive,
        sortOrder: Number.isFinite(target.sortOrder) ? target.sortOrder : 0,
        originalId: target.originalId
      }));
      const updated = await audienceService.updateAudienceConfig({
        ageGroups: payloadAgeGroups,
        targetAudiences: payloadTargets,
        userEmail: currentUser?.email || ''
      });

      const mappingMap = new Map();
      (updated.mappings || []).forEach((mapping) => {
        if (!mappingMap.has(mapping.ageGroupId)) {
          mappingMap.set(mapping.ageGroupId, []);
        }
        mappingMap.get(mapping.ageGroupId).push(mapping.targetAudienceId);
      });

      const refreshedAgeGroups = (updated.ageGroups || []).map((group) => (
        normalizeAgeGroup(group, mappingMap.get(group.id) || [])
      ));
      const refreshedTargets = (updated.targetAudiences || []).map(normalizeTargetAudience);

      refreshedAgeGroups.sort((a, b) => (
        a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'sv')
      ));
      refreshedTargets.sort((a, b) => (
        a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'sv')
      ));

      setAgeGroups(refreshedAgeGroups);
      setTargetAudiences(refreshedTargets);
      setIsDirty(false);
      setSuccess('Inställningarna sparades.');
      setTimeout(() => setSuccess(null), 4000);
    } catch (saveError) {
      setError(`Kunde inte spara inställningar: ${saveError.message}`);
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
        <Header title="Admin · Åldersgrupper" />
        <div className="flex items-center justify-center pt-32">
          <div className="text-lg text-slate-400">Laddar inställningar...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header title="Admin · Åldersgrupper & målgrupper" />
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6 pt-24">
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-2">
          <h2 className="text-lg font-semibold text-purple-200">Konfigurera målgrupper</h2>
          <p className="text-sm text-slate-300">
            Här styr du vilka målgrupper som finns och vilka målgrupper som kopplas till respektive
            åldersgrupp. Du kan lägga till nya och uppdatera befintliga. Om du ändrar ett ID uppdateras
            befintliga frågor automatiskt.
          </p>
        </section>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-200">
            {success}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleAddTargetAudience}
            className="px-4 py-2 rounded-lg bg-purple-500 text-black font-semibold hover:bg-purple-400 transition-colors"
          >
            + Lägg till målgrupp
          </button>
          <button
            onClick={handleAddAgeGroup}
            className="px-4 py-2 rounded-lg bg-indigo-500 text-black font-semibold hover:bg-indigo-400 transition-colors"
          >
            + Lägg till åldersgrupp
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              saving ? 'bg-slate-700 text-slate-400' : 'bg-cyan-500 text-black hover:bg-cyan-400'
            }`}
          >
            {saving ? 'Sparar...' : 'Spara'}
          </button>
          <button
            onClick={loadConfig}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-sm hover:bg-slate-700 transition-colors"
          >
            Ladda om
          </button>
          {isDirty && (
            <span className="text-xs text-amber-300">Osparade ändringar</span>
          )}
        </div>

        <section className="space-y-4">
          <h3 className="text-base font-semibold text-cyan-200">Målgrupper</h3>
          {targetAudiences.map((audience, index) => (
            <div
              key={audience.rowKey}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                    ID
                  </label>
                  <input
                    value={audience.id}
                    onChange={(e) => handleTargetAudienceChange(index, 'id', e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                    Namn
                  </label>
                  <input
                    value={audience.label}
                    onChange={(e) => handleTargetAudienceChange(index, 'label', e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div className="w-28">
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                    Sortering
                  </label>
                  <input
                    type="number"
                    value={audience.sortOrder}
                    onChange={(e) => handleTargetAudienceChange(index, 'sortOrder', Number(e.target.value))}
                    className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={audience.isActive}
                    onChange={(e) => handleTargetAudienceChange(index, 'isActive', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-500 text-cyan-500 focus:ring-cyan-500"
                  />
                  Aktiv
                </label>
                {audience.isNew && (
                  <button
                    onClick={() => handleRemoveTargetAudience(index)}
                    className="ml-auto px-3 py-1.5 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition-colors"
                  >
                    Ta bort
                  </button>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                    Beskrivning
                  </label>
                  <textarea
                    rows={3}
                    value={audience.description}
                    onChange={(e) => handleTargetAudienceChange(index, 'description', e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                    AI-instruktion
                  </label>
                  <textarea
                    rows={3}
                    value={audience.prompt}
                    onChange={(e) => handleTargetAudienceChange(index, 'prompt', e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-4">
          <h3 className="text-base font-semibold text-cyan-200">Åldersgrupper</h3>
          {ageGroups.map((group, index) => (
            <div
              key={group.rowKey}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                    ID
                  </label>
                  <input
                    value={group.id}
                    onChange={(e) => handleAgeGroupChange(index, 'id', e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                    Namn
                  </label>
                  <input
                    value={group.label}
                    onChange={(e) => handleAgeGroupChange(index, 'label', e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                    Min
                  </label>
                  <input
                    type="number"
                    value={group.minAge}
                    onChange={(e) => handleAgeGroupChange(index, 'minAge', e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                    Max
                  </label>
                  <input
                    type="number"
                    value={group.maxAge}
                    onChange={(e) => handleAgeGroupChange(index, 'maxAge', e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="w-28">
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                    Sortering
                  </label>
                  <input
                    type="number"
                    value={group.sortOrder}
                    onChange={(e) => handleAgeGroupChange(index, 'sortOrder', Number(e.target.value))}
                    className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={group.isActive}
                    onChange={(e) => handleAgeGroupChange(index, 'isActive', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-500 text-purple-500 focus:ring-purple-500"
                  />
                  Aktiv
                </label>
                {group.isNew && (
                  <button
                    onClick={() => handleRemoveAgeGroup(index)}
                    className="ml-auto px-3 py-1.5 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition-colors"
                  >
                    Ta bort
                  </button>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                    Beskrivning
                  </label>
                  <textarea
                    rows={3}
                    value={group.description}
                    onChange={(e) => handleAgeGroupChange(index, 'description', e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                    AI-instruktion
                  </label>
                  <textarea
                    rows={3}
                    value={group.prompt}
                    onChange={(e) => handleAgeGroupChange(index, 'prompt', e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">
                  Kopplade målgrupper
                </p>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {targetAudiences.map((audience) => {
                    const isSelected = (group.targetAudiences || []).includes(audience.id);
                    return (
                      <label
                        key={`${group.id}-${audience.id}`}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                          isSelected ? 'border-cyan-400 bg-cyan-500/10 text-cyan-100' : 'border-slate-700 text-slate-300'
                        } ${audience.isActive ? '' : 'opacity-60'}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleAgeGroupTarget(index, audience.id)}
                          className="h-4 w-4 rounded border-slate-500 text-cyan-500 focus:ring-cyan-500"
                        />
                        <span className="flex-1">
                          {audience.label} <span className="text-xs text-slate-400">({audience.id})</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {group.targetAudiences?.length === 0 && (
                  <p className="text-xs text-amber-300 mt-2">
                    Inga målgrupper valda. AI-generering faller tillbaka till svensk målgrupp.
                  </p>
                )}
              </div>

              <div className="text-xs text-slate-400">
                Förhandsvisning: {formatAgeGroupLabel(group)}
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
};

export default AdminAudienceSettingsPage;
