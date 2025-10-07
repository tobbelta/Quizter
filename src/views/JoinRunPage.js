/**
 * Vy där spelare ansluter med en kod eller via QR-länk.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRun } from '../context/RunContext';
import { localStorageService } from '../services/localStorageService';
import { analyticsService } from '../services/analyticsService';
import { userPreferencesService } from '../services/userPreferencesService';
import PageLayout from '../components/layout/PageLayout';

const JoinRunPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, loginAsGuest, isAuthInitialized } = useAuth();
  const { joinRunByCode } = useRun();

  const [joinCode, setJoinCode] = useState('');
  const initialAlias = useMemo(() => userPreferencesService.getAlias() || '', []);
  const [alias, setAlias] = useState(initialAlias);
  const [aliasCommitted, setAliasCommitted] = useState(() => Boolean(initialAlias.trim()));
  const [contact, setContact] = useState(() => userPreferencesService.getContact());
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleJoin = useCallback(async (code) => {
    setError('');
    setSuccess('');

    const upperCode = code.trim().toUpperCase();
    if (upperCode.length < 4) {
      setError('Ange en giltig anslutningskod.');
      return;
    }

    // För anonyma användare, kontrollera att alias finns
    if (currentUser?.isAnonymous && !alias.trim()) {
      setError('Ange ett alias för att delta.');
      return;
    }

    // Om användaren är anonym och har angivit alias, uppdatera profilen
    let participantUser = currentUser;
    if (currentUser?.isAnonymous && alias.trim()) {
      const cleanAlias = alias.trim();
      userPreferencesService.saveAlias(cleanAlias);
      setAlias(cleanAlias);
      setAliasCommitted(true);
      if (contact) {
        userPreferencesService.saveContact(contact);
      }
      // Uppdatera den anonyma användarens profil
      participantUser = await loginAsGuest({ alias: cleanAlias, contact });
    }

    try {
      const { run } = await joinRunByCode(upperCode, {
        userId: participantUser?.isAnonymous ? null : participantUser?.id,
        alias: participantUser?.name,
        contact: participantUser?.contact,
        isAnonymous: participantUser?.isAnonymous,
      });

      const participantDetails = {
        userId: participantUser?.isAnonymous ? null : participantUser?.id,
        alias: participantUser?.name,
        contact: participantUser?.contact,
        isAnonymous: participantUser?.isAnonymous,
      };

      if (!currentUser || currentUser.isAnonymous) {
        localStorageService.addJoinedRun(run, participantDetails);
      }

      analyticsService.logVisit('join_run', {
        runId: run.id,
        runName: run.name,
      });

      setSuccess(`Du är nu ansluten till ${run.name}!`);

      setTimeout(() => {
        navigate(`/run/${run.id}/play`);
      }, 600);
    } catch (joinError) {
      setError(joinError.message);
    }
  }, [currentUser, alias, contact, loginAsGuest, joinRunByCode, navigate]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleStorage = (event) => {
      if (!event.key || event.key === 'geoquest:preferences') {
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
        console.log('[JoinRunPage] Inloggad användare, ansluter direkt med kod:', upperCode);
        handleJoin(upperCode);
      }
      // Om användaren är anonym men har sparat alias, anslut direkt
      else if (currentUser?.isAnonymous && aliasCommitted) {
        console.log('[JoinRunPage] Anonym användare med sparat alias, ansluter direkt med kod:', upperCode);
        handleJoin(upperCode);
      }
      else {
        console.log('[JoinRunPage] Kod förifylld från URL:', upperCode);
      }
    }
  }, [location.search, currentUser, isAuthInitialized, aliasCommitted, handleJoin]);

  const handleSubmit = (event) => {
    event.preventDefault();
    handleJoin(joinCode);
  };

  const localInfo = currentUser?.isAnonymous ? localStorageService.getJoinedRuns() : [];

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

        {currentUser?.isAnonymous && !aliasCommitted && (
          <div className="space-y-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
            <div>
              <h2 className="text-base font-semibold text-cyan-200">Ditt alias</h2>
              <p className="text-xs text-gray-400">
                {alias ? 'Detta alias sparas på din enhet och används vid framtida anslutningar.' : 'Ange ett alias för att delta.'}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-200">Alias</label>
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
        {currentUser?.isAnonymous && aliasCommitted && (
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
    </PageLayout>
  );
};

export default JoinRunPage;



