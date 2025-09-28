/**
 * Vy där spelare ansluter med en join-kod eller QR-länk.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRun } from '../context/RunContext';

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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const codeParam = params.get('code');
    if (codeParam) {
      setJoinCode(codeParam.toUpperCase());
    }
  }, [location.search]);


  const handleJoin = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setError('Ange en giltig anslutningskod.');
      return;
    }

    let participantUser = currentUser;
    if (!participantUser) {
      if (!alias.trim()) {
        setError('Ange ett alias för att delta.');
        return;
      }
      participantUser = loginAsGuest({ alias, contact });
    }

    try {
      const { run } = await joinRunByCode(code, {
        userId: participantUser?.isAnonymous ? null : participantUser?.id,
        alias: participantUser?.name,
        contact: participantUser?.contact,
        isAnonymous: participantUser?.isAnonymous
      });
      setSuccess(`Du är ansluten till ${run.name}!`);
      setTimeout(() => {
        navigate(`/run/${run.id}/play`);
      }, 600);
    } catch (joinError) {
      setError(joinError.message);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold mb-2">Anslut till runda</h1>
        <p className="text-gray-300">Ange anslutningskod från QR eller inbjudan.</p>
      </header>

      {error && <div className="rounded border border-red-500 bg-red-900/40 px-4 py-3 text-red-200">{error}</div>}
      {success && <div className="rounded border border-emerald-500 bg-emerald-900/40 px-4 py-3 text-emerald-100">{success}</div>}

      <form onSubmit={handleJoin} className="space-y-4">
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
    </div>
  );
};

export default JoinRunPage;

