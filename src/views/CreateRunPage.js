/**
 * Adminvy för att skapa en handplanerad tipspromenad.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRun } from '../context/RunContext';
import { questionService } from '../services/questionService';
import QRCodeDisplay from '../components/shared/QRCodeDisplay';
import useRunLocation from '../hooks/useRunLocation';
import { buildJoinLink } from '../utils/joinLink';
import useQRCode from '../hooks/useQRCode';
import FullscreenQRCode from '../components/shared/FullscreenQRCode';

const defaultForm = {
  name: 'Fredagsquiz',
  description: 'En promenad med blandade frågor.',
  audience: 'family',
  difficulty: 'family',
  categories: [], // Valda kategorier (tom = alla)
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

const categoryOptions = [
  { value: 'Geografi', label: 'Geografi' },
  { value: 'Historia', label: 'Historia' },
  { value: 'Naturvetenskap', label: 'Naturvetenskap' },
  { value: 'Kultur', label: 'Kultur' },
  { value: 'Sport', label: 'Sport' },
  { value: 'Natur', label: 'Natur' },
  { value: 'Teknik', label: 'Teknik' },
  { value: 'Djur', label: 'Djur' },
  { value: 'Gåtor', label: 'Gåtor' }
];

const CreateRunPage = () => {
  const { currentUser, isSuperUser } = useAuth();
  const { createHostedRun } = useRun();
  const navigate = useNavigate();
  const { coords } = useRunLocation();
  const [form, setForm] = useState(defaultForm);
  const [availableQuestions, setAvailableQuestions] = useState(questionService.listAll());
  const [error, setError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [createdRun, setCreatedRun] = useState(null);
  const [isQRCodeFullscreen, setIsQRCodeFullscreen] = useState(false);

  const joinLink = createdRun ? buildJoinLink(createdRun.joinCode) : '';
  const { dataUrl, isLoading, error: qrError } = useQRCode(joinLink, 320);

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

  if (!isSuperUser) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">Behörighet krävs</h1>
        <p className="text-gray-300">Du behöver logga in som superuser för att skapa en runda.</p>
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

  /** Togglar kategori i multichoice */
  const toggleCategory = (category) => {
    setForm((prev) => {
      const categories = prev.categories || [];
      const isSelected = categories.includes(category);
      return {
        ...prev,
        categories: isSelected
          ? categories.filter(c => c !== category)
          : [...categories, category]
      };
    });
  };


  /** Skapar rundan och nollställer feedback. */
  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
        try {
      if (!form.name.trim()) {
        setError('Ange ett namn på rundan.');
        return;
      }
      const run = await createHostedRun({
        ...form,
        questionCount: Number(form.questionCount),
        lengthMeters: Number(form.lengthMeters),
        origin: coords // Använd admin's GPS-position om tillgänglig
      }, {
        id: currentUser?.id || 'admin',
        name: currentUser?.name || 'Admin'
      });
      if (run) {
        setCreatedRun(run);
      }
    } catch (creationError) {
      setError(creationError.message);
    }
  };

  const handleDownload = () => {
    if (!dataUrl || typeof document === 'undefined') return;
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = 'tipspromenad-qr.png';
    anchor.click();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {isQRCodeFullscreen && <FullscreenQRCode dataUrl={dataUrl} onClose={() => setIsQRCodeFullscreen(false)} />}

      {/* Mobiloptimerad header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Skapa tipspromenad</h1>
            <p className="text-sm text-gray-400">Fyll i detaljer och skapa QR-kod</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-600"
          >
            Tillbaka
          </button>
        </div>
      </header>

      <div className="px-4 py-6 space-y-6">

      {error && (
        <div className="rounded border border-red-500 bg-red-900/40 px-4 py-3 text-red-200">{error}</div>
      )}

      <div className="flex flex-wrap gap-3 rounded border border-slate-600 bg-slate-900/60 p-4">
        <div>
          <p className="text-sm text-gray-300">Tillgängliga frågor: <strong>{availableQuestions.length}</strong></p>
          <p className="text-xs text-gray-500">Målgrupp {form.audience}: <strong>{maxQuestionsPerAudience[form.audience] || 0}</strong></p>
          <p className="text-xs text-gray-500">
            Startposition: <strong>{coords ? '📍 Din GPS-position' : '📍 Kalmar (standard)'}</strong>
          </p>
        </div>
      </div>


        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-cyan-200">Rundans namn</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 text-white"
                placeholder="T.ex. Fredagsquiz"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-cyan-200">Beskrivning</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={3}
                className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 text-white"
                placeholder="En promenad med blandade frågor"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-cyan-200">Svårighetsgrad</label>
              <select
                name="difficulty"
                value={form.difficulty}
                onChange={handleChange}
                className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 text-white"
              >
                {difficultyOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                {form.difficulty === 'kid' && 'Enkla frågor lämpliga för barn 6-12 år'}
                {form.difficulty === 'family' && 'Blandar barn- och vuxenfrågor för hela familjen'}
                {form.difficulty === 'adult' && 'Utmanande frågor för vuxna'}
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-cyan-200">
                Kategorier {form.categories.length === 0 ? '(Alla)' : `(${form.categories.length} valda)`}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {categoryOptions.map((cat) => {
                  const isSelected = form.categories.includes(cat.value);
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => toggleCategory(cat.value)}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isSelected
                          ? 'bg-cyan-500 text-black'
                          : 'bg-slate-800 border border-slate-600 text-gray-300 hover:bg-slate-700'
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Välj kategorier eller lämna tomt för alla kategorier
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-cyan-200">Antal frågor</label>
                <input
                  type="number"
                  name="questionCount"
                  min={3}
                  max={20}
                  value={form.questionCount}
                  onChange={handleChange}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 text-white"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-cyan-200">Längd (meter)</label>
                <input
                  type="number"
                  name="lengthMeters"
                  min={500}
                  max={10000}
                  step={100}
                  value={form.lengthMeters}
                  onChange={handleChange}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 text-white"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3 rounded-lg bg-slate-800 border border-slate-600 px-4 py-3">
              <input
                type="checkbox"
                name="allowAnonymous"
                checked={form.allowAnonymous}
                onChange={handleChange}
                className="h-4 w-4 text-cyan-500"
              />
              <label className="text-sm font-semibold text-cyan-200">Tillåt anonyma deltagare</label>
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-cyan-500 px-4 py-4 font-bold text-black hover:bg-cyan-400 text-lg"
          >
            🎯 Skapa runda
          </button>
        </form>

        {createdRun && (
          <div className="space-y-6">
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-900/20 p-6 text-center">
              <h2 className="text-xl font-bold mb-4 text-emerald-200">🎉 {createdRun.name}</h2>
              
              <div className="flex justify-center cursor-pointer" onClick={() => setIsQRCodeFullscreen(true)}>
                <QRCodeDisplay dataUrl={dataUrl} isLoading={isLoading} error={qrError} />
              </div>

              <div className="flex flex-wrap gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(joinLink)}
                  className="rounded bg-purple-500 px-4 py-2 font-semibold text-black hover:bg-purple-400"
                >
                  Kopiera länk
                </button>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(createdRun.joinCode)}
                  className="rounded bg-purple-500 px-4 py-2 font-semibold text-black hover:bg-purple-400"
                >
                  Kopiera kod
                </button>
              </div>

              <div className="text-center">
                <a href={joinLink} target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:underline break-all">
                  {joinLink}
                </a>
              </div>

              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="rounded bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400"
                >
                  Ladda ner QR-kod
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 mt-6">
                <button
                  onClick={() => navigate(`/run/${createdRun.id}/admin`)}
                  className="rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-black hover:bg-cyan-400"
                >
                  🎮 Öppna administratörsvy
                </button>
              </div>
            </div>

            {/* Rundinfo */}
            <div className="rounded-lg border border-slate-600 bg-slate-900/60 p-4">
              <h3 className="font-semibold text-cyan-200 mb-3">Rundans detaljer</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Namn:</span>
                  <span className="font-medium">{createdRun.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Antal frågor:</span>
                  <span className="font-medium">{createdRun.questionCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Längd:</span>
                  <span className="font-medium">{createdRun.lengthMeters}m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Målgrupp:</span>
                  <span className="font-medium capitalize">{createdRun.audience}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateRunPage;