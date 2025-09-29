/**
 * Sida för att skapa ett administratörskonto.
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const initialFormState = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  contact: ''
};

const RegisterAdminPage = () => {
  const navigate = useNavigate();
  const { registerAdmin, usesFirebaseAuth } = useAuth();
  const [formState, setFormState] = useState(initialFormState);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  /** Försöker skapa administratörskontot och skickar användaren vidare. */
  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (usesFirebaseAuth && formState.password !== formState.confirmPassword) {
      setError('Lösenorden måste stämma överens.');
      return;
    }

    setIsSubmitting(true);
    try {
      await registerAdmin(formState);
      setFormState(initialFormState);
      navigate('/admin/create');
    } catch (submitError) {
      setError(submitError?.message || 'Det gick inte att skapa administratörskontot.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-bold mb-2">Registrera administratör</h1>
        <p className="text-gray-300">
          Administratörer kan skapa rundor, analysera resultat och bjuda in deltagare.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-indigo-400/40 bg-slate-900/70 p-6">
        <div>
          <label className="block text-sm font-semibold text-indigo-200">Namn</label>
          <input
            type="text"
            autoComplete="name"
            value={formState.name}
            onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
            className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
            placeholder="Tobias Nilsson"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-indigo-200">E-post</label>
          <input
            type="email"
            autoComplete="email"
            value={formState.email}
            onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
            className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
            placeholder="admin@example.com"
            required={usesFirebaseAuth}
          />
          {!usesFirebaseAuth && (
            <p className="mt-1 text-xs text-gray-400">E-post är valfritt i offline-läge.</p>
          )}
        </div>

        {usesFirebaseAuth && (
          <>
            <div>
              <label className="block text-sm font-semibold text-indigo-200">Lösenord</label>
              <input
                type="password"
                autoComplete="new-password"
                value={formState.password}
                onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                placeholder="Minst 6 tecken"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-indigo-200">Bekräfta lösenord</label>
              <input
                type="password"
                autoComplete="new-password"
                value={formState.confirmPassword}
                onChange={(event) => setFormState((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                placeholder="Upprepa lösenordet"
                required
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-semibold text-indigo-200">Kontaktuppgift (valfritt)</label>
          <input
            type="text"
            autoComplete="tel"
            value={formState.contact}
            onChange={(event) => setFormState((prev) => ({ ...prev, contact: event.target.value }))}
            className="mt-1 w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
            placeholder="Telefon eller e-post"
          />
        </div>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-indigo-500 px-4 py-2 font-semibold text-black hover:bg-indigo-400 disabled:opacity-60"
        >
          {isSubmitting ? 'Registrerar...' : 'Skapa administratörskonto'}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-gray-300">
        <p>
          Har du redan ett konto?{' '}
          <Link to="/" className="text-indigo-300 hover:text-indigo-200">Gå tillbaka till inloggning</Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterAdminPage;
