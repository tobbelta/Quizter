/**
 * Mobiloptimerad administrationsvy med hamburger-meny och live-status.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRun } from '../context/RunContext';
import { questionService } from '../services/questionService';
import { describeParticipantStatus } from '../utils/participantStatus';
import QRCodeDisplay from '../components/shared/QRCodeDisplay';
import RunMap from '../components/run/RunMap';
import { buildJoinLink } from '../utils/joinLink';

const RunAdminPage = () => {
  const { runId } = useParams();
  const navigate = useNavigate();
  const { currentRun, participants, loadRunById, refreshParticipants, closeRun, updateRun } = useRun();
  const [saveStatus, setSaveStatus] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    if (!currentRun || currentRun.id !== runId) {
      loadRunById(runId).catch((error) => console.warn('Kunde inte ladda runda', error));
    }
  }, [currentRun, loadRunById, runId]);

  useEffect(() => {
    refreshParticipants().catch((error) => console.warn('Kunde inte uppdatera deltagare', error));
  }, [refreshParticipants]);

  // Slå upp frågetexterna en gång så att tabellen blir snabb.
  const questionMap = useMemo(() => {
    if (!currentRun) return {};
    return currentRun.questionIds.reduce((acc, questionId) => {
      const question = questionService.getById(questionId);
      if (question) acc[questionId] = question;
      return acc;
    }, {});
  }, [currentRun]);

  // Stäng menyer vid ESC
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setShowMap(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  if (!currentRun) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-center">
        <p className="text-gray-300">Hämtar rundainformation...</p>
      </div>
    );
  }

  // Sorterar deltagarna så att toppresultatet visas först.
  const rankedParticipants = [...participants].sort((a, b) => b.score - a.score);
  const joinLink = buildJoinLink(currentRun.joinCode);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Mobiloptimerad header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{currentRun.name}</h1>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span>Kod: <span className="font-mono text-cyan-300">{currentRun.joinCode}</span></span>
              <span className="capitalize">{currentRun.status}</span>
            </div>
          </div>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded hover:bg-slate-700 transition-colors ml-3"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* Hamburger-meny */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/50"
            onClick={() => setMenuOpen(false)}
          />
          <div className="w-80 bg-slate-900 h-full overflow-y-auto">
            <div className="p-4 border-b border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Administratörsmeny</h2>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="p-1 rounded hover:bg-slate-700"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Snabbknappar */}
              <div className="space-y-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(currentRun.joinCode);
                    setMenuOpen(false);
                  }}
                  className="w-full rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-black hover:bg-cyan-400 text-left"
                >
                  📋 Kopiera anslutningskod
                </button>

                <button
                  onClick={() => {
                    setShowMap(true);
                    setMenuOpen(false);
                  }}
                  className="w-full rounded-lg bg-green-500 px-4 py-3 font-semibold text-black hover:bg-green-400 text-left"
                >
                  🗺️ Visa karta
                </button>

                <button
                  onClick={async () => {
                    setSaveStatus('saving');
                    try {
                      await updateRun({ status: currentRun.status || 'active' });
                      setSaveStatus('saved');
                      setTimeout(() => setSaveStatus(''), 3000);
                    } catch (error) {
                      console.error('Kunde inte spara runda', error);
                      setSaveStatus('error');
                      setTimeout(() => setSaveStatus(''), 3000);
                    }
                    setMenuOpen(false);
                  }}
                  className={`w-full rounded-lg px-4 py-3 font-semibold text-black text-left ${
                    saveStatus === 'saving'
                      ? 'bg-yellow-400'
                      : saveStatus === 'saved'
                      ? 'bg-green-400'
                      : saveStatus === 'error'
                      ? 'bg-red-400'
                      : 'bg-indigo-500 hover:bg-indigo-400'
                  }`}
                  disabled={saveStatus === 'saving'}
                >
                  {saveStatus === 'saving' && '⏳ Sparar...'}
                  {saveStatus === 'saved' && '✓ Sparat!'}
                  {saveStatus === 'error' && '⚠️ Fel!'}
                  {!saveStatus && '💾 Spara rundstatus'}
                </button>

                <button
                  onClick={() => {
                    navigate(`/run/${currentRun.id}/results`);
                    setMenuOpen(false);
                  }}
                  className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-black hover:bg-emerald-400 text-left"
                >
                  🏆 Visa resultatvy
                </button>

                <button
                  onClick={async () => {
                    if (window.confirm('Vill du stänga rundan för nya deltagare?')) {
                      await closeRun();
                      setMenuOpen(false);
                    }
                  }}
                  className="w-full rounded-lg bg-orange-600 px-4 py-3 font-semibold text-white hover:bg-orange-500 text-left"
                >
                  🚫 Stäng runda
                </button>

                <button
                  onClick={() => {
                    navigate('/');
                    setMenuOpen(false);
                  }}
                  className="w-full rounded-lg bg-slate-700 px-4 py-3 font-semibold text-gray-200 hover:bg-slate-600 text-left"
                >
                  🏠 Tillbaka till start
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Kartoverlay */}
      {showMap && (
        <div className="fixed inset-0 z-50 bg-slate-950">
          <div className="h-full flex flex-col">
            <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Rundans karta</h2>
              <button
                onClick={() => setShowMap(false)}
                className="p-2 rounded hover:bg-slate-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1">
              <RunMap
                checkpoints={currentRun.checkpoints || []}
                userPosition={null}
                activeOrder={0}
                answeredCount={0}
                route={currentRun.route}
              />
            </div>
          </div>
        </div>
      )}

      {/* Huvudinnehåll */}
      <div className="px-4 py-6 space-y-6">
        {/* QR-kod sektion */}
        <div className="rounded-lg border border-cyan-500/40 bg-slate-900/60 p-6 text-center">
          <h2 className="text-lg font-semibold mb-4 text-cyan-200">📱 QR-kod för anslutning</h2>
          <QRCodeDisplay
            value={joinLink}
            title="Anslutningslänk"
            description="Dela med deltagare"
          />
          <p className="text-xs text-gray-400 mt-3">
            Länk: {joinLink}
          </p>
        </div>

        {/* Deltagare sektion */}
        <div className="rounded-lg border border-slate-600 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold mb-4 text-cyan-200">👥 Deltagare ({participants.length})</h2>
          {participants.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 mb-2">Inga deltagare har anslutit ännu</p>
              <p className="text-xs text-gray-500">Dela QR-koden ovan för att bjuda in deltagare</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rankedParticipants.map((participant, index) => {
                const statusMeta = describeParticipantStatus(participant.status);
                const progress = Math.min(100, ((participant.answers?.length || 0) / currentRun.questionCount) * 100);

                return (
                  <div key={participant.id} className="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">
                          {index === 0 && '🥇'}
                          {index === 1 && '🥈'}
                          {index === 2 && '🥉'}
                          {index > 2 && '👤'}
                        </span>
                        <div>
                          <p className="font-semibold">{participant.alias}</p>
                          <p className="text-sm text-gray-400">#{index + 1} plats</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-cyan-300">{participant.score} poäng</p>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta.pillClass}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />
                          {statusMeta.label}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between text-sm text-gray-400 mb-1">
                        <span>Framsteg</span>
                        <span>{participant.answers?.length || 0}/{currentRun.questionCount} frågor</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Frågor sektion */}
        <div className="rounded-lg border border-slate-600 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold mb-4 text-cyan-200">🧠 Frågor i rundan ({currentRun.questionIds.length})</h2>
          {currentRun.questionIds.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Inga frågor har lagts till i rundan ännu.</p>
          ) : (
            <div className="space-y-3">
              {currentRun.questionIds.map((questionId, index) => {
                const question = questionMap[questionId];
                if (!question) {
                  return (
                    <div key={questionId} className="p-3 border border-red-600 bg-red-900/40 rounded-lg">
                      <p className="text-red-200 text-sm">Fråga #{index + 1}: Kunde inte hittas (ID: {questionId})</p>
                    </div>
                  );
                }
                return (
                  <div key={questionId} className="border border-slate-700 bg-slate-800/40 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-cyan-300">Fråga #{index + 1}</span>
                      <div className="text-xs text-gray-400">
                        <span className="bg-slate-700 px-2 py-1 rounded">{question.category || 'Okategoriserad'}</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-300 mb-3 line-clamp-2">{question.text}</p>
                    <div className="grid grid-cols-1 gap-1">
                      {question.options.slice(0, 2).map((option, optionIndex) => (
                        <div
                          key={optionIndex}
                          className={`text-xs px-2 py-1 rounded ${
                            optionIndex === question.correctOption
                              ? 'bg-emerald-900/60 text-emerald-100 border border-emerald-600'
                              : 'bg-slate-700/60 text-gray-400'
                          }`}
                        >
                          <span className="font-mono mr-1">
                            {String.fromCharCode(65 + optionIndex)}:
                          </span>
                          {option.length > 30 ? option.slice(0, 30) + '...' : option}
                          {optionIndex === question.correctOption && (
                            <span className="ml-2 text-xs font-bold text-emerald-200">✓</span>
                          )}
                        </div>
                      ))}
                      {question.options.length > 2 && (
                        <div className="text-xs text-gray-500 px-2 py-1">
                          ... och {question.options.length - 2} alternativ till
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RunAdminPage;