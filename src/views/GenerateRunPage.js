/**
 * Vy för att skapa en auto-genererad runda på plats.
 */
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRun } from '../context/RunContext';
import PageLayout from '../components/layout/PageLayout';
import QRCodeDisplay from '../components/shared/QRCodeDisplay';
import RunMap from '../components/run/RunMap';
import PaymentModal from '../components/payment/PaymentModal';
import GPSPrompt from '../components/shared/GPSPrompt';
import { buildJoinLink } from '../utils/joinLink';
import { FALLBACK_POSITION } from '../utils/constants';
import { localStorageService } from '../services/localStorageService';
import { analyticsService } from '../services/analyticsService';
import useQRCode from '../hooks/useQRCode';
import useRunLocation from '../hooks/useRunLocation';
import FullscreenQRCode from '../components/shared/FullscreenQRCode';
import FullscreenMap from '../components/shared/FullscreenMap';

const defaultForm = {
  name: '',
  difficulty: 'family',
  categories: [],
  lengthMeters: 3000,
  questionCount: 8,
  preferGreenAreas: false,
};

const categoryOptions = [
  { value: 'Geografi', label: 'Geografi' },
  { value: 'Historia', label: 'Historia' },
  { value: 'Naturvetenskap', label: 'Naturvetenskap' },
  { value: 'Kultur', label: 'Kultur' },
  { value: 'Sport', label: 'Sport' },
  { value: 'Natur', label: 'Natur' },
  { value: 'Teknik', label: 'Teknik' },
  { value: 'Djur', label: 'Djur' },
  { value: 'Gåtor', label: 'Gåtor' },
];

const GenerateRunPage = () => {
  const { currentUser } = useAuth();
  const { generateRun } = useRun();
  const { coords } = useRunLocation();
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState('');
  const [generatedRun, setGeneratedRun] = useState(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRunSaved, setIsRunSaved] = useState(false);
  const [isQRCodeFullscreen, setIsQRCodeFullscreen] = useState(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));

  const joinLink = generatedRun ? buildJoinLink(generatedRun.joinCode) : '';
  const { dataUrl, isLoading, error: qrError } = useQRCode(joinLink, 320);

  // Användarens GPS-position (om tillgänglig)
  const userPosition = coords ? { lat: coords.latitude, lng: coords.longitude } : null;

  const handleRegenerate = async () => {
    setError('');
    setIsRegenerating(true);
    const newSeed = Math.floor(Math.random() * 100000);
    setSeed(newSeed);
    try {
      const run = await generateRun({
        name: form.name,
        difficulty: form.difficulty,
        audience: form.difficulty,
        categories: form.categories || [],
        lengthMeters: Number(form.lengthMeters),
        questionCount: Number(form.questionCount),
        allowAnonymous: true,
        origin: FALLBACK_POSITION,
        seed: newSeed,
        preferGreenAreas: form.preferGreenAreas,
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

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const toggleCategory = (category) => {
    setForm((prev) => {
      const categories = prev.categories || [];
      const isSelected = categories.includes(category);
      return {
        ...prev,
        categories: isSelected
          ? categories.filter((c) => c !== category)
          : [...categories, category],
      };
    });
  };

  const handleSaveRun = () => {
    setShowPayment(true);
  };

  const handlePaymentSuccess = (paymentResult) => {
    setShowPayment(false);

    if (generatedRun && !currentUser) {
      localStorageService.addCreatedRun(generatedRun);
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(`geoquest:payment:${generatedRun.id}`, JSON.stringify({
        paymentIntentId: paymentResult.paymentIntentId,
        testMode: paymentResult.testMode,
        skipped: paymentResult.skipped || false,
        timestamp: new Date().toISOString(),
      }));
    }

    setIsRunSaved(true);
  };

  const handlePaymentCancel = () => {
    setShowPayment(false);
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
        audience: form.difficulty,
        categories: form.categories || [],
        lengthMeters: Number(form.lengthMeters),
        questionCount: Number(form.questionCount),
        allowAnonymous: true,
        origin: FALLBACK_POSITION,
        seed,
        preferGreenAreas: form.preferGreenAreas,
      }, { id: currentUser?.id || 'anonymous', name: currentUser?.name || '' });
      if (run) {
        setGeneratedRun(run);
        setIsRunSaved(false);
        analyticsService.logVisit('create_run', {
          runId: run.id,
          difficulty: form.difficulty,
          categories: form.categories,
          questionCount: form.questionCount,
        });
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
    <PageLayout headerTitle="Skapa runda" maxWidth="max-w-5xl" className="space-y-10">
      {isQRCodeFullscreen && (
        <FullscreenQRCode dataUrl={dataUrl} onClose={() => setIsQRCodeFullscreen(false)} />
      )}
      {isMapFullscreen && (
        <FullscreenMap
          checkpoints={generatedRun?.checkpoints || []}
          route={generatedRun?.route}
          userPosition={userPosition}
          onClose={() => setIsMapFullscreen(false)}
        />
      )}

      <PaymentModal
        isOpen={showPayment}
        runName={generatedRun?.name || ''}
        amount={1000}
        onSuccess={handlePaymentSuccess}
        onCancel={handlePaymentCancel}
        runId={generatedRun?.id}
        participantId={currentUser?.id}
        allowSkip
      />

      {!generatedRun ? (
        <section className="space-y-8">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 text-center shadow-lg">
            <h1 className="text-2xl font-semibold text-slate-100">Skapa en tipsrunda automatiskt</h1>
            <p className="mt-3 text-sm text-gray-300 sm:text-base">
              Ange namn, svårighetsgrad och önskad längd. RouteQuest skapar en rutt och väljer frågor åt dig.
            </p>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-500/40 bg-red-900/40 px-4 py-3 text-red-100">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-5 rounded-2xl border border-slate-700 bg-slate-900/70 p-6 shadow-xl">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-purple-200">Namn på runda</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-slate-100 focus:border-purple-400 focus:outline-none"
                placeholder="T.ex. Stadsvandring"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-purple-200">Svårighetsgrad</label>
              <select
                name="difficulty"
                value={form.difficulty}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-slate-100 focus:border-purple-400 focus:outline-none"
              >
                <option value="kid">Barn (lätt)</option>
                <option value="family">Familj (medel)</option>
                <option value="adult">Vuxen (svår)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-purple-200">
                Kategorier {form.categories.length === 0 ? '(Alla)' : `(${form.categories.length} valda)`}
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {categoryOptions.map((cat) => {
                  const isSelected = form.categories.includes(cat.value);
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => toggleCategory(cat.value)}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isSelected
                          ? 'bg-purple-500 text-black'
                          : 'border border-slate-600 bg-slate-800 text-slate-100 hover:border-purple-400'
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400">Välj kategorier eller lämna tomt för alla.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-purple-200">Rundans längd (meter)</label>
                <input
                  type="number"
                  name="lengthMeters"
                  min={500}
                  max={10000}
                  step={100}
                  value={form.lengthMeters}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-slate-100 focus:border-purple-400 focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-purple-200">Antal frågor</label>
                <input
                  type="number"
                  name="questionCount"
                  min={3}
                  max={20}
                  value={form.questionCount}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-slate-100 focus:border-purple-400 focus:outline-none"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold text-purple-200">
              <input
                type="checkbox"
                name="preferGreenAreas"
                checked={form.preferGreenAreas}
                onChange={handleChange}
                className="rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
              />
              Föredra parker och stigar
            </label>

            <button
              type="submit"
              className="w-full rounded-xl bg-purple-500 px-4 py-3 font-semibold text-black transition-colors hover:bg-purple-400"
            >
              Skapa runda
            </button>
          </form>
        </section>
      ) : (
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <article className="space-y-6 rounded-2xl border border-purple-500/40 bg-slate-900/70 p-6 shadow-xl">
            {!isRunSaved ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-100">Förslag på runda</h2>
                    <p className="text-sm text-gray-300">
                      Granska kartan nedan. Spara rundan för att visa QR-kod och dela länken.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                    className="rounded-full bg-yellow-500/90 p-3 text-black shadow-lg transition enabled:hover:bg-yellow-400 disabled:bg-slate-700 disabled:text-gray-400"
                    title="Generera om"
                  >
                    {isRegenerating ? (
                      <svg className="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                  </button>
                </div>

                <div className="h-[22rem] rounded-xl border border-slate-700 bg-slate-900/70">
                  <RunMap
                    checkpoints={generatedRun.checkpoints || []}
                    userPosition={userPosition}
                    activeOrder={0}
                    answeredCount={0}
                    route={generatedRun.route}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveRun}
                  className="w-full rounded-xl bg-green-500 px-4 py-3 text-lg font-bold text-black transition-colors hover:bg-green-400"
                >
                  Spara och visa QR-kod
                </button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-slate-100">{generatedRun.name}</h2>
                  <p className="text-sm text-gray-300">
                    Längd: {generatedRun.lengthMeters} m • {generatedRun.questionCount} frågor
                  </p>
                  <p className="text-sm text-gray-300">
                    Anslutningskod: <span className="font-mono text-lg tracking-wide text-cyan-200">{generatedRun.joinCode}</span>
                  </p>
                </div>

                <div className="cursor-pointer" onClick={() => setIsQRCodeFullscreen(true)}>
                  <QRCodeDisplay dataUrl={dataUrl} isLoading={isLoading} error={qrError} />
                </div>

                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(joinLink)}
                    className="rounded-lg bg-purple-500 px-4 py-2 font-semibold text-black transition-colors hover:bg-purple-400"
                  >
                    Kopiera länk
                  </button>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(generatedRun.joinCode)}
                    className="rounded-lg bg-purple-500 px-4 py-2 font-semibold text-black transition-colors hover:bg-purple-400"
                  >
                    Kopiera kod
                  </button>
                </div>

                <div className="text-center text-sm text-gray-300 break-all">
                  <a href={joinLink} target="_blank" rel="noopener noreferrer" className="text-purple-300 underline hover:text-purple-200">
                    {joinLink}
                  </a>
                </div>

                <div className="flex flex-wrap justify-center gap-3 text-sm">
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-black transition-colors hover:bg-cyan-400"
                  >
                    Ladda ner QR-kod
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMapFullscreen(true)}
                    className="rounded-lg border border-slate-600 px-4 py-2 font-semibold text-slate-100 transition-colors hover:border-cyan-400 hover:text-cyan-200"
                  >
                    Visa karta
                  </button>
                </div>
              </>
            )}
          </article>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 text-sm text-gray-300 shadow-lg">
              <h3 className="text-base font-semibold text-slate-100">Tips för en rolig runda</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Placera första kontrollen där alla enkelt samlas.</li>
                <li>Variera frågetyp och tema för bättre engagemang.</li>
                <li>Spara rundan i din meny om du vill återanvända den senare.</li>
              </ul>
            </div>

            {!isRunSaved && (
              <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 text-sm text-gray-300">
                <h3 className="text-base font-semibold text-slate-100">Behöver du ändra något?</h3>
                <p className="mt-2">
                  Gå tillbaka och justera längd, kategorier eller svårighetsgrad. Du kan generera om hur många gånger som helst.
                </p>
              </div>
            )}
          </aside>
        </section>
      )}

      {/* GPS-aktiverings prompt */}
      <GPSPrompt />
    </PageLayout>
  );
};

export default GenerateRunPage;
