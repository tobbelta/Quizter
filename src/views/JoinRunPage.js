/**
 * Vy där spelare ansluter med en kod eller via QR-länk.
 */
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRun } from '../context/RunContext';
import { localStorageService } from '../services/localStorageService';
import { analyticsService } from '../services/analyticsService';
import { userPreferencesService } from '../services/userPreferencesService';
import PageLayout from '../components/layout/PageLayout';
import PaymentModal from '../components/payment/PaymentModal';
import { runRepository } from '../repositories/runRepository';

const JoinRunPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, loginAsGuest, isAuthInitialized } = useAuth();
  const { joinRunByCode, attachToRun } = useRun();

  const [joinCode, setJoinCode] = useState('');
  const initialAlias = useMemo(() => userPreferencesService.getAlias() || '', []);
  const [alias, setAlias] = useState(initialAlias);
  const [aliasCommitted, setAliasCommitted] = useState(() => Boolean(initialAlias.trim()));
  const [contact, setContact] = useState(() => userPreferencesService.getContact());
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingJoin, setPendingJoin] = useState(null);
  const [paymentError, setPaymentError] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scanFrameRef = useRef(null);
  const scanActiveRef = useRef(false);
  const mediaStreamRef = useRef(null);
  const detectorRef = useRef(null);
  const isScannerSupported = typeof window !== 'undefined'
    && 'BarcodeDetector' in window
    && typeof navigator !== 'undefined'
    && navigator.mediaDevices?.getUserMedia;

  const confirmReplaceAnonymousRun = useCallback(async (nextRunId) => {
    const existingRuns = localStorageService.getJoinedRuns();
    const existing = existingRuns.length > 0 ? existingRuns[0] : null;
    if (!existing || existing.runId === nextRunId) {
      return true;
    }

    const confirmed = window.confirm(
      'Du har redan en aktiv runda på denna enhet. Om du ansluter till en ny runda avslutas den nuvarande. Fortsätta?'
    );
    if (!confirmed) return false;

    try {
      if (existing.participantId) {
        await runRepository.completeRun(existing.runId, existing.participantId);
      }
    } catch (error) {
      console.warn('[JoinRunPage] Kunde inte avsluta tidigare runda:', error);
    }

    localStorageService.clearAnonymousRuns();
    return true;
  }, []);

  const handleJoin = useCallback(async (code) => {
    setError('');
    setSuccess('');
    setPaymentError('');

    const upperCode = code.trim().toUpperCase();
    if (upperCode.length < 4) {
      setError('Ange en giltig anslutningskod.');
      return;
    }

    const requiresGuest = !currentUser || currentUser.isAnonymous;
    let participantUser = currentUser;
    const cleanAlias = alias.trim();
    if (contact) {
      userPreferencesService.saveContact(contact);
    }
    if (requiresGuest && cleanAlias) {
      userPreferencesService.saveAlias(cleanAlias);
      setAlias(cleanAlias);
      setAliasCommitted(true);
      participantUser = await loginAsGuest({ alias: cleanAlias, contact });
    } else if (requiresGuest && !participantUser) {
      participantUser = await loginAsGuest({ contact });
    }

    try {
      const run = await runRepository.getRunByCode(upperCode);
      if (!run) {
        setError(`Ingen runda hittades med anslutningskod "${upperCode}"`);
        return;
      }

      const existingJoined = localStorageService.getJoinedRuns().find((entry) => entry.runId === run.id);
      if (existingJoined?.participantId) {
        try {
          await attachToRun(run.id, existingJoined.participantId);
          navigate(`/run/${run.id}/play`);
          return;
        } catch (attachError) {
          localStorageService.removeJoinedRun(run.id);
        }
      }

      if (participantUser?.isAnonymous) {
        const canProceed = await confirmReplaceAnonymousRun(run.id);
        if (!canProceed) return;
      }

      const isHost = Boolean(participantUser?.id && run.createdBy && participantUser.id === run.createdBy);
      const playerAmount = Number(run.paymentPlayerAmount || 0);
      const requiresPayment = playerAmount > 0 && !isHost;

      const participantDetails = {
        userId: participantUser?.isAnonymous ? null : participantUser?.id,
        alias: participantUser?.name,
        contact: participantUser?.contact,
        isAnonymous: participantUser?.isAnonymous,
      };
      if (participantUser?.isAnonymous) {
        const deviceId = analyticsService.getDeviceId();
        if (deviceId) {
          participantDetails.deviceId = deviceId;
        }
      }

      if (requiresPayment) {
        setPendingJoin({
          run,
          participantDetails,
          joinCode: upperCode,
        });
        setShowPaymentModal(true);
        return;
      }

      const { run: joinedRun, participant } = await joinRunByCode(upperCode, participantDetails);

      if (!currentUser || currentUser.isAnonymous) {
        localStorageService.replaceJoinedRun(joinedRun, participant);
      } else {
        localStorageService.addJoinedRun(joinedRun, participantDetails);
      }

      analyticsService.logVisit('join_run', {
        runId: joinedRun.id,
        runName: joinedRun.name,
      });

      setSuccess(`Du är nu ansluten till ${joinedRun.name}!`);

      setTimeout(() => {
        navigate(`/run/${joinedRun.id}/play`);
      }, 600);
    } catch (joinError) {
      setError(joinError.message);
    }
  }, [currentUser, alias, contact, loginAsGuest, joinRunByCode, navigate, confirmReplaceAnonymousRun, attachToRun]);

  const parseJoinCode = useCallback((rawValue) => {
    if (!rawValue) return null;
    const trimmed = String(rawValue).trim();
    if (!trimmed) return null;
    try {
      const url = new URL(trimmed);
      const code = url.searchParams.get('code');
      if (code) return code;
    } catch (error) {
      // Inte en URL
    }
    const codeMatch = trimmed.match(/code=([A-Za-z0-9]+)/i);
    if (codeMatch) return codeMatch[1];
    const compact = trimmed.replace(/[^A-Za-z0-9]/g, '');
    if (/^[A-Za-z0-9]{4,12}$/.test(compact)) return compact;
    return null;
  }, []);

  const stopScanner = useCallback(() => {
    scanActiveRef.current = false;
    if (scanFrameRef.current) {
      cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleScanResult = useCallback((rawValue) => {
    const parsed = parseJoinCode(rawValue);
    if (!parsed) {
      setScannerError('QR-koden innehåller ingen giltig anslutningskod.');
      return;
    }
    const normalized = parsed.toUpperCase();
    setJoinCode(normalized);
    setShowScanner(false);
    stopScanner();
    handleJoin(normalized);
  }, [handleJoin, parseJoinCode, stopScanner]);

  useEffect(() => {
    if (!showScanner) {
      stopScanner();
      return undefined;
    }
    if (!isScannerSupported) {
      setScannerError('Din enhet stöder inte QR-skanning i webbläsaren.');
      return undefined;
    }

    let cancelled = false;

    const startScanner = async () => {
      try {
        setScannerError('');
        const supportedFormats = typeof window.BarcodeDetector.getSupportedFormats === 'function'
          ? await window.BarcodeDetector.getSupportedFormats()
          : ['qr_code'];
        if (!supportedFormats.includes('qr_code')) {
          setScannerError('QR-skanning stöds inte i den här webbläsaren.');
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        mediaStreamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        scanActiveRef.current = true;

        const scanLoop = async () => {
          if (!scanActiveRef.current || cancelled) return;
          const video = videoRef.current;
          const detector = detectorRef.current;
          if (video && detector && video.readyState >= 2) {
            const width = video.videoWidth;
            const height = video.videoHeight;
            if (width && height) {
              if (!canvasRef.current) {
                canvasRef.current = document.createElement('canvas');
              }
              const canvas = canvasRef.current;
              if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
              }
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(video, 0, 0, width, height);
                try {
                  const codes = await detector.detect(canvas);
                  if (codes?.length) {
                    handleScanResult(codes[0].rawValue);
                    return;
                  }
                } catch (error) {
                  // Ignore och försök igen
                }
              }
            }
          }
          scanFrameRef.current = requestAnimationFrame(scanLoop);
        };

        scanFrameRef.current = requestAnimationFrame(scanLoop);
      } catch (error) {
        setScannerError('Kunde inte starta kameran. Kontrollera behörigheter.');
        stopScanner();
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [showScanner, isScannerSupported, handleScanResult, stopScanner]);

  const handlePaymentSuccess = useCallback(async (paymentResult) => {
    setShowPaymentModal(false);
    if (!pendingJoin) return;

    try {
      const { participantDetails, joinCode } = pendingJoin;
      const { run: joinedRun, participant } = await joinRunByCode(joinCode, {
        ...participantDetails,
        paymentId: paymentResult?.paymentId || null
      });

      if (!currentUser || currentUser.isAnonymous) {
        localStorageService.replaceJoinedRun(joinedRun, participant);
      } else {
        localStorageService.addJoinedRun(joinedRun, participantDetails);
      }

      analyticsService.logVisit('join_run', {
        runId: joinedRun.id,
        runName: joinedRun.name,
      });

      setSuccess(`Du är nu ansluten till ${joinedRun.name}!`);
      setPendingJoin(null);

      setTimeout(() => {
        navigate(`/run/${joinedRun.id}/play`);
      }, 600);
    } catch (joinError) {
      setPaymentError(joinError.message || 'Kunde inte ansluta efter betalning.');
    }
  }, [pendingJoin, joinRunByCode, navigate, currentUser]);

  const handlePaymentCancel = () => {
    setShowPaymentModal(false);
    setPendingJoin(null);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleStorage = (event) => {
      if (!event.key || event.key === 'quizter:preferences') {
        const storedAlias = userPreferencesService.getAlias() || '';
        setAlias(storedAlias);
        setAliasCommitted(Boolean(storedAlias.trim()));
        setContact(userPreferencesService.getContact());
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('userPreferences:changed', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('userPreferences:changed', handleStorage);
    };
  }, []);

  // Ta bort auto-login för gäster - de ska fylla i sitt alias först
  // useEffect för auth-check har tagits bort

  // Förifyll joinCode från URL och auto-join för inloggade användare
  useEffect(() => {
    if (!isAuthInitialized) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const codeParam = params.get('code');
    if (codeParam) {
      const upperCode = codeParam.toUpperCase();
      setJoinCode(upperCode);

      // Om användaren är riktigt inloggad (inte anonym), anslut direkt
      if (currentUser && !currentUser.isAnonymous) {
        handleJoin(upperCode);
      }
      // Om användaren är anonym, anslut direkt (alias är valfritt)
      else if (currentUser?.isAnonymous) {
        handleJoin(upperCode);
      }
    }
  }, [location.search, currentUser, isAuthInitialized, handleJoin]);

  const handleSubmit = (event) => {
    event.preventDefault();
    handleJoin(joinCode);
  };

  const localInfo = (!currentUser || currentUser?.isAnonymous)
    ? localStorageService.getJoinedRuns()
    : [];

  return (
    <PageLayout headerTitle="Anslut till runda" maxWidth="max-w-2xl" className="space-y-8">
      <section className="space-y-3 text-center">
        <h1 className="text-3xl font-semibold text-slate-100">Skriv in din kod</h1>
        <p className="text-sm text-gray-300 sm:text-base">
          Koden finns i QR-länken eller på kortet som delades med dig. Skanna gärna QR:n direkt om du har den.
        </p>
      </section>

      {localInfo.length > 0 && (
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          Du har en aktiv runda sparad på denna enhet. Du hittar den under <span className="font-semibold">Mina rundor</span> i menyn.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-900/40 px-4 py-3 text-red-100">
          {error}
        </div>
      )}
      {paymentError && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-900/40 px-4 py-3 text-amber-100">
          {paymentError}
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-900/40 px-4 py-3 text-emerald-100">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-700 bg-slate-900/70 p-5 sm:p-6">
        <div>
          <label className="mb-1 block text-sm font-semibold text-cyan-200">Anslutningskod</label>
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 font-mono text-lg tracking-[0.4em] text-center text-slate-100 focus:border-cyan-400 focus:outline-none"
            placeholder="ABC123"
            inputMode="text"
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => {
                setScannerError('');
                setShowScanner(true);
              }}
              disabled={!isScannerSupported}
              className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
            >
              Skanna QR
            </button>
            {!isScannerSupported && (
              <span className="text-xs text-slate-500">QR-skanning stöds inte här.</span>
            )}
          </div>
        </div>

        {(!currentUser || currentUser?.isAnonymous) && !aliasCommitted && (
          <div className="space-y-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
            <div>
              <h2 className="text-base font-semibold text-cyan-200">Ditt namn</h2>
              <p className="text-xs text-gray-400">
                {alias ? 'Detta alias sparas på din enhet och används vid framtida anslutningar.' : 'Alias är valfritt. Lämna tomt så används ett automatiskt ID.'}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-200">Alias (valfritt)</label>
              <input
                value={alias}
                onChange={(event) => {
                  setAlias(event.target.value);
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:border-cyan-400 focus:outline-none"
                placeholder="T.ex. Erik"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-200">Kontakt (valfritt)</label>
              <input
                value={contact}
                onChange={(event) => {
                  setContact(event.target.value);
                  userPreferencesService.saveContact(event.target.value);
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:border-cyan-400 focus:outline-none"
                placeholder="E-post eller telefon"
              />
            </div>
          </div>
        )}
        {(!currentUser || currentUser?.isAnonymous) && aliasCommitted && (
          <div className="space-y-1 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4 text-sm text-cyan-100">
            <p>
              Aliaset <span className="font-semibold text-cyan-200">{alias}</span> används automatiskt för denna anslutning.
            </p>
            <p className="text-xs text-gray-400">
              Du kan ta bort aliaset via menyn om du vill ange ett nytt.
            </p>
          </div>
        )}

        <button
          type="submit"
          className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-black transition-colors hover:bg-cyan-400"
        >
          Anslut till runda
        </button>
      </form>

      <PaymentModal
        isOpen={showPaymentModal}
        title="Betala för rundan"
        description={pendingJoin?.run?.name ? `Betalning krävs för att ansluta till ${pendingJoin.run.name}.` : 'Betalning krävs för att ansluta.'}
        purpose="run_player"
        amount={pendingJoin?.run?.paymentPlayerAmount}
        currency={pendingJoin?.run?.paymentCurrency}
        allowSkip={false}
        context={{
          runId: pendingJoin?.run?.id,
          userId: pendingJoin?.participantDetails?.userId,
          questionCount: pendingJoin?.run?.questionCount || pendingJoin?.run?.questionIds?.length || 0,
          expectedPlayers: pendingJoin?.run?.expectedPlayers || 0
        }}
        onSuccess={handlePaymentSuccess}
        onCancel={handlePaymentCancel}
      />

      {showScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-100">Skanna QR-kod</h2>
              <button
                type="button"
                onClick={() => setShowScanner(false)}
                className="rounded-lg border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:border-slate-500"
              >
                Stäng
              </button>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
              <div className="aspect-video w-full">
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  playsInline
                  muted
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Rikta kameran mot QR-koden så ansluter vi automatiskt.
            </p>
            {scannerError && (
              <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-900/30 px-3 py-2 text-xs text-amber-100">
                {scannerError}
              </div>
            )}
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default JoinRunPage;
