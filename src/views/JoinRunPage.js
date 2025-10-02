/**
 * Vy där spelare ansluter med en join-kod eller QR-länk.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRun } from '../context/RunContext';
import PaymentModal from '../components/payment/PaymentModal';
import { localStorageService } from '../services/localStorageService';
import { analyticsService } from '../services/analyticsService';
import Header from '../components/layout/Header';

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
    console.log('handleJoin called with code:', code);
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
      console.log('Calling loginAsGuest');
      participantUser = await loginAsGuest({ alias, contact });
      console.log('loginAsGuest returned:', participantUser);
    }

    try {
      console.log('Calling joinRunByCode with code:', upperCode);
      const { run } = await joinRunByCode(upperCode, {
        userId: participantUser?.isAnonymous ? null : participantUser?.id,
        alias: participantUser?.name,
        contact: participantUser?.contact,
        isAnonymous: participantUser?.isAnonymous
      });
      console.log('joinRunByCode returned run:', run);

      setRunToJoin(run);
      setParticipantData({
        userId: participantUser?.isAnonymous ? null : participantUser?.id,
        alias: participantUser?.name,
        contact: participantUser?.contact,
        isAnonymous: participantUser?.isAnonymous
      });

      setShowPayment(true);
    } catch (joinError) {
      console.error('Error in handleJoin:', joinError);
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
  }

  const handlePaymentSuccess = (paymentResult) => {
    setShowPayment(false);

    const successMessage = paymentResult.skipped
      ? `Du är nu ansluten till ${runToJoin.name}!`
      : `Tack för ditt stöd! Du är nu ansluten till ${runToJoin.name}!`;

    setSuccess(successMessage);

    if (!currentUser || currentUser.isAnonymous) {
      localStorageService.addJoinedRun(runToJoin, participantData);
    }

    // Logga join analytics
    analyticsService.logVisit('join_run', {
      runId: runToJoin.id,
      runName: runToJoin.name
    });

    // Logga donation om det inte hoppades över
    if (!paymentResult.skipped && paymentResult.paymentIntentId) {
      analyticsService.logDonation(1000, paymentResult.paymentIntentId, {
        runId: runToJoin.id,
        context: 'join_run'
      });
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(`geoquest:payment:${runToJoin.id}`, JSON.stringify({
        paymentIntentId: paymentResult.paymentIntentId,
        testMode: paymentResult.testMode,
        skipped: paymentResult.skipped || false,
        timestamp: new Date().toISOString()
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

  return (
    <div className="min-h-screen bg-slate-950">
      <Header />
      <div className="mx-auto max-w-xl px-4 py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold mb-2">Anslut till runda</h1>
        <p className="text-gray-300">Ange anslutningskod från QR eller inbjudan.</p>
      </header>

      {error && <div className="rounded border border-red-500 bg-red-900/40 px-4 py-3 text-red-200">{error}</div>}
      {success && <div className="rounded border border-emerald-500 bg-emerald-900/40 px-4 py-3 text-emerald-100">{success}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-semibold text-cyan-200">Anslutningskod</label>
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 font-mono text-lg tracking-widest"
            placeholder="ABC123"
          />
        </div>

        {!currentUser && (
          <div className="rounded border border-slate-600 bg-slate-900/60 p-4 space-y-3">
            <h2 className="text-lg font-semibold text-cyan-200">Delta som gäst</h2>
            <p className="text-sm text-gray-400">Ange ett alias (och valfri kontakt) för att delta anonymt.</p>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-200">Alias</label>
              <input
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
                className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                placeholder="Spelare 1"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-200">Kontakt (valfritt)</label>
              <input
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                placeholder="E-post eller telefon"
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          className="w-full rounded bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400"
        >
          Anslut till runda
        </button>
      </form>

      {/* Betalningsmodal */}
      <PaymentModal
        isOpen={showPayment}
        runName={runToJoin?.name || ''}
        amount={500} // 5 kr donation för att ansluta
        onSuccess={handlePaymentSuccess}
        onCancel={handlePaymentCancel}
        runId={runToJoin?.id}
        participantId={participantData?.userId}
        allowSkip={true}
      />
      </div>
    </div>
  );
};

export default JoinRunPage;
