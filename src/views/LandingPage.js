/**
 * Startsida där användaren väljer inloggningssätt för tipspromenaden.
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const initialGuestState = { alias: '', contact: '' };
const initialPlayerState = { name: '', email: '', password: '' };
const initialAdminState = { name: '', email: '', password: '' };

const LandingPage = () => {
  const navigate = useNavigate();
  const { currentUser, isAdmin, loginAsAdmin, loginAsGuest, loginAsRegistered, logout } = useAuth();
  const [guestForm, setGuestForm] = useState(initialGuestState);
  const [playerForm, setPlayerForm] = useState(initialPlayerState);
  const [adminForm, setAdminForm] = useState(initialAdminState);
  const [errors, setErrors] = useState({ guest: '', player: '', admin: '' });

  const setFieldError = (key, message) => setErrors((prev) => ({ ...prev, [key]: message }));

  /** Besvarar formuläret för anonym deltagare och skickar vidare till join-sidan. */
  const handleGuestSubmit = (event) => {
    event.preventDefault();
    if (!guestForm.alias.trim()) {
      setFieldError('guest', 'Ange ett alias för att fortsätta.');
      return;
    }
    setFieldError('guest', '');
    loginAsGuest(guestForm);
    setGuestForm(initialGuestState);
    navigate('/join');
  };

  /** Loggar in registrerad spelare. */
  const handlePlayerSubmit = async (event) => {
    event.preventDefault();
    if (!playerForm.email.trim() || !playerForm.password) {
      setFieldError('player', 'Fyll i e-post och lösenord.');
      return;
    }
    try {
      setFieldError('player', '');
      await loginAsRegistered(playerForm);
      setPlayerForm(initialPlayerState);
      navigate('/join');
    } catch (authError) {
      setFieldError('player', authError?.message || 'Kunde inte logga in som spelare.');
    }
  };

  /** Loggar in administratör och skickar till skapaflödet. */
  const handleAdminSubmit = async (event) => {
    event.preventDefault();
    if (!adminForm.email.trim() || !adminForm.password) {
      setFieldError('admin', 'Ange e-post och lösenord för administratörsinloggning.');
      return;
    }
    try {
      setFieldError('admin', '');
      await loginAsAdmin(adminForm);
      setAdminForm(initialAdminState);
      navigate('/admin/create');
    } catch (authError) {
      setFieldError('admin', authError?.message || 'Kunde inte logga in som administratör.');
    }
  };

  /** Loggar ut den aktuella användaren. */
  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">Tipspromenad 2.0</h1>
        <p className="text-gray-300">
          Välj hur du vill delta: som gäst, registrerad spelare eller administratör.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-3">
        <div className="rounded-lg border border-cyan-400/40 bg-slate-900/60 p-6">
          <h2 className="text-xl font-semibold mb-4">Snabbstarta som gäst</h2>
          <p className="text-sm text-gray-300 mb-4">Anslut med ett alias (och valfri kontaktuppgift) för att delta anonymt.</p>
          <form onSubmit={handleGuestSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-cyan-200">Alias</label>
              <input
                type="text"
                autoComplete="nickname"
                value={guestForm.alias}
                onChange={(event) => setGuestForm((prev) => ({ ...prev, alias: event.target.value }))}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                placeholder="Lag Lisa"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-cyan-200">Kontakt (valfritt)</label>
              <input
                type="text"
                autoComplete="email"
                value={guestForm.contact}
                onChange={(event) => setGuestForm((prev) => ({ ...prev, contact: event.target.value }))}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                placeholder="E-post eller telefon"
              />
            </div>
            {errors.guest && <p className="text-sm text-red-300">{errors.guest}</p>}
            <button
              type="submit"
              className="w-full rounded bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400"
            >
              Fortsätt till anslutning
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-emerald-400/40 bg-slate-900/60 p-6">
          <h2 className="text-xl font-semibold mb-4">Logga in som spelare</h2>
          <p className="text-sm text-gray-300 mb-4">Har du ett konto? Ange uppgifterna och fortsätt direkt.</p>
          <form onSubmit={handlePlayerSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-emerald-200">Namn (visas i spelet)</label>
              <input
                type="text"
                autoComplete="name"
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
                autoComplete="username"
                value={playerForm.email}
                onChange={(event) => setPlayerForm((prev) => ({ ...prev, email: event.target.value }))}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                placeholder="anna@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-emerald-200">Lösenord</label>
              <input
                type="password"
                autoComplete="current-password"
                value={playerForm.password}
                onChange={(event) => setPlayerForm((prev) => ({ ...prev, password: event.target.value }))}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                placeholder="********"
              />
            </div>
            {errors.player && <p className="text-sm text-red-300">{errors.player}</p>}
            <button
              type="submit"
              className="w-full rounded bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
            >
              Logga in och anslut
            </button>
          </form>
          <p className="mt-4 text-sm text-gray-300">
            Saknar du konto?{' '}
            <Link to="/register/player" className="text-emerald-300 hover:text-emerald-200">Registrera dig som spelare</Link>
          </p>
        </div>

        <div className="rounded-lg border border-indigo-400/40 bg-slate-900/70 p-6">
          <h2 className="text-xl font-semibold mb-4">Administratör</h2>
          {isAdmin ? (
            <div className="space-y-3">
              <p className="text-gray-200">Inloggad som <strong>{currentUser.name}</strong></p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/admin/my-runs')}
                  className="rounded bg-blue-500 px-4 py-2 font-semibold text-black hover:bg-blue-400"
                >
                  Mina rundor
                </button>
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
            <>
              <form onSubmit={handleAdminSubmit} className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-indigo-200">Namn</label>
                  <input
                    type="text"
                    autoComplete="name"
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
                    autoComplete="username"
                    value={adminForm.email}
                    onChange={(event) => setAdminForm((prev) => ({ ...prev, email: event.target.value }))}
                    className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                    placeholder="admin@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-indigo-200">Lösenord</label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={adminForm.password}
                    onChange={(event) => setAdminForm((prev) => ({ ...prev, password: event.target.value }))}
                    className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                    placeholder="********"
                  />
                </div>
                {errors.admin && <p className="text-sm text-red-300">{errors.admin}</p>}
                <button
                  type="submit"
                  className="w-full rounded bg-indigo-500 px-4 py-2 font-semibold text-black hover:bg-indigo-400"
                >
                  Logga in som administratör
                </button>
              </form>
              <p className="mt-4 text-sm text-gray-300">
                Ny administratör?{' '}
                <Link to="/register/admin" className="text-indigo-300 hover:text-indigo-200">Registrera konto här</Link>
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default LandingPage;


