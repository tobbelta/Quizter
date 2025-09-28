/**
 * Vy för att skapa en auto-genererad runda på plats.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRun } from '../context/RunContext';
import QRCodeDisplay from '../components/shared/QRCodeDisplay';
import { buildJoinLink } from '../utils/joinLink';

const defaultForm = {
  alias: '',
  audience: 'family',
  difficulty: 'family',
  lengthMeters: 3000,
  questionCount: 8,
  allowAnonymous: true
};

const GenerateRunPage = () => {
  const navigate = useNavigate();
  const { currentUser, isAdmin } = useAuth();
  const { generateRun, currentRun } = useRun();
  const [form, setForm] = useState({
    ...defaultForm,
    alias: currentUser?.name || ''
  });
  const [error, setError] = useState('');

  /** Uppdaterar önskad profil för den genererade rundan. */
  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      if (!form.alias.trim()) {
        setError('Ange ett namn på den som genererar rundan.');
        return;
      }
      const run = await generateRun({
        ...form,
        lengthMeters: Number(form.lengthMeters),
        questionCount: Number(form.questionCount),
        origin: { lat: 56.662, lng: 16.361 }
      }, { id: currentUser?.id || form.alias, name: form.alias });
      if (run) {
        navigate(`/run/${run.id}/admin`);
      }
    } catch (generationError) {
      setError(generationError.message);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold mb-2">Generera runda på plats</h1>
        <p className="text-gray-300">Ange önskad längd, svårighetsgrad och antal frågor. Systemet föreslår en runda och frågeset.</p>
      </header>

      {error && <div className="rounded border border-red-500 bg-red-900/40 px-4 py-3 text-red-200">{error}</div>}

      <form onSubmit={handleSubmit} className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-purple-200">Skaparens namn</label>
            <input
              name="alias"
              value={form.alias}
              onChange={handleChange}
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
              placeholder="Ledare"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-purple-200">Målgrupp</label>
            <select
              name="audience"
              value={form.audience}
              onChange={handleChange}
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
            >
              <option value="kid">Barn</option>
              <option value="family">Familj</option>
              <option value="adult">Vuxen</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-purple-200">Svårighetsgrad</label>
            <select
              name="difficulty"
              value={form.difficulty}
              onChange={handleChange}
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
            >
              <option value="kid">Barn</option>
              <option value="family">Familj</option>
              <option value="adult">Vuxen</option>
            </select>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-purple-200">Rundans längd (meter)</label>
            <input
              type="number"
              name="lengthMeters"
              min={500}
              max={10000}
              step={100}
              value={form.lengthMeters}
              onChange={handleChange}
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-purple-200">Antal frågor</label>
            <input
              type="number"
              name="questionCount"
              min={3}
              max={20}
              value={form.questionCount}
              onChange={handleChange}
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-purple-200">Tillåt anonyma deltagare</label>
            <input
              type="checkbox"
              name="allowAnonymous"
              checked={form.allowAnonymous}
              onChange={handleChange}
            />
          </div>
          <button
            type="submit"
            className="w-full rounded bg-purple-500 px-4 py-2 font-semibold text-black hover:bg-purple-400"
          >
            Generera runda
          </button>
        </div>
      </form>

      {currentRun && (
        <aside className="rounded border border-purple-500/40 bg-slate-900/60 p-6 space-y-4">
          <h2 className="text-xl font-semibold">Senast genererade runda</h2>
          <p className="text-gray-200">Anslutningskod: <span className="font-mono text-lg">{currentRun.joinCode}</span></p>
          <QRCodeDisplay
            value={buildJoinLink(currentRun.joinCode)}
            title="QR för anslutning"
            description="Skanna för att ansluta till rundan."
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(currentRun.joinCode)}
              className="rounded bg-purple-500 px-4 py-2 font-semibold text-black hover:bg-purple-400"
            >
              Kopiera kod
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate(`/run/${currentRun.id}/admin`)}
                className="rounded bg-indigo-500 px-4 py-2 font-semibold text-black hover:bg-indigo-400"
              >
                Öppna administratörsvy
              </button>
            )}
          </div>
        </aside>
      )}
    </div>
  );
};

export default GenerateRunPage;
