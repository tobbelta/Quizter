/**
 * Vy för att skapa en auto-genererad runda på plats.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRun } from '../context/RunContext';
import Header from '../components/layout/Header';
import QRCodeDisplay from '../components/shared/QRCodeDisplay';
import RunMap from '../components/run/RunMap';
import { buildJoinLink } from '../utils/joinLink';
import { FALLBACK_POSITION } from '../utils/constants';
import { localStorageService } from '../services/localStorageService';
import useQRCode from '../hooks/useQRCode';
import FullscreenQRCode from '../components/shared/FullscreenQRCode';
import FullscreenMap from '../components/shared/FullscreenMap';

const defaultForm = {
  name: '',
  difficulty: 'family',
  lengthMeters: 3000,
  questionCount: 8,
  language: 'sv'
};

const GenerateRunPage = () => {
  const navigate = useNavigate();
  const { currentUser, isAdmin } = useAuth();
  const { generateRun, currentRun } = useRun();
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState('');
  const [generatedRun, setGeneratedRun] = useState(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRunSaved, setIsRunSaved] = useState(false);
  const [isQRCodeFullscreen, setIsQRCodeFullscreen] = useState(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);

  const joinLink = generatedRun ? buildJoinLink(generatedRun.joinCode) : '';
  const { dataUrl, isLoading, error: qrError } = useQRCode(joinLink, 320);

  const handleRegenerate = async () => {
    setError('');
    setIsRegenerating(true);
    try {
      const run = await generateRun({
        name: form.name,
        difficulty: form.difficulty,
        audience: form.difficulty,
        lengthMeters: Number(form.lengthMeters),
        questionCount: Number(form.questionCount),
        allowAnonymous: true,
        language: form.language || 'sv',
        origin: FALLBACK_POSITION
      }, { id: currentUser?.id || 'anonymous', name: currentUser?.name || '' });
      if (run) {
        setGeneratedRun(run);
        setIsRunSaved(false);
      }
    } catch (generationError) {
      setError(generationError.message);
    } finally {
      setIsRegenerating(false);
    }
  };

  /** Uppdaterar önskad profil för den genererade rundan. */
  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSaveRun = () => {
    if (generatedRun && !currentUser) {
      localStorageService.addCreatedRun(generatedRun);
    }
    setIsRunSaved(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      if (!form.name.trim()) {
        setError('Ange ett namn på rundan.');
        return;
      }
      const run = await generateRun({
        name: form.name,
        difficulty: form.difficulty,
        audience: form.difficulty, // Använd difficulty som audience också
        lengthMeters: Number(form.lengthMeters),
        questionCount: Number(form.questionCount),
        allowAnonymous: true, // Alltid tillåt anonyma
        language: form.language || 'sv',
        origin: FALLBACK_POSITION
      }, { id: currentUser?.id || 'anonymous', name: currentUser?.name || '' });
      if (run) {
        setGeneratedRun(run); // Spara den genererade rundan i lokal state
        setIsRunSaved(false);
      }
    } catch (generationError) {
      setError(generationError.message);
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
    <div className="min-h-screen bg-slate-950">
      <Header title="Skapa runda" />

      {isQRCodeFullscreen && <FullscreenQRCode dataUrl={dataUrl} onClose={() => setIsQRCodeFullscreen(false)} />}
      {isMapFullscreen && <FullscreenMap checkpoints={generatedRun.checkpoints} route={generatedRun.route} onClose={() => setIsMapFullscreen(false)} />}

      <div className="mx-auto max-w-4xl px-4 pt-24 pb-8 space-y-8">
        {!generatedRun ? (
          <>
            <div className="text-center mb-8">
              <p className="text-gray-300">Ange namn, svårighetsgrad och längd. Systemet skapar en runda med frågor.</p>
            </div>

            {error && <div className="rounded border border-red-500 bg-red-900/40 px-4 py-3 text-red-200">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
              <div>
                <label className="mb-1 block text-sm font-semibold text-purple-200">Namn på runda</label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                  placeholder="T.ex. Stadsvandring"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-purple-200">Svårighetsgrad</label>
                <select
                  name="difficulty"
                  value={form.difficulty}
                  onChange={handleChange}
                  className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                >
                  <option value="kid">Barn (lätt)</option>
                  <option value="family">Familj (medel)</option>
                  <option value="adult">Vuxen (svår)</option>
                </select>
              </div>

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
                <label className="mb-1 block text-sm font-semibold text-purple-200">Språk</label>
                <select
                  name="language"
                  value={form.language}
                  onChange={handleChange}
                  className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                >
                  <option value="sv">Svenska</option>
                  <option value="en">English</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full rounded bg-purple-500 px-4 py-2 font-semibold text-black hover:bg-purple-400"
              >
                Skapa runda
              </button>
            </form>
          </>
        ) : (
          <aside className="space-y-6">
            <div className="rounded border border-purple-500/40 bg-slate-900/60 p-6 space-y-4">
              {!isRunSaved ? (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Förslag på runda</h2>
                    <button
                      type="button"
                      onClick={handleRegenerate}
                      disabled={isRegenerating}
                      className="rounded bg-yellow-500 px-3 py-1 text-sm font-semibold text-black hover:bg-yellow-400 disabled:bg-slate-700 disabled:text-gray-400"
                    >
                      {isRegenerating ? 'Genererar...' : '🔄 Generera ny'}
                    </button>
                  </div>
                  <p className="text-gray-200">
                    Granska kartan nedan. Om du är nöjd, spara rundan för att få en QR-kod.
                  </p>
                  <div className="h-96">
                    <RunMap
                      checkpoints={generatedRun.checkpoints || []}
                      userPosition={null}
                      activeOrder={0}
                      answeredCount={0}
                      route={generatedRun.route}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveRun}
                    className="w-full rounded-lg bg-green-500 px-4 py-3 font-bold text-black hover:bg-green-400 text-lg"
                  >
                    ✅ Spara och visa QR-kod
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold">{generatedRun.name}</h2>
                  <p className="text-gray-200">
                    Längd: {generatedRun.lengthMeters}m • {generatedRun.questionCount} frågor<br />
                    Anslutningskod: <span className="font-mono text-lg">{generatedRun.joinCode}</span>
                  </p>

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
                      onClick={() => navigator.clipboard.writeText(generatedRun.joinCode)}
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

                  <div className="text-center mt-4">
                    <button
                      type="button"
                      onClick={() => setIsMapFullscreen(true)}
                      className="rounded bg-slate-600 px-4 py-2 font-semibold text-white hover:bg-slate-500"
                    >
                      Visa karta
                    </button>
                  </div>
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default GenerateRunPage;