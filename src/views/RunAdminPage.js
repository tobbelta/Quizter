import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRun } from '../context/RunContext';
import { questionService } from '../services/questionService';
import { describeParticipantStatus } from '../utils/participantStatus';
import QRCodeDisplay from '../components/shared/QRCodeDisplay';
import { buildJoinLink } from '../utils/joinLink';
import useQRCode from '../hooks/useQRCode';
import FullscreenQRCode from '../components/shared/FullscreenQRCode';
import FullscreenMap from '../components/shared/FullscreenMap';

const RunAdminPage = () => {
  const { runId } = useParams();
  const navigate = useNavigate();
  const { currentRun, participants, loadRunById, refreshParticipants, closeRun, deleteRun } = useRun();
  const [isQRCodeFullscreen, setIsQRCodeFullscreen] = useState(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('sv');
  const [isFetchingQuestions, setIsFetchingQuestions] = useState(false);
  const [fetchQuestionsError, setFetchQuestionsError] = useState('');

  const joinLink = currentRun ? buildJoinLink(currentRun.joinCode) : '';
  const { dataUrl, isLoading, error: qrError } = useQRCode(joinLink, 320);

  useEffect(() => {
    if (!currentRun || currentRun.id !== runId) {
      loadRunById(runId).catch((error) => console.warn('Kunde inte ladda runda', error));
    }
  }, [currentRun, loadRunById, runId]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshParticipants().catch((error) => console.warn('Kunde inte uppdatera deltagare', error));
    }, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [refreshParticipants]);

  const questionMap = useMemo(() => {
    if (!currentRun) return {};
    return currentRun.questionIds.reduce((acc, questionId) => {
      const question = questionService.getByIdForLanguage(questionId, selectedLanguage);
      if (question) acc[questionId] = question;
      return acc;
    }, {});
  }, [currentRun, selectedLanguage]);

  if (!currentRun) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-center">
        <p className="text-gray-300">Hämtar rundainformation...</p>
      </div>
    );
  }

  const rankedParticipants = [...participants].sort((a, b) => b.score - a.score);

  const handleEndGame = async () => {
    if (window.confirm('Är du säker på att du vill avsluta spelet? Nya spelare kommer inte kunna ansluta.')) {
      await closeRun();
    }
  };

  const handleDeleteRun = async () => {
    if (window.confirm('Är du säker på att du vill radera denna runda permanent? Detta går inte att ångra.')) {
      await deleteRun();
      navigate('/');
    }
  };

  const handleFetchQuestions = async () => {
    setFetchQuestionsError('');
    setIsFetchingQuestions(true);
    try {
      await questionService.fetchAndAddFromOpenTDB({
        amount: 10,
        difficulty: currentRun.difficulty,
        audience: currentRun.audience
      });
    } catch (error) {
      setFetchQuestionsError(error.message);
    } finally {
      setIsFetchingQuestions(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {isQRCodeFullscreen && <FullscreenQRCode dataUrl={dataUrl} onClose={() => setIsQRCodeFullscreen(false)} />}
      {isMapFullscreen && <FullscreenMap checkpoints={currentRun.checkpoints} route={currentRun.route} onClose={() => setIsMapFullscreen(false)} />}

      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold truncate">{currentRun.name}</h1>
          <button onClick={() => navigate('/')} className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-600">
            Tillbaka
          </button>
        </div>
      </header>

      <div className="px-4 py-6 space-y-6">
        <div className="rounded-lg border border-cyan-500/40 bg-slate-900/60 p-6 text-center">
          <h2 className="text-lg font-semibold mb-4 text-cyan-200">Bjud in deltagare</h2>
          <div className="flex justify-center cursor-pointer" onClick={() => setIsQRCodeFullscreen(true)}>
            <QRCodeDisplay dataUrl={dataUrl} isLoading={isLoading} error={qrError} />
          </div>
          <div className="mt-4">
            <p className="text-sm text-gray-300 mb-2">Anslutningskod:</p>
            <div className="text-2xl font-mono font-bold text-white bg-slate-800 rounded-lg py-2 px-4">
              {currentRun.joinCode}
            </div>
          </div>
          <div className="mt-4 text-center">
            <a href={joinLink} target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:underline break-all">
                {joinLink}
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button onClick={() => navigate(`/run/${runId}/results`)} className="rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-black hover:bg-emerald-400">
                Se resultat
            </button>
            <button onClick={() => setIsMapFullscreen(true)} className="rounded-lg bg-blue-500 px-4 py-3 font-semibold text-black hover:bg-blue-400">
                Visa karta
            </button>
            <button onClick={handleEndGame} className="rounded-lg bg-orange-600 px-4 py-3 font-semibold text-white hover:bg-orange-500">
                Avsluta spel
            </button>
        </div>

        <div className="rounded-lg border border-slate-600 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold mb-4 text-cyan-200">Live Leaderboard ({participants.length})</h2>
          {participants.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400">Väntar på att spelare ska ansluta...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rankedParticipants.map((participant, index) => {
                const statusMeta = describeParticipantStatus(participant.status);
                return (
                  <div key={participant.id} className="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{index + 1}.</span>
                        <p className="font-semibold">{participant.alias}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-cyan-300">{participant.score} poäng</p>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta.pillClass}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />
                          {statusMeta.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-600 bg-slate-900/60 p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-cyan-200">Frågor ({currentRun.questionIds.length})</h2>
                <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
                    <button type="button" onClick={() => setSelectedLanguage('sv')} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${selectedLanguage === 'sv' ? 'bg-cyan-500 text-black' : 'text-gray-300 hover:text-white'}`}>
                        🇸🇪 SV
                    </button>
                    <button type="button" onClick={() => setSelectedLanguage('en')} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${selectedLanguage === 'en' ? 'bg-cyan-500 text-black' : 'text-gray-300 hover:text-white'}`}>
                        🇬🇧 EN
                    </button>
                </div>
            </div>
            <div className="space-y-3">
              {currentRun.questionIds.map((questionId, index) => {
                const question = questionMap[questionId];
                return (
                  <div key={questionId} className="border border-slate-700 bg-slate-800/40 rounded-lg p-3">
                    <p className="text-sm font-semibold text-cyan-300">Fråga #{index + 1}</p>
                    <p className="text-sm text-gray-300">{question ? question.text : 'Laddar fråga...'}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
                <button onClick={handleFetchQuestions} disabled={isFetchingQuestions} className="w-full rounded-lg bg-purple-500 px-4 py-3 font-semibold text-black hover:bg-purple-400 disabled:bg-slate-700">
                    {isFetchingQuestions ? 'Hämtar frågor...' : 'Hämta nya frågor'}
                </button>
                {fetchQuestionsError && <p className="text-red-500 text-sm mt-2">{fetchQuestionsError}</p>}
            </div>
        </div>

        <div className="text-center mt-4">
            <button onClick={handleDeleteRun} className="text-red-500 hover:underline">
                Radera runda
            </button>
        </div>
      </div>
    </div>
  );
};

export default RunAdminPage;