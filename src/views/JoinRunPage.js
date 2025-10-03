/**
 * Vy där spelare ansluter med en kod eller via QR-länk.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRun } from '../context/RunContext';
import PaymentModal from '../components/payment/PaymentModal';
import { localStorageService } from '../services/localStorageService';
import { analyticsService } from '../services/analyticsService';
import PageLayout from '../components/layout/PageLayout';

const JoinRunPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, loginAsGuest } = useAuth();
  const { joinRunByCode } = useRun();

  const [joinCode, setJoinCode] = useState('');
  const [alias, setAlias] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [runToJoin, setRunToJoin] = useState(null);
  const [participantData, setParticipantData] = useState(null);

  const handleJoin = useCallback(async (code) => {
    setError('');
    setSuccess('');

    const upperCode = code.trim().toUpperCase();
    if (upperCode.length < 4) {
      setError('Ange en giltig anslutningskod.');
      return;
    }

    let participantUser = currentUser;
    if (!participantUser) {
      if (!alias.trim()) {
        setError('Ange ett alias för att delta.');
        return;
      }
      participantUser = await loginAsGuest({ alias, contact });
    }

    try {
      const { run } = await joinRunByCode(upperCode, {
        userId: participantUser?.isAnonymous ? null : participantUser?.id,
        alias: participantUser?.name,
        contact: participantUser?.contact,
        isAnonymous: participantUser?.isAnonymous,
      });

      setRunToJoin(run);
      setParticipantData({
        userId: participantUser?.isAnonymous ? null : participantUser?.id,
        alias: participantUser?.name,
        contact: participantUser?.contact,
        isAnonymous: participantUser?.isAnonymous,
      });

      setShowPayment(true);
    } catch (joinError) {
      setError(joinError.message);
    }
  }, [currentUser, alias, contact, loginAsGuest, joinRunByCode]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const codeParam = params.get('code');
    if (codeParam) {
      const upperCode = codeParam.toUpperCase();
      setJoinCode(upperCode);
      if (currentUser) {
        handleJoin(upperCode);
      }
    }
  }, [location.search, currentUser, handleJoin]);

  const handleSubmit = (event) => {
    event.preventDefault();
    handleJoin(joinCode);
  };

  const handlePaymentSuccess = (paymentResult) => {
    setShowPayment(false);

    const successMessage = paymentResult.skipped
      ? `Du är nu ansluten till ${runToJoin.name}!`
      : `Tack för ditt stöd! Du är nu ansluten till ${runToJoin.name}!`;

    setSuccess(successMessage);

    if (!currentUser || currentUser.isAnonymous) {
      localStorageService.addJoinedRun(runToJoin, participantData);
    }

    analyticsService.logVisit('join_run', {
      runId: runToJoin.id,
      runName: runToJoin.name,
    });

    if (!paymentResult.skipped && paymentResult.paymentIntentId) {
      analyticsService.logDonation(1000, paymentResult.paymentIntentId, {
        runId: runToJoin.id,
        context: 'join_run',
      });
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(`geoquest:payment:${runToJoin.id}`, JSON.stringify({
        paymentIntentId: paymentResult.paymentIntentId,
        testMode: paymentResult.testMode,
        skipped: paymentResult.skipped || false,
        timestamp: new Date().toISOString(),
      }));
    }

    setTimeout(() => {
      navigate(`/run/${runToJoin.id}/play`);
    }, 600);
  };

  const handlePaymentCancel = () => {
    setShowPayment(false);
    setError('Du kan fortfarande ansluta utan att donera.');
  };

  const localInfo = !currentUser ? localStorageService.getJoinedRuns() : [];

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
          Du har sparade rundor på denna enhet. Du hittar dem under <span className="font-semibold">Mina rundor</span> i menyn.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-900/40 px-4 py-3 text-red-100">
          {error}
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
        </div>

        {!currentUser && (
          <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <div>
              <h2 className="text-base font-semibold text-cyan-200">Spela som gäst</h2>
              <p className="text-xs text-gray-400">Ange ett alias (och valfri kontaktuppgift) så registrerar vi dig som anonym spelare.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-200">Alias</label>
              <input
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:border-cyan-400 focus:outline-none"
                placeholder="Spelare 1"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-200">Kontakt (valfritt)</label>
              <input
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:border-cyan-400 focus:outline-none"
                placeholder="E-post eller telefon"
              />
            </div>
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
        isOpen={showPayment}
        runName={runToJoin?.name || ''}
        amount={500}
        onSuccess={handlePaymentSuccess}
        onCancel={handlePaymentCancel}
        runId={runToJoin?.id}
        participantId={participantData?.userId}
        allowSkip
      />
    </PageLayout>
  );
};

export default JoinRunPage;
