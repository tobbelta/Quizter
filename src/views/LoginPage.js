/**
 * Login-sida för både spelare och administratörer
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/layout/Header';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!email.trim() || !password) {
      setError('Fyll i e-post och lösenord.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await login({ email, password });
      navigate('/');
    } catch (authError) {
      setError(authError?.message || 'Kunde inte logga in. Kontrollera dina uppgifter.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <Header />

      <div className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-8">
          <h1 className="text-2xl font-bold mb-6 text-center">Logga in</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-1">
                E-post
              </label>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                placeholder="din@epost.se"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-1">
                Lösenord
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                placeholder="********"
                required
              />
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg px-4 py-3 font-semibold transition-colors bg-cyan-500 hover:bg-cyan-400 text-black disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Loggar in...' : 'Logga in'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-300">
              Har du inget konto?{' '}
              <Link
                to="/register"
                className="text-cyan-300 hover:text-cyan-200"
              >
                Registrera dig här
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
