/**
 * Adminvy för att skapa en handplanerad tipspromenad.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRun } from '../context/RunContext';
import { questionService } from '../services/questionService';
import QRCodeDisplay from '../components/shared/QRCodeDisplay';
import RunMap from '../components/run/RunMap';
import { buildJoinLink } from '../utils/joinLink';
import { describeParticipantStatus } from '../utils/participantStatus';
import { FALLBACK_POSITION } from '../utils/constants';

const defaultForm = {
  name: 'Fredagsquiz',
  description: 'En promenad med blandade frågor.',
  audience: 'family',
  difficulty: 'family',
  questionCount: 6,
  lengthMeters: 2000,
  allowAnonymous: true
};

const audienceOptions = [
  { value: 'kid', label: 'Barn' },
  { value: 'family', label: 'Familj' },
  { value: 'adult', label: 'Vuxen' }
];

const difficultyOptions = [
  { value: 'kid', label: 'Barn' },
  { value: 'family', label: 'Familj' },
  { value: 'adult', label: 'Vuxen' }
];

const CreateRunPage = () => {
  const { currentUser, isAdmin } = useAuth();
  const { createHostedRun, currentRun, participants } = useRun();
  const navigate = useNavigate();
  const [form, setForm] = useState(defaultForm);
  const [availableQuestions, setAvailableQuestions] = useState(questionService.listAll());
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    const unsubscribe = questionService.subscribe(setAvailableQuestions);
    return unsubscribe;
  }, []);

  const maxQuestionsPerAudience = useMemo(() => {
    const counts = availableQuestions.reduce((acc, question) => {
      acc[question.audience] = (acc[question.audience] || 0) + 1;
      return acc;
    }, {});
    return counts;
  }, [availableQuestions]);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">Behörighet krävs</h1>
        <p className="text-gray-300">Du behöver logga in som administratör för att skapa en runda.</p>
      </div>
    );
  }

  /** Uppdaterar formuläret när admin ändrar fält. */
  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  /** Hämtar fler frågor från OpenTDB med aktuell profil. */
  const handleImportQuestions = async () => {
    setError('');
    setSuccessMessage('');
    setIsImporting(true);
    try {
      const fetched = await questionService.fetchAndAddFromOpenTDB({
        amount: Math.max(5, Number(form.questionCount) || 5),
        difficulty: form.difficulty,
        audience: form.audience
      });
      setSuccessMessage(`Importerade ${fetched.length} frågor från OpenTDB.`);
    } catch (importError) {
      setError(importError.message);
    } finally {
      setIsImporting(false);
    }
  };

  /** Skapar rundan och nollställer feedback. */
  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');
    try {
      if (!form.name.trim()) {
        setError('Ange ett namn på rundan.');
        return;
      }
      const run = await createHostedRun({
        ...form,
        questionCount: Number(form.questionCount),
        lengthMeters: Number(form.lengthMeters)
      }, {
        id: currentUser?.id || 'admin',
        name: currentUser?.name || 'Admin'
      });
      if (run) {
        setSuccessMessage(`Runda skapad! Anslutningskod: ${run.joinCode}`);
      }
    } catch (creationError) {
      setError(creationError.message);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold mb-2">Skapa tipspromenad</h1>
        <p className="text-gray-300">Ställ in målgrupp, svårighetsgrad och antal frågor. En anslutningskod genereras automatiskt.</p>
      </header>

      {error && (
        <div className="rounded border border-red-500 bg-red-900/40 px-4 py-3 text-red-200">{error}</div>
      )}

      <div className="flex flex-wrap gap-3 rounded border border-slate-600 bg-slate-900/60 p-4">
        <div>
          <p className="text-sm text-gray-300">Tillgängliga frågor: <strong>{availableQuestions.length}</strong></p>
          <p className="text-xs text-gray-500">Målgrupp {form.audience}: <strong>{maxQuestionsPerAudience[form.audience] || 0}</strong></p>
        </div>
        <button
          type="button"
          onClick={handleImportQuestions}
          disabled={isImporting}
          className="rounded bg-purple-500 px-4 py-2 font-semibold text-black hover:bg-purple-400 disabled:bg-slate-700 disabled:text-gray-400"
        >
          {isImporting ? 'Importerar...' : 'Hämta frågor från OpenTDB'}
        </button>
      </div>

      {successMessage && currentRun && (
        <div className="rounded border border-emerald-500 bg-emerald-900/30 px-4 py-3 text-emerald-100">
          <p className="font-semibold">{successMessage}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(currentRun.joinCode)}
              className="rounded bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
            >
              Kopiera kod
            </button>
            <button
              type="button"
              onClick={() => navigate(`/run/${currentRun.id}/admin`)}
              className="rounded bg-indigo-500 px-4 py-2 font-semibold text-black hover:bg-indigo-400"
            >
              Öppna administratörsvy
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-cyan-200">Rundans namn</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-cyan-200">Beskrivning</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={4}
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-cyan-200">Tillåt anonyma deltagare</label>
            <input
              type="checkbox"
              name="allowAnonymous"
              checked={form.allowAnonymous}
              onChange={handleChange}
            />
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-cyan-200">Målgrupp</label>
            <select
              name="audience"
              value={form.audience}
              onChange={handleChange}
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
            >
              {audienceOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">Tillgängliga frågor: {maxQuestionsPerAudience[form.audience] || 0}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-cyan-200">Svårighetsgrad</label>
            <select
              name="difficulty"
              value={form.difficulty}
              onChange={handleChange}
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
            >
              {difficultyOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-cyan-200">Antal frågor</label>
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
            <label className="mb-1 block text-sm font-semibold text-cyan-200">Rundans längd (meter)</label>
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
          <button
            type="submit"
            className="w-full rounded bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400"
          >
            Skapa runda
          </button>
        </div>
      </form>

      {currentRun && (
        <aside className="rounded-lg border border-cyan-500/40 bg-slate-900/60 p-6 space-y-4">
          <h2 className="text-xl font-semibold">Aktiv runda</h2>
          <dl className="grid gap-2 md:grid-cols-2">
            <div>
              <dt className="text-sm text-gray-400">Namn</dt>
              <dd className="font-medium">{currentRun.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Anslutningskod</dt>
              <dd className="font-mono text-lg">{currentRun.joinCode}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Antal frågor</dt>
              <dd>{currentRun.questionCount}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Status</dt>
              <dd className="capitalize">{currentRun.status}</dd>
            </div>
          </dl>
          <div className="space-y-3">
            <h3 className="text-lg font-medium">Rutt på karta</h3>
            <RunMap
              checkpoints={currentRun.checkpoints || []}
              userPosition={null}
              activeOrder={0}
              answeredCount={0}
              route={currentRun.route}
            />
            {!currentRun.route && (
              <button
                type="button"
                onClick={async () => {
                  console.log('Lägger till rutt-data för befintlig runda...');
                  try {
                    // Importera route service för att generera rutt
                    const { generateWalkingRoute } = await import('../services/routeService');
                    const origin = currentRun.checkpoints?.[0]?.location || FALLBACK_POSITION;

                    // Generera route-data
                    const routeData = await generateWalkingRoute({
                      origin,
                      lengthMeters: currentRun.lengthMeters || 2000,
                      checkpointCount: currentRun.checkpoints?.length || 6
                    });

                    if (routeData.route && routeData.route.length > 0) {
                      // Uppdatera den befintliga rundan med route-data
                      // Hämta och uppdatera från Firestore
                      const updatedRun = { ...currentRun, route: routeData.route };

                      // Uppdatera i Firestore genom att använda samma serialize-metod
                      const { getFirebaseDb } = await import('../firebaseClient');
                      const { doc, setDoc } = await import('firebase/firestore');
                      const db = getFirebaseDb();
                      const serialize = (payload) => JSON.parse(JSON.stringify(payload));

                      await setDoc(doc(db, 'runs', currentRun.id), serialize(updatedRun));

                      console.log('Route-data tillagd! Ladda om sidan för att se ändringen.');
                      window.location.reload();
                    }
                  } catch (error) {
                    console.error('Kunde inte lägga till route-data:', error);
                    alert('Kunde inte lägga till route-data: ' + error.message);
                  }
                }}
                className="rounded bg-yellow-500 px-4 py-2 font-semibold text-black hover:bg-yellow-400"
              >
                🗺️ Lägg till rutt-data
              </button>
            )}
          </div>

          <QRCodeDisplay
            value={buildJoinLink(currentRun.joinCode)}
            title="QR för anslutning"
            description="Dela med deltagare genom att låta dem skanna koden."
          />
          <div>
            <h3 className="font-semibold text-cyan-200 mb-2">Deltagare ({participants.length})</h3>
            <ul className="space-y-1 text-sm">
              {participants.length === 0 && <li className="text-gray-400">Inga deltagare har anslutit ännu.</li>}
              {participants.map((participant) => {
                const statusMeta = describeParticipantStatus(participant.status);
                return (
                  <li key={participant.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${statusMeta.dotClass}`} />
                      <span>{participant.alias}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400">{participant.score} poäng</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${statusMeta.pillClass}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      )}
    </div>
  );
};

export default CreateRunPage;

