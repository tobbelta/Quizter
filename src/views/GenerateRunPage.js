/**
 * Vy för att skapa en auto-genererad runda på plats.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRun } from '../context/RunContext';
import PageLayout from '../components/layout/PageLayout';
import QRCodeDisplay from '../components/shared/QRCodeDisplay';
import RunMap from '../components/run/RunMap';
import { buildJoinLink } from '../utils/joinLink';
import { FALLBACK_POSITION } from '../utils/constants';
import { localStorageService } from '../services/localStorageService';
import { analyticsService } from '../services/analyticsService';
import { errorLogService } from '../services/errorLogService';
import { userPreferencesService } from '../services/userPreferencesService';
import useQRCode from '../hooks/useQRCode';
import useRunLocation from '../hooks/useRunLocation';
import { useBreadcrumbs } from '../hooks/useBreadcrumbs';
import FullscreenQRCode from '../components/shared/FullscreenQRCode';
import FullscreenMap from '../components/shared/FullscreenMap';

const defaultForm = {
  name: '',
  runType: 'route-based', // 'route-based' eller 'distance-based'
  difficulty: 'family',
  categories: [],
  lengthMeters: 3000,
  questionCount: 9,
  distanceBetweenQuestions: 500, // För distance-based
  preferGreenAreas: false,
  allowRouteSelection: false,
};

const difficultyOptions = [
  { value: 'children', label: 'Barn (6-12 år)' },
  { value: 'youth', label: 'Ungdom (13-17 år)' },
  { value: 'adults', label: 'Vuxen (18+ år)' },
  { value: 'family', label: 'Familj (1/3 av varje)' },
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
  { value: 'Gåtor', label: 'Gåtor' },
];

const GenerateRunPage = () => {
  const navigate = useNavigate();
  const { currentUser, loginAsGuest } = useAuth();
  const { generateRun } = useRun();
  const { coords, status: gpsStatus, trackingEnabled } = useRunLocation();
  const { logFormSubmit, logStateChange } = useBreadcrumbs();
  const [form, setForm] = useState(defaultForm);
  const initialAlias = React.useMemo(() => userPreferencesService.getAlias() || '', []);
  const [alias, setAlias] = useState(initialAlias);
  const [aliasCommitted, setAliasCommitted] = useState(() => Boolean(initialAlias.trim()));
  const [showAliasDialog, setShowAliasDialog] = useState(false);
  const [error, setError] = useState('');
  const [generatedRun, setGeneratedRun] = useState(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRunSaved, setIsRunSaved] = useState(false);
  const [isQRCodeFullscreen, setIsQRCodeFullscreen] = useState(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));

  const joinLink = React.useMemo(() => (
    generatedRun ? buildJoinLink(generatedRun.joinCode) : ''
  ), [generatedRun]);
  const { dataUrl, isLoading, error: qrError } = useQRCode(joinLink, 320);
  const shareTimeoutRef = React.useRef(null);

  const ensureCreatorIdentity = React.useCallback(async () => {
    if (currentUser?.id) {
      return {
        id: currentUser.id,
        name: currentUser.name || '',
      };
    }

    const aliasValue = alias?.trim() || form.name?.trim() || 'G?st';

    try {
    userPreferencesService.saveAlias(aliasValue);
    setAlias(aliasValue);
    setAliasCommitted(true);
      const guestUser = await loginAsGuest({
        alias: aliasValue
      });

      if (!guestUser) {
        throw new Error('G?st-inloggning misslyckades');
      }

      return {
        id: guestUser.uid || guestUser.id || 'anonymous',
        name: guestUser.displayName || guestUser.name || aliasValue || 'G?st'
      };
    } catch (guestError) {
      console.error('[GenerateRunPage] Kunde inte skapa g?stidentitet:', guestError);
      throw guestError;
    }
  }, [alias, currentUser, form.name, loginAsGuest]);

  const handleShare = React.useCallback(async () => {
    if (!generatedRun || !joinLink) {
      return;
    }

    if (shareTimeoutRef.current) {
      clearTimeout(shareTimeoutRef.current);
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: generatedRun.name || 'RouteQuest',
          text: 'Hang med pa min runda!',
          url: joinLink
        });
        setShareStatus('Delat!');
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(joinLink);
        setShareStatus('Lanken kopierades.');
      } else {
        setShareStatus('Kopiera Lanken: ' + joinLink);
      }
    } catch (shareError) {
      console.warn('[GenerateRunPage] Share failed', shareError);
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(joinLink);
        setShareStatus('Lanken kopierades.');
      } else {
        setShareStatus('Kunde inte dela automatiskt.');
      }
    }

    if (typeof window !== 'undefined') {
      shareTimeoutRef.current = window.setTimeout(() => {
        setShareStatus('');
      }, 4000);
    }
  }, [generatedRun, joinLink]);

  React.useEffect(() => {
    if (shareTimeoutRef.current) {
      clearTimeout(shareTimeoutRef.current);
    }
    setShareStatus('');
  }, [generatedRun]);
  React.useEffect(() => {
    return () => {
      if (shareTimeoutRef.current) {
        clearTimeout(shareTimeoutRef.current);
      }
    };
  }, []);


  // Användarens GPS-position (om tillgänglig)
  // OBS: coords från useRunLocation har redan lat/lng format (inte latitude/longitude)
  const userPosition = React.useMemo(() => {
    return coords && coords.lat && coords.lng
      ? { lat: coords.lat, lng: coords.lng }
      : null;
  }, [coords]);

  // Logga GPS-status endast vid betydande statusändringar (inte vid varje koordinatuppdatering)
  const prevGpsStatusRef = React.useRef(gpsStatus);
  const prevTrackingEnabledRef = React.useRef(trackingEnabled);

  React.useEffect(() => {
    // Logga bara vid statusändringar, inte vid varje koordinatuppdatering
    const statusChanged = prevGpsStatusRef.current !== gpsStatus;
    const trackingChanged = prevTrackingEnabledRef.current !== trackingEnabled;

    if (statusChanged || trackingChanged) {
      errorLogService.logGPSDebug({
        message: 'GenerateRunPage GPS status change',
        coords: coords ? {
          latitude: coords.lat,
          longitude: coords.lng,
          accuracy: coords.accuracy,
        } : null,
        gpsStatus,
        trackingEnabled,
        userPosition,
        statusChanged,
        trackingChanged,
      });

      prevGpsStatusRef.current = gpsStatus;
      prevTrackingEnabledRef.current = trackingEnabled;
    }
  }, [coords, gpsStatus, trackingEnabled, userPosition]);

  const handleRegenerate = async () => {
    setError('');
    setIsRegenerating(true);
    const newSeed = Math.floor(Math.random() * 100000);
    setSeed(newSeed);
    try {
      // Använd GPS-position om tillgänglig, annars fallback
      const originPosition = userPosition
        ? { lat: userPosition.lat, lng: userPosition.lng }
        : FALLBACK_POSITION;

      await errorLogService.logRouteGeneration({
        message: 'Route REGENERATION - DETAILED',
        originPosition,
        hasGPS: !!userPosition,
        gpsStatus,
        trackingEnabled,
        coords: coords ? {
          latitude: coords.lat,
          longitude: coords.lng,
          accuracy: coords.accuracy,
        } : null,
        userPosition,
        fallbackPosition: FALLBACK_POSITION,
        willUseFallback: !userPosition,
      });

      const creatorIdentity = await ensureCreatorIdentity();

      const run = await generateRun({
        name: form.name,
        difficulty: form.difficulty,
        audience: form.difficulty,
        categories: form.categories || [],
        lengthMeters: Number(form.lengthMeters),
        questionCount: Number(form.questionCount),
        allowAnonymous: true,
        allowRouteSelection: form.allowRouteSelection,
        origin: originPosition,
        seed: newSeed,
        preferGreenAreas: form.preferGreenAreas,
      }, creatorIdentity);
      if (run) {
        setGeneratedRun(run);
        setIsRunSaved(false);
      }
    } catch (generationError) {
      console.error('❌ Fel vid regenerering:', generationError);
      const displayMessage = generationError?.code === 'permission-denied'
        ? 'Behorighet saknas for att spara rundan. Ladda om sidan eller logga in och forsok igen.'
        : generationError.message;
      setError(`Kunde inte regenerera runda: ${displayMessage}`);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    const parsedValue = type === 'checkbox' ? checked : value;

    setForm((prev) => {
      const next = { ...prev };

      if (name === 'questionCount') {
        const numericValue = Math.max(3, Number(parsedValue) || 3);
        if (prev.difficulty === 'family') {
          const adjusted = Math.max(3, Math.round(numericValue / 3) * 3);
          next.questionCount = adjusted;
        } else {
          next.questionCount = numericValue;
        }
        return next;
      }

      if (name === 'difficulty') {
        next.difficulty = parsedValue;
        if (parsedValue === 'family') {
          const adjusted = Math.max(3, Math.round((prev.questionCount || 9) / 3) * 3);
          next.questionCount = adjusted;
        }
        return next;
      }

      next[name] = parsedValue;
      return next;
    });
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
    if (!generatedRun) return;

    if (!currentUser) {
      localStorageService.addCreatedRun(generatedRun);
    }

    if (shareTimeoutRef.current) {
      clearTimeout(shareTimeoutRef.current);
    }
    setShareStatus('');
    setIsRunSaved(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    // Om användaren är anonym och inte har angett alias, visa dialog
    if (currentUser?.isAnonymous && !alias.trim()) {
      setShowAliasDialog(true);
      return;
    }

    // Logga att användaren försöker skapa en runda
    logFormSubmit('Create Run Form', {
      name: form.name,
      difficulty: form.difficulty,
      lengthMeters: form.lengthMeters,
      hasGPS: !!userPosition,
    });

    try {
      if (!form.name.trim()) {
        setError('Ange ett namn på rundan.');
        logStateChange('Form validation failed: name missing');
        return;
      }

      // Om användaren är anonym, uppdatera profilen med alias
      if (currentUser?.isAnonymous && alias.trim()) {
        const cleanAlias = alias.trim();
        userPreferencesService.saveAlias(cleanAlias);
        setAliasCommitted(true);
        await loginAsGuest({ alias: cleanAlias });
      }

      // Använd GPS-position om tillgänglig, annars fallback
      const originPosition = userPosition
        ? { lat: userPosition.lat, lng: userPosition.lng }
        : FALLBACK_POSITION;

      // Logga ruttgenerering med all GPS-info
      await errorLogService.logRouteGeneration({
        message: 'Route generation started - DETAILED',
        originPosition,
        hasGPS: !!userPosition,
        gpsStatus,
        trackingEnabled,
        coords: coords ? {
          latitude: coords.lat,
          longitude: coords.lng,
          accuracy: coords.accuracy,
        } : null,
        userPosition,
        fallbackPosition: FALLBACK_POSITION,
        willUseFallback: !userPosition,
        formData: {
          name: form.name,
          difficulty: form.difficulty,
          lengthMeters: form.lengthMeters,
          questionCount: form.questionCount,
        },
      });

      const creatorIdentity = await ensureCreatorIdentity();

      // Bygg payload baserat på runType
      const basePayload = {
        name: form.name,
        difficulty: form.difficulty,
        audience: form.difficulty,
        categories: form.categories || [],
        questionCount: Number(form.questionCount),
        allowAnonymous: true,
        runType: form.runType
      };

      const payload = form.runType === 'distance-based'
        ? {
            ...basePayload,
            distanceBetweenQuestions: Number(form.distanceBetweenQuestions)
          }
        : {
            ...basePayload,
            lengthMeters: Number(form.lengthMeters),
            allowRouteSelection: form.allowRouteSelection,
            origin: originPosition,
            seed,
            preferGreenAreas: form.preferGreenAreas
          };

      const run = await generateRun(payload, creatorIdentity);

      if (run) {
        setGeneratedRun(run);
        analyticsService.logVisit('create_run', {
          runId: run.id,
          difficulty: form.difficulty,
          categories: form.categories,
          questionCount: form.questionCount,
        });

        // Logga lyckad generering
        await errorLogService.logInfo('Route generated successfully', {
          runId: run.id,
          usedGPS: !!userPosition,
          originPosition,
        });

        // Om allowRouteSelection är false, använd join-flödet för att gå direkt till spel
        if (!form.allowRouteSelection) {
          // Spara rundan lokalt om användaren inte är inloggad
          if (!currentUser) {
            localStorageService.addCreatedRun(run);
          }
          // Använd join-flödet som hanterar participant-registrering korrekt
          navigate(`/join?code=${run.joinCode}`, { replace: true });
        } else {
          // Om allowRouteSelection är true, visa "Förslag på runda"
          setIsRunSaved(false);
        }
      }
    } catch (generationError) {
      console.error('❌ Fel vid generering:', generationError);
      const displayMessage = generationError?.code === 'permission-denied'
        ? 'Behorighet saknas for att skapa rundan. Ladda om sidan eller logga in och forsok igen.'
        : generationError.message;
      setError(`Kunde inte generera runda: ${displayMessage}`);

      // Logga fel
      await errorLogService.logError({
        type: 'route_generation_failed',
        message: generationError.message,
        stack: generationError.stack,
        gpsStatus,
        trackingEnabled,
        userPosition,
      });
    }
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

      {/* Alias dialog - visas om användaren inte har angett alias */}
      {showAliasDialog && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-cyan-500/40 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-slate-100 mb-4">Ange ditt alias</h2>
            <p className="text-sm text-gray-300 mb-6">
              För att skapa en runda behöver vi veta vad du vill kallas. Aliaset sparas på enheten.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-cyan-200 mb-2">Alias</label>
                <input
                  type="text"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="T.ex. Erik"
                  autoFocus
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowAliasDialog(false)}
                  className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 font-semibold text-slate-100 hover:bg-slate-700"
                >
                  Avbryt
                </button>
                <button
                  onClick={async () => {
                    if (!alias.trim()) {
                      setError('Ange ett alias');
                      return;
                    }
                    const cleanAlias = alias.trim();
                    userPreferencesService.saveAlias(cleanAlias);
                    setAliasCommitted(true);
                    await loginAsGuest({ alias: cleanAlias });
                    setShowAliasDialog(false);
                    // Trigga submit igen
                    handleSubmit({ preventDefault: () => {} });
                  }}
                  className="flex-1 rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-black hover:bg-cyan-400"
                >
                  Fortsätt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

          {currentUser?.isAnonymous && !aliasCommitted && (
            <div className="space-y-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
              <h3 className="text-sm font-semibold text-cyan-200">Ditt alias</h3>
              <div className="space-y-1.5">
                <label className="block text-xs text-gray-400">Alias (visas för deltagare)</label>
                <input
                  type="text"
                  value={alias}
                  onChange={(e) => {
                    setAlias(e.target.value);
                  }}
                  placeholder="T.ex. Erik"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <p className="text-xs text-gray-400">
                Aliaset sparas på denna enhet och kommer ihåg nästa gång.
              </p>
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

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-purple-200">Typ av runda</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, runType: 'route-based' })}
                  className={`rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                    form.runType === 'route-based'
                      ? 'bg-purple-500 text-black'
                      : 'border border-slate-600 bg-slate-800 text-slate-100 hover:border-purple-400'
                  }`}
                >
                  📍 Rutt-baserad
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, runType: 'distance-based' })}
                  className={`rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                    form.runType === 'distance-based'
                      ? 'bg-purple-500 text-black'
                      : 'border border-slate-600 bg-slate-800 text-slate-100 hover:border-purple-400'
                  }`}
                >
                  🚶 Distans-baserad
                </button>
              </div>
              <p className="text-xs text-gray-400">
                {form.runType === 'route-based' 
                  ? 'Förutbestämd rutt på kartan med frågor på specifika platser.'
                  : 'Gå fritt - frågor triggas automatiskt när du gått tillräckligt långt.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-purple-200">Svårighetsgrad</label>
              <select
                name="difficulty"
                value={form.difficulty}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-slate-100 focus:border-purple-400 focus:outline-none"
              >
                {difficultyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                {form.difficulty === 'children' && 'Endast frågor märkta för barn (ageGroups: children).'}
                {form.difficulty === 'youth' && 'Endast frågor märkta för ungdomar (ageGroups: youth).'}
                {form.difficulty === 'adults' && 'Endast frågor märkta för vuxna (ageGroups: adults).'}
                {form.difficulty === 'family' && 'Familjeläge blandar 1/3 barn-, 1/3 ungdoms- och 1/3 vuxenfrågor.'}
              </p>
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

            {/* Rutt-baserad: Visa längd och preferGreenAreas */}
            {form.runType === 'route-based' && (
              <>
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
                      step={form.difficulty === 'family' ? 3 : 1}
                      value={form.questionCount}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-slate-100 focus:border-purple-400 focus:outline-none"
                    />
                    {form.difficulty === 'family' && (
                      <p className="text-xs text-gray-400">
                        Familjeläge använder en tredjedel per åldersgrupp. Antal frågor rundas till närmaste
                        multipel av tre.
                      </p>
                    )}
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

                <label className="flex items-center gap-2 text-sm font-semibold text-purple-200">
                  <input
                    type="checkbox"
                    name="allowRouteSelection"
                    checked={form.allowRouteSelection}
                    onChange={handleChange}
                    className="rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
                  />
                  <div className="flex-1">
                    <span>Visa karta innan start</span>
                    <p className="text-xs font-normal text-gray-400 mt-0.5">
                      Om ikryssad kan deltagare se kartan och generera om rutten innan de startar
                    </p>
                  </div>
                </label>
              </>
            )}

            {/* Distans-baserad: Visa distans mellan frågor */}
            {form.runType === 'distance-based' && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-purple-200">Distans mellan frågor (meter)</label>
                    <input
                      type="number"
                      name="distanceBetweenQuestions"
                      min={10}
                      max={2000}
                      step={10}
                      value={form.distanceBetweenQuestions}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-slate-100 focus:border-purple-400 focus:outline-none"
                    />
                    <p className="text-xs text-gray-400">
                      Frågor triggas automatiskt när du gått denna distans (min 10m för testning)
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-purple-200">Antal frågor</label>
                    <input
                      type="number"
                      name="questionCount"
                      min={3}
                      max={20}
                      step={form.difficulty === 'family' ? 3 : 1}
                      value={form.questionCount}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-slate-100 focus:border-purple-400 focus:outline-none"
                    />
                    {form.difficulty === 'family' && (
                      <p className="text-xs text-gray-400">
                        Familjeläge använder en tredjedel per åldersgrupp. Antal frågor rundas till närmaste
                        multipel av tre.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

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
                      Granska kartan nedan. Spara rundan för att visa QR-kod och dela lanken.
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
                <div className="space-y-2 text-center sm:text-left">
                  <h2 className="text-xl font-semibold text-slate-100">{generatedRun.name}</h2>
                  <p className="text-sm text-gray-300">
                    L�ngd: {generatedRun.lengthMeters} m � {generatedRun.questionCount} fr�gor
                  </p>
                  <p className="text-sm text-gray-300">
                    Anslutningskod: <span className="font-mono text-lg tracking-wide text-cyan-200">{generatedRun.joinCode}</span>
                  </p>
                </div>

                <div className="cursor-pointer" onClick={() => setIsQRCodeFullscreen(true)}>
                  <QRCodeDisplay dataUrl={dataUrl} isLoading={isLoading} error={qrError} />
                </div>

                <div className="flex flex-wrap justify-center gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => navigate(`/join?code=${generatedRun.joinCode}`)}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black transition-colors hover:bg-emerald-400 disabled:opacity-60"
                    disabled={!generatedRun?.joinCode}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                    Starta runda
                  </button>
                  <button
                    type="button"
                    onClick={handleShare}
                    disabled={!joinLink}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-600/70 px-3 py-2 text-slate-100 transition-colors hover:border-cyan-400/80 hover:text-cyan-200 disabled:opacity-60"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v8" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 6l3-3 3 3" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                    </svg>
                    Dela
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMapFullscreen(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-600/70 px-3 py-2 text-slate-100 transition-colors hover:border-cyan-400/80 hover:text-cyan-200"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A2 2 0 013 15.382V5.618a2 2 0 011.105-1.795L9 2m6 0l4.895 1.823A2 2 0 0121 5.618v9.764a2 2 0 01-1.105 1.795L15 20m-6 0V2m6 18V2" />
                    </svg>
                    Visa karta
                  </button>
                </div>

                {shareStatus && (
                  <p className="text-xs text-center text-emerald-200">
                    {shareStatus}
                  </p>
                )}

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

    </PageLayout>
  );
};

export default GenerateRunPage;

















