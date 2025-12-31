/**
 * VerifyEmailPage - Bekräfta e-post och sätt lösenord
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import { useAuth } from '../context/AuthContext';

const VerifyEmailPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { completeRegistration } = useAuth();
  const [status, setStatus] = useState('Laddar...');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const token = searchParams.get('token') || '';

  useEffect(() => {
    if (!token) {
      setStatus('Ogiltig verifieringslänk.');
      return;
    }

    const verify = async () => {
      try {
        const response = await fetch('/api/auth/verifyEmail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Verifieringen misslyckades.');
        }
        setEmail(data.email || '');
        setName(data.name || '');
        setStatus('ok');
      } catch (verifyError) {
        setStatus(verifyError.message || 'Verifieringen misslyckades.');
      }
    };

    verify();
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!password || password.length < 8) {
      setError('Lösenordet måste vara minst 8 tecken.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Lösenorden matchar inte.');
      return;
    }

    setIsSubmitting(true);
    try {
      await completeRegistration({ token, password });
      navigate('/?welcome=1');
    } catch (submitError) {
      setError(submitError?.message || 'Kunde inte slutföra registreringen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <Header />
      <div className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-8">
          <h1 className="text-2xl font-bold mb-6 text-center">Bekräfta e-post</h1>

          {status !== 'ok' ? (
            <div className="text-sm text-gray-300">{status}</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-sm text-gray-300">
                Bekräftar <span className="font-semibold text-white">{email}</span> {name ? `(${name})` : ''}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-200 mb-1">Lösenord *</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                  placeholder="********"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-200 mb-1">Bekräfta lösenord *</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
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
                disabled={isSubmitting}
                className="w-full rounded-lg px-4 py-3 font-semibold transition-colors bg-cyan-500 hover:bg-cyan-400 text-black disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Sparar...' : 'Sätt lösenord'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
