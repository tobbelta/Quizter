/**
 * AboutDialog - Om-dialog med information om RouteQuest
 *
 * Props:
 * - isOpen: boolean - om dialogen ska visas
 * - onClose: function - callback när dialogen stängs
 */
import React, { useState } from 'react';
import PaymentModal from '../payment/PaymentModal';

const AboutDialog = ({ isOpen, onClose }) => {
  const [showDonation, setShowDonation] = useState(false);
  const [donationAmount, setDonationAmount] = useState(50);
  const [showInstructions, setShowInstructions] = useState(false);

  if (!isOpen) return null;

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
              <img src="/logo-compass.svg" alt="RouteQuest" className="w-10 h-10" />
              <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
                Om RouteQuest
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
                Vad är RouteQuest?
              </h3>
              <p className="leading-relaxed">
                RouteQuest är en plattform för att skapa och spela interaktiva tipspromenader.
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
            <section className="bg-gradient-to-r from-purple-500/10 to-indigo-500/10 rounded-lg p-4 border border-purple-500/20">
              <h3 className="text-lg font-semibold text-cyan-400 mb-2">
                Stöd RouteQuest
              </h3>
              <p className="text-sm mb-3 leading-relaxed">
                RouteQuest är gratis att använda! Om du tycker om tjänsten kan du stödja utvecklingen med en donation.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="10"
                  step="10"
                  value={donationAmount}
                  onChange={(e) => setDonationAmount(parseInt(e.target.value) || 50)}
                  className="w-24 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                />
                <span className="text-gray-400">SEK</span>
                <button
                  onClick={handleDonateClick}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-all shadow-lg"
                >
                  Donera
                </button>
              </div>
            </section>

            {/* Kontakt */}
            <section>
              <h3 className="text-lg font-semibold text-cyan-400 mb-2">
                Kontakta oss
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <a href="mailto:info@routequest.se" className="text-cyan-300 hover:text-cyan-200 transition-colors">
                    info@routequest.se
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  <a href="https://www.routequest.se" target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200 transition-colors">
                    www.routequest.se
                  </a>
                </div>
              </div>
            </section>

            {/* Footer */}
            <div className="text-center text-sm text-gray-500 pt-4 border-t border-slate-700">
              <p className="mb-2">© 2025 RouteQuest. Skapad med ❤️ för äventyrslystna själar.</p>
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
          runId="donation"
          participantId="donation"
          amount={donationAmount}
          onSuccess={() => {
            setShowDonation(false);
            alert('Tack för din donation! 💚');
          }}
          onCancel={() => setShowDonation(false)}
        />
      )}
    </>
  );
};

export default AboutDialog;
