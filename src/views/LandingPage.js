import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const initialAliasState = { alias: '', contact: '' };
const initialAdminState = { name: '', email: '' };

const LandingPage = () => {
  const navigate = useNavigate();
  const { currentUser, isAdmin, loginAsAdmin, loginAsGuest, loginAsRegistered, logout } = useAuth();
  const [aliasForm, setAliasForm] = useState(initialAliasState);
  const [adminForm, setAdminForm] = useState(initialAdminState);
  const [playerForm, setPlayerForm] = useState({ name: '', email: '' });
  const [error, setError] = useState('');

  const handleAliasSubmit = (event) => {
    event.preventDefault();
    if (!aliasForm.alias.trim()) {
      setError('Ange ett alias för att fortsätta.');
      return;
    }
    loginAsGuest(aliasForm);
    setAliasForm(initialAliasState);
    navigate('/join');
  };

  const handleAdminSubmit = (event) => {
    event.preventDefault();
    if (!adminForm.email.trim()) {
      setError('Ange en e-postadress för administratörsinloggning.');
      return;
    }
    loginAsAdmin(adminForm);
    setAdminForm(initialAdminState);
    navigate('/admin/create');
  };

  const handlePlayerLogin = (event) => {
    event.preventDefault();
    if (!playerForm.name.trim() || !playerForm.email.trim()) {
      setError('Fyll i namn och e-post för deltagarlogin.');
      return;
    }
    loginAsRegistered(playerForm);
    setPlayerForm({ name: '', email: '' });
    navigate('/join');
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-center mb-2">Tipspromenad 2.0</h1>
        <p className="text-center text-gray-300">Skapa, generera eller delta i tipspromenader direkt i mobilen.</p>
      </header>

      {error && (
        <div className="mb-4 rounded bg-red-900/40 border border-red-500 px-4 py-3 text-red-200">
          {error}
        </div>
      )}

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-cyan-400/40 bg-slate-900/60 p-6">
          <h2 className="text-xl font-semibold mb-4">Snabbstarta som gäst</h2>
          <p className="text-sm text-gray-300 mb-4">Anslut med ett alias (och valfri kontaktuppgift) för att delta anonymt.</p>
          <form onSubmit={handleAliasSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-cyan-200">Alias</label>
              <input
                type="text"
                value={aliasForm.alias}
                onChange={(event) => setAliasForm((prev) => ({ ...prev, alias: event.target.value }))}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                placeholder="Lag Lisa"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-cyan-200">Kontakt (valfritt)</label>
              <input
                type="text"
                value={aliasForm.contact}
                onChange={(event) => setAliasForm((prev) => ({ ...prev, contact: event.target.value }))}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                placeholder="E-post eller telefon"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400"
            >
              Fortsätt till anslutning
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-emerald-400/40 bg-slate-900/60 p-6">
          <h2 className="text-xl font-semibold mb-4">Logga in som deltagare</h2>
          <p className="text-sm text-gray-300 mb-4">Spara din historik genom att logga in med namn och e-post.</p>
          <form onSubmit={handlePlayerLogin} className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-emerald-200">Namn</label>
              <input
                type="text"
                value={playerForm.name}
                onChange={(event) => setPlayerForm((prev) => ({ ...prev, name: event.target.value }))}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                placeholder="Anna Andersson"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-emerald-200">E-post</label>
              <input
                type="email"
                value={playerForm.email}
                onChange={(event) => setPlayerForm((prev) => ({ ...prev, email: event.target.value }))}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                placeholder="anna@example.com"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
            >
              Logga in och anslut
            </button>
          </form>
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-indigo-400/40 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold mb-4">Administratör</h2>
        {isAdmin ? (
          <div className="space-y-3">
            <p className="text-gray-200">Inloggad som <strong>{currentUser.name}</strong></p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate('/admin/create')}
                className="rounded bg-indigo-500 px-4 py-2 font-semibold text-black hover:bg-indigo-400"
              >
                Skapa ny runda
              </button>
              <button
                type="button"
                onClick={() => navigate('/generate')}
                className="rounded bg-purple-500 px-4 py-2 font-semibold text-black hover:bg-purple-400"
              >
                Generera runda på plats
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded bg-slate-700 px-4 py-2 font-semibold text-gray-200 hover:bg-slate-600"
              >
                Logga ut
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleAdminSubmit} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-indigo-200">Namn</label>
                <input
                  type="text"
                  value={adminForm.name}
                  onChange={(event) => setAdminForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                  placeholder="Admin"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-indigo-200">E-post</label>
                <input
                  type="email"
                  value={adminForm.email}
                  onChange={(event) => setAdminForm((prev) => ({ ...prev, email: event.target.value }))}
                  className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                  placeholder="admin@example.com"
                />
              </div>
            </div>
            <button
              type="submit"
              className="rounded bg-indigo-500 px-4 py-2 font-semibold text-black hover:bg-indigo-400"
            >
              Logga in som administratör
            </button>
          </form>
        )}
      </section>
    </div>
  );
};

export default LandingPage;
