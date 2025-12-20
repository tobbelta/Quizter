/**
 * Admin-sida för att hantera frågekategorier och AI-instruktioner.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/layout/Header';
import { categoryService } from '../services/categoryService';

const buildEmptyCategory = () => ({
  id: `new_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  name: '',
  description: '',
  prompt: '',
  isActive: true,
  sortOrder: 0,
  originalName: '',
  isNew: true
});

const normalizeCategory = (category) => ({
  id: category.name,
  name: category.name || '',
  description: category.description || '',
  prompt: category.prompt || '',
  isActive: category.isActive !== false,
  sortOrder: Number.isFinite(category.sortOrder) ? category.sortOrder : 0,
  originalName: category.name || '',
  isNew: false
});

const AdminCategoriesPage = () => {
  const { isSuperUser, currentUser } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
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

    loadCategories();
  }, [isSuperUser, navigate]);

  const loadCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await categoryService.getCategories({
        includeInactive: true,
        userEmail: currentUser?.email || ''
      });
      const normalized = data.map(normalizeCategory);
      normalized.sort((a, b) => (
        a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'sv')
      ));
      setCategories(normalized);
      setIsDirty(false);
    } catch (loadError) {
      setError(`Kunde inte ladda kategorier: ${loadError.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (index, field, value) => {
    setCategories(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setIsDirty(true);
  };

  const handleToggleActive = (index) => {
    setCategories(prev => {
      const next = [...prev];
      next[index] = { ...next[index], isActive: !next[index].isActive };
      return next;
    });
    setIsDirty(true);
  };

  const handleAddCategory = () => {
    setCategories(prev => ([...prev, buildEmptyCategory()]));
    setIsDirty(true);
  };

  const handleRemoveCategory = (index) => {
    setCategories(prev => prev.filter((_, idx) => idx !== index));
    setIsDirty(true);
  };

  const validateCategories = () => {
    const trimmed = categories.map((category) => ({
      ...category,
      name: category.name.trim()
    }));
    const names = new Set();
    for (const category of trimmed) {
      if (!category.name) {
        return 'Alla kategorier måste ha ett namn.';
      }
      const key = category.name.toLowerCase();
      if (names.has(key)) {
        return `Dubblettnamn hittades: ${category.name}`;
      }
      names.add(key);
    }
    return null;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const validationError = validateCategories();
    if (validationError) {
      setError(validationError);
      setSaving(false);
      return;
    }

    try {
      const payload = categories.map((category) => ({
        name: category.name.trim(),
        description: category.description,
        prompt: category.prompt,
        isActive: category.isActive,
        sortOrder: Number.isFinite(category.sortOrder) ? category.sortOrder : 0,
        originalName: category.originalName
      }));
      const updated = await categoryService.updateCategories({
        categories: payload,
        userEmail: currentUser?.email || ''
      });
      const normalized = updated.map(normalizeCategory);
      normalized.sort((a, b) => (
        a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'sv')
      ));
      setCategories(normalized);
      setIsDirty(false);
      setSuccess('Kategorier sparade.');
      setTimeout(() => setSuccess(null), 4000);
    } catch (saveError) {
      setError(`Kunde inte spara kategorier: ${saveError.message}`);
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
        <Header title="Admin · Kategorier" />
        <div className="flex items-center justify-center pt-32">
          <div className="text-lg text-slate-400">Laddar kategorier...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header title="Admin · Kategorier" />
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6 pt-24">
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-2">
          <h2 className="text-lg font-semibold text-purple-200">Kategoriinställningar</h2>
          <p className="text-sm text-slate-300">
            Varje kategori kan ha en kort beskrivning och en AI-instruktion som styr hur
            frågorna formuleras. Instruktionerna läggs till i prompten vid AI-generering.
            Om du byter namn uppdateras även befintliga frågor som använder kategorin.
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
            onClick={handleAddCategory}
            className="px-4 py-2 rounded-lg bg-purple-500 text-black font-semibold hover:bg-purple-400 transition-colors"
          >
            + Lägg till kategori
          </button>
          <button
            onClick={handleSave}
            disabled={saving || categories.length === 0}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              saving || categories.length === 0
                ? 'bg-slate-700 text-slate-400'
                : 'bg-cyan-500 text-black hover:bg-cyan-400'
            }`}
          >
            {saving ? 'Sparar...' : 'Spara'}
          </button>
          <button
            onClick={loadCategories}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-sm hover:bg-slate-700 transition-colors"
          >
            Ladda om
          </button>
          {isDirty && (
            <span className="text-xs text-amber-300">Osparade ändringar</span>
          )}
        </div>

        <div className="space-y-4">
          {categories.map((category, index) => (
            <div
              key={category.id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                    Namn
                  </label>
                  <input
                    value={category.name}
                    onChange={(e) => handleCategoryChange(index, 'name', e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="w-32">
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                    Sortering
                  </label>
                  <input
                    type="number"
                    value={category.sortOrder}
                    onChange={(e) => handleCategoryChange(index, 'sortOrder', Number(e.target.value))}
                    className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={category.isActive}
                    onChange={() => handleToggleActive(index)}
                    className="h-4 w-4 rounded border-slate-500 text-purple-500 focus:ring-purple-500"
                  />
                  Aktiv
                </label>
                {category.isNew && (
                  <button
                    onClick={() => handleRemoveCategory(index)}
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
                    value={category.description}
                    onChange={(e) => handleCategoryChange(index, 'description', e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                    AI-instruktion
                  </label>
                  <textarea
                    rows={3}
                    value={category.prompt}
                    onChange={(e) => handleCategoryChange(index, 'prompt', e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>
          ))}

          {categories.length === 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-slate-300">
              Inga kategorier hittades. Lägg till en ny kategori för att komma igång.
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminCategoriesPage;
