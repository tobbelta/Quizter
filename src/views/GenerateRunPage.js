/**
 * Vy för att skapa en auto-genererad runda på plats.
 */
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRun } from '../context/RunContext';
import Header from '../components/layout/Header';
import QRCodeDisplay from '../components/shared/QRCodeDisplay';
import RunMap from '../components/run/RunMap';
import PaymentModal from '../components/payment/PaymentModal';
import GPSPrompt from '../components/shared/GPSPrompt';
import { buildJoinLink } from '../utils/joinLink';
import { FALLBACK_POSITION } from '../utils/constants';
import { localStorageService } from '../services/localStorageService';
import { analyticsService } from '../services/analyticsService';
import useQRCode from '../hooks/useQRCode';
import FullscreenQRCode from '../components/shared/FullscreenQRCode';
import FullscreenMap from '../components/shared/FullscreenMap';

const defaultForm = {
  name: '',
  difficulty: 'family',
  categories: [],
  lengthMeters: 3000,
  questionCount: 8,
  preferGreenAreas: false
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
  { value: 'Gåtor', label: 'Gåtor' }
];

const GenerateRunPage = () => {
  const { currentUser } = useAuth();
  const { generateRun } = useRun();
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
        preferGreenAreas: form.preferGreenAreas
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

  const handleSaveRun = () => {
    // Visa donation-modal innan QR-kod visas
    setShowPayment(true);
  };

  const handlePaymentSuccess = (paymentResult) => {
    setShowPayment(false);

    // Spara rundan lokalt om användaren är anonym
    if (generatedRun && !currentUser) {
      localStorageService.addCreatedRun(generatedRun);
    }

    // Spara betalningsinformation
    if (typeof window !== 'undefined') {
      localStorage.setItem(`geoquest:payment:${generatedRun.id}`, JSON.stringify({
        paymentIntentId: paymentResult.paymentIntentId,
        testMode: paymentResult.testMode,
        skipped: paymentResult.skipped || false,
        timestamp: new Date().toISOString()
      }));
    }

    setIsRunSaved(true);
  };

  const handlePaymentCancel = () => {
    setShowPayment(false);
    // Tillåt att fortsätta utan donation
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
        categories: form.categories || [],
        lengthMeters: Number(form.lengthMeters),
        questionCount: Number(form.questionCount),
        allowAnonymous: true, // Alltid tillåt anonyma
        origin: FALLBACK_POSITION,
        seed: seed,
        preferGreenAreas: form.preferGreenAreas
      }, { id: currentUser?.id || 'anonymous', name: currentUser?.name || '' });
      if (run) {
        setGeneratedRun(run); // Spara den genererade rundan i lokal state
        setIsRunSaved(false);

        // Logga analytics
        analyticsService.logVisit('create_run', {
          runId: run.id,
          difficulty: form.difficulty,
          categories: form.categories,
          questionCount: form.questionCount
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
    <div className="min-h-screen bg-slate-950">
      <Header title="Skapa runda" />

      {isQRCodeFullscreen && <FullscreenQRCode dataUrl={dataUrl} onClose={() => setIsQRCodeFullscreen(false)} />}
      {isMapFullscreen && <FullscreenMap checkpoints={generatedRun.checkpoints} route={generatedRun.route} onClose={() => setIsMapFullscreen(false)} />}

      {/* Betalningsmodal */}
      <PaymentModal
        isOpen={showPayment}
        runName={generatedRun?.name || ''}
        amount={1000}
        onSuccess={handlePaymentSuccess}
        onCancel={handlePaymentCancel}
        runId={generatedRun?.id}
        participantId={currentUser?.id}
        allowSkip={true}
      />

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
                <label className="mb-1 block text-sm font-semibold text-purple-200">
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
                        className={`rounded px-2 py-1.5 text-sm font-medium transition-colors ${
                          isSelected
                            ? 'bg-purple-500 text-black'
                            : 'bg-slate-800 border border-slate-600 text-gray-300 hover:bg-slate-700'
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Välj kategorier eller lämna tomt för alla kategorier
                </p>
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
                <label className="flex items-center gap-2 text-sm font-semibold text-purple-200">
                  <input
                    type="checkbox"
                    name="preferGreenAreas"
                    checked={form.preferGreenAreas}
                    onChange={handleChange}
                    className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-purple-500"
                  />
                  Föredra parker & stigar
                </label>
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
                  </div>
                  <p className="text-gray-200">
                    Granska kartan nedan. Om du är nöjd, spara rundan för att få en QR-kod.
                  </p>
                  <div className="h-96 relative">
                    <RunMap
                      checkpoints={generatedRun.checkpoints || []}
                      userPosition={null}
                      activeOrder={0}
                      answeredCount={0}
                      route={generatedRun.route}
                    />
                    {/* Generera om-knapp som ikon på kartan */}
                    <button
                      type="button"
                      onClick={handleRegenerate}
                      disabled={isRegenerating}
                      className="absolute top-4 right-4 z-[1000] rounded-full bg-yellow-500 p-3 text-black hover:bg-yellow-400 disabled:bg-slate-700 disabled:text-gray-400 shadow-lg transition-all"
                      title="Generera om"
                    >
                      {isRegenerating ? (
                        <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      )}
                    </button>
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

      {/* GPS-aktiverings prompt */}
      <GPSPrompt />
    </div>
  );
};

export default GenerateRunPage;