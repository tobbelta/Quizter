/**
 * AboutDialog - Om-dialog med information om Quizter
 *
 * Props:
 * - isOpen: boolean - om dialogen ska visas
 * - onClose: function - callback när dialogen stängs
 */
import React, { useEffect, useState } from 'react';
import PaymentModal from '../payment/PaymentModal';
import FeedbackDialog from './FeedbackDialog';
import MessageDialog from './MessageDialog';
import { paymentService } from '../../services/paymentService';

const AboutDialog = ({ isOpen, onClose }) => {
  const [showDonation, setShowDonation] = useState(false);
  const [donationAmount, setDonationAmount] = useState(2000);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [paymentConfig, setPaymentConfig] = useState(null);

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

  if (!isOpen) return null;

  const donationEnabled = Boolean(
    paymentConfig?.paymentsEnabled
    && paymentConfig?.donations?.enabled
    && paymentConfig?.donations?.placements?.menu
  );
  const donationCurrency = paymentConfig?.currency || 'sek';
  const donationAmounts = Array.isArray(paymentConfig?.donations?.amounts)
    ? paymentConfig.donations.amounts
    : [];
  const formatDonation = (value) => `${(Number(value || 0) / 100).toFixed(2)} ${donationCurrency.toUpperCase()}`;

  const handleDonateClick = () => {
    setShowDonation(true);
  };

  const handleBackdropClick = (e) => {
    // Stäng endast om man klickar på backdrop (inte på dialogen själv)
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop and Dialog */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 z-[1200] overflow-y-auto pt-20"
        onClick={handleBackdropClick}
      >
        {/* Dialog */}
        <div
          className="bg-slate-900 rounded-xl shadow-2xl border border-purple-500/40 max-w-2xl w-full mb-8"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-slate-900 border-b border-slate-700 p-6 flex items-center justify-between rounded-t-xl">
            <div className="flex items-center gap-3">
              <img src="/logo-compass.svg" alt="Quizter" className="w-10 h-10" />
              <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
                Om Quizter
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 transition-colors p-2 hover:bg-slate-800 rounded-lg flex-shrink-0"
              aria-label="Stäng"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6 text-gray-300">
            {/* Version */}
            <div className="text-sm text-gray-500">
              Version {require('../../../package.json').version}
            </div>

            {/* Beskrivning */}
            <section>
              <h3 className="text-lg font-semibold text-cyan-400 mb-2">
                Vad är Quizter?
              </h3>
              <p className="leading-relaxed">
                Quizter är en plattform för att skapa och spela interaktiva tipspromenader.
                Skapa spännande rutter med frågor och utmaningar, eller delta i redan skapade äventyr!
              </p>
            </section>

            {/* Instruktioner */}
            <section>
              <button
                onClick={() => setShowInstructions(!showInstructions)}
                className="w-full flex items-center justify-between text-lg font-semibold text-cyan-400 hover:text-cyan-300 transition-colors mb-3"
              >
                <span>Så här fungerar det</span>
                <svg
                  className={`w-5 h-5 transition-transform ${showInstructions ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showInstructions && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-indigo-300 mb-1">
                      🗺️ Skapa en runda
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>Klicka på kartan för att markera start och slut</li>
                      <li>Välj svårighetsgrad och antal frågor</li>
                      <li>En rutt genereras automatiskt med frågor längs vägen</li>
                      <li>Dela QR-koden eller länken med deltagare</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-indigo-300 mb-1">
                      🎮 Spela en runda
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>Skanna QR-koden eller öppna länken</li>
                      <li>Ange ditt namn och välj språk (svenska eller engelska)</li>
                      <li>Följ rutten på kartan och besvara frågorna</li>
                      <li>Se dina resultat och jämför med andra deltagare</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-indigo-300 mb-1">
                      👤 Mina rundor
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>Se alla rundor du skapat och deltagit i</li>
                      <li>Följ deltagarnas framsteg i realtid</li>
                      <li>Avsluta rundor och se slutresultat</li>
                      <li>Logga in för att synka mellan enheter</li>
                    </ul>
                  </div>
                </div>
              )}
            </section>

            {/* Donation */}
            {donationEnabled && (
              <section className="bg-gradient-to-r from-purple-500/10 to-indigo-500/10 rounded-lg p-4 border border-purple-500/20 space-y-3">
                <h3 className="text-lg font-semibold text-cyan-400">Stöd Quizter</h3>
                <p className="text-sm leading-relaxed">
                  Quizter är gratis att använda! Om du tycker om tjänsten kan du stödja utvecklingen med en donation.
                </p>
                {donationAmounts.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {donationAmounts.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setDonationAmount(value)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                          donationAmount === value
                            ? 'bg-cyan-500 text-black'
                            : 'bg-slate-800 text-cyan-100 hover:bg-slate-700'
                        }`}
                      >
                        {formatDonation(value)}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={Number.isFinite(Number(donationAmount)) ? donationAmount / 100 : 0}
                    onChange={(event) => {
                      const value = Math.max(0, Number(event.target.value) || 0);
                      setDonationAmount(Math.round(value * 100));
                    }}
                    className="w-28 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                  <span className="text-gray-400">{donationCurrency.toUpperCase()}</span>
                  <button
                    onClick={handleDonateClick}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-all shadow-lg"
                  >
                    Donera {formatDonation(donationAmount)}
                  </button>
                </div>
              </section>
            )}

            {/* Kontakt & Feedback */}
            <section>
              <h3 className="text-lg font-semibold text-cyan-400 mb-3">
                Kontakta oss
              </h3>
              <div className="space-y-3">
                <button
                  onClick={() => setShowFeedback(true)}
                  className="w-full bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-700 hover:to-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Ge feedback / Kontakta oss
                </button>
                <div className="flex items-center gap-2 text-sm text-gray-400 justify-center">
                  <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  <a href="https://www.Quizter.se" target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200 transition-colors">
                    www.Quizter.se
                  </a>
                </div>
              </div>
            </section>

            {/* Footer */}
            <div className="text-center text-sm text-gray-500 pt-4 border-t border-slate-700">
              <p className="mb-2">© 2025 Quizter. Skapad med ❤️ för äventyrslystna själar.</p>
              <div className="flex justify-center gap-4 text-xs">
                <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 transition-colors">
                  Integritetspolicy
                </a>
                <span className="text-gray-600">|</span>
                <a href="/terms-of-service.html" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 transition-colors">
                  Användarvillkor
                </a>
              </div>
            </div>

            {/* Stäng-knapp längst ner */}
            <div className="mt-6">
              <button
                onClick={onClose}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                Stäng
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showDonation && (
        <PaymentModal
          isOpen={showDonation}
          title="Stöd Quizter"
          description="Tack för att du vill stödja Quizter."
          purpose="donation"
          amount={donationAmount}
          currency={donationCurrency}
          allowSkip={true}
          context={{ context: 'menu' }}
          onSuccess={(paymentResult) => {
            setShowDonation(false);
            if (!paymentResult.skipped) {
              setDialogConfig({
                isOpen: true,
                title: 'Tack för din donation!',
                message: 'Tack för din donation! 💚',
                type: 'success'
              });
            }
          }}
          onCancel={() => setShowDonation(false)}
        />
      )}

      {/* Feedback Dialog */}
      <FeedbackDialog
        isOpen={showFeedback}
        onClose={() => setShowFeedback(false)}
      />

      <MessageDialog
        isOpen={dialogConfig.isOpen}
        onClose={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
      />
    </>
  );
};

export default AboutDialog;
