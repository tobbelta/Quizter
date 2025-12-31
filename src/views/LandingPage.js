/**
 * Första sidan användare möter – fokuserar på CTA för att skapa/ansluta rundor
 * och förklarar kort hur Quizter fungerar.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import PaymentModal from '../components/payment/PaymentModal';
import { paymentService } from '../services/paymentService';

const LandingPage = () => {
  const navigate = useNavigate();
  const [isBetaExpanded, setIsBetaExpanded] = useState(false);
  const [searchParams] = useSearchParams();
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [donationAmount, setDonationAmount] = useState(2000);

  const handleStartRun = () => {
    navigate('/join');
  };

  const handleCreateRun = () => {
    navigate('/generate');
  };

  useEffect(() => {
    let isActive = true;
    paymentService.getPaymentConfig().then((config) => {
      if (!isActive) return;
      setPaymentConfig(config);
      const amounts = config?.donations?.amounts;
      if (Array.isArray(amounts) && amounts.length > 0) {
        setDonationAmount(amounts[0]);
      }
    });
    return () => {
      isActive = false;
    };
  }, []);

  const showWelcome = searchParams.get('welcome') === '1';
  const donationEnabled = Boolean(
    paymentConfig?.paymentsEnabled
    && paymentConfig?.donations?.enabled
    && paymentConfig?.donations?.placements?.landing
  );
  const donationCurrency = paymentConfig?.currency || 'sek';
  const donationAmounts = Array.isArray(paymentConfig?.donations?.amounts)
    ? paymentConfig.donations.amounts
    : [];
  const formatDonation = (value) => `${(Number(value || 0) / 100).toFixed(2)} ${donationCurrency.toUpperCase()}`;

  return (
    <PageLayout headerTitle="Quizter" maxWidth="max-w-3xl" className="space-y-8">
      <section className="space-y-6 text-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-slate-100 sm:text-4xl">
            Välkommen till Quizter
          </h1>
          <p className="text-base text-gray-300 sm:text-lg">
            Skapa och spela digitala tipsrundor direkt i mobilen
          </p>
        </div>
      </section>

      {showWelcome && (
        <section className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-6 text-left">
          <h2 className="text-xl font-semibold text-cyan-200">Välkommen! Kom igång på 1 minut</h2>
          <ol className="mt-4 space-y-3 text-sm text-gray-200">
            <li>
              <span className="font-semibold text-cyan-300">1.</span>{' '}
              Skapa en runda eller anslut med kod.
            </li>
            <li>
              <span className="font-semibold text-cyan-300">2.</span>{' '}
              Tillåt GPS när du spelar, så får du checkpoints och karta.
            </li>
            <li>
              <span className="font-semibold text-cyan-300">3.</span>{' '}
              Dela QR/kod så att fler kan hoppa in.
            </li>
          </ol>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleCreateRun}
              className="flex-1 rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400"
            >
              Skapa runda
            </button>
            <button
              type="button"
              onClick={handleStartRun}
              className="flex-1 rounded-lg border border-cyan-400/40 bg-slate-900/70 px-4 py-2 font-semibold text-cyan-100 hover:border-cyan-300"
            >
              Anslut till runda
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5">
        <button
          type="button"
          onClick={() => setIsBetaExpanded(!isBetaExpanded)}
          aria-expanded={isBetaExpanded}
          className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-amber-500/10 sm:px-6"
        >
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="text-xl">🚧</span>
            <div>
              <h2 className="text-base font-semibold text-amber-200 sm:text-lg">Quizter är i beta</h2>
              <p className="text-xs text-amber-100/80 sm:text-sm">Vi slipar upplevelsen och välkomnar din feedback.</p>
            </div>
          </div>
          <span aria-hidden="true" className={`text-amber-200 transition-transform ${isBetaExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>
        {isBetaExpanded && (
          <div className="space-y-3 border-t border-amber-500/20 px-4 py-4 text-sm text-amber-50 sm:px-6">
            <p>
              Quizter är under aktiv utveckling. Hör gärna av dig om du saknar funktioner eller
              hittar problem – varje synpunkt hjälper oss framåt.
            </p>
            <p>
              Donationer går direkt till drift och vidareutveckling. Är du inte nöjd? Mejla oss på
              {' '}
              <a href="mailto:info@quizter.se" className="text-cyan-300 underline hover:text-cyan-200">
                info@quizter.se
              </a>{' '}så hittar vi en lösning.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-6 text-center">

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleCreateRun}
            className="group flex flex-col items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-8 transition-all hover:border-cyan-400 hover:bg-slate-800/70"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-100 shadow-inner shadow-cyan-500/20 transition-colors group-hover:bg-cyan-500/30 group-hover:text-white">
              <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" d="M9 20.25l-5.25-2.1a1 1 0 01-.6-.92V4.77c0-.69.7-1.18 1.35-.92L9 5.75m0 0l6-2.25m-6 2.25v14.5m6-16.75l5.25 2.25c.45.19.75.63.75 1.12v12.46c0 .69-.7 1.18-1.35.92L15 17.75m0 0l-6 2.5" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" d="M14.75 8.75h4M16.75 6.75v4" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-100">Skapa runda</h2>
              <p className="mt-2 text-sm text-gray-400">
                Generera en ny tipspromenad automatiskt
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={handleStartRun}
            className="group flex flex-col items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-8 transition-all hover:border-purple-400 hover:bg-slate-800/70"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-purple-500/20 text-purple-100 shadow-inner shadow-purple-500/20 transition-colors group-hover:bg-purple-500/30 group-hover:text-white">
              <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" d="M18 9v3m1.5-1.5h-3M16.5 16.5a4.5 4.5 0 00-9 0m9-8.25a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" d="M9 16.5v-.75a2.25 2.25 0 012.25-2.25h.5A2.25 2.25 0 0114 15.75v.75" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-100">Anslut till runda</h2>
              <p className="mt-2 text-sm text-gray-400">
                Ange kod för att gå med i en befintlig runda
              </p>
            </div>
          </button>
        </div>
      </section>

      <section className="space-y-6 text-center">
        <h2 className="text-2xl font-semibold text-slate-100">Så fungerar det</h2>
        <div className="grid gap-4 text-left sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
            <div className="mb-3 text-3xl">📍</div>
            <h3 className="text-lg font-semibold text-slate-100">Automatisk ruttplanering</h3>
            <p className="mt-2 text-sm text-gray-400">
              Ange längd och svårighetsgrad så skapar vi en rutt med frågor automatiskt
            </p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
            <div className="mb-3 text-3xl">🗺️</div>
            <h3 className="text-lg font-semibold text-slate-100">Kartnavigering</h3>
            <p className="mt-2 text-sm text-gray-400">
              Följ kartan till varje kontrollpunkt och svara på frågor längs vägen
            </p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
            <div className="mb-3 text-3xl">🏆</div>
            <h3 className="text-lg font-semibold text-slate-100">Live resultat</h3>
            <p className="mt-2 text-sm text-gray-400">
              Följ poängen i realtid och se vem som ligger bäst till
            </p>
          </div>
        </div>
      </section>

      {donationEnabled && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-900/10 p-6 space-y-4 text-center">
          <div>
            <h2 className="text-xl font-semibold text-emerald-200">Stöd Quizter</h2>
            <p className="mt-2 text-sm text-gray-300">
              Donera valfritt belopp för att stötta drift och vidareutveckling.
            </p>
          </div>
          {donationAmounts.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {donationAmounts.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDonationAmount(value)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    donationAmount === value
                      ? 'bg-emerald-500 text-black'
                      : 'bg-slate-800 text-emerald-100 hover:bg-slate-700'
                  }`}
                >
                  {formatDonation(value)}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
            <input
              type="number"
              min="0"
              value={Number.isFinite(Number(donationAmount)) ? donationAmount / 100 : 0}
              onChange={(event) => {
                const value = Math.max(0, Number(event.target.value) || 0);
                setDonationAmount(Math.round(value * 100));
              }}
              className="w-32 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:border-emerald-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowDonationModal(true)}
              className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
            >
              Donera {formatDonation(donationAmount)}
            </button>
          </div>
        </section>
      )}

      <section className="space-y-4 text-center">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
          <h2 className="text-xl font-semibold text-slate-100">Perfekt för alla tillfällen</h2>
          <p className="mt-3 text-gray-300">
            Använd Quizter för teambuilding, familjeaktiviteter, skolprojekt eller bara för att göra
            en promenad mer engagerande. Ingen installation behövs – allt fungerar direkt i webbläsaren.
          </p>
        </div>
        {!isAuthenticated && (
          <p className="text-sm text-gray-400">
            Kör som gäst eller skapa konto för att spara rundor mellan enheter
          </p>
        )}
      </section>

      <PaymentModal
        isOpen={showDonationModal}
        title="Stöd Quizter"
        description="Tack för att du vill stödja Quizter."
        purpose="donation"
        amount={donationAmount}
        currency={donationCurrency}
        allowSkip={true}
        context={{ context: 'landing' }}
        onSuccess={() => setShowDonationModal(false)}
        onCancel={() => setShowDonationModal(false)}
      />

    </PageLayout>
  );
};

export default LandingPage;
