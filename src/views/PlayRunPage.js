import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRun } from '../context/RunContext';
import { useAuth } from '../context/AuthContext';
import { questionService } from '../services/questionService';

const PlayRunPage = () => {
  const { runId } = useParams();
  const navigate = useNavigate();
  const { currentRun, currentParticipant, questions, loadRunById, submitAnswer, completeRunForParticipant, refreshParticipants, participants } = useRun();
  const { currentUser } = useAuth();
  const [selectedOption, setSelectedOption] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      if (!currentRun || currentRun.id !== runId) {
        loadRunById(runId);
      }
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [currentRun, loadRunById, runId]);

  useEffect(() => {
    refreshParticipants();
  }, [refreshParticipants]);

  useEffect(() => {
    setSelectedOption(null);
    setFeedback(null);
  }, [currentParticipant?.currentOrder]);

  const participantsSnapshot = useMemo(() => {
    if (!participants || participants.length === 0) return [];
    return [...participants].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.completedAt || '').localeCompare(b.completedAt || '');
    });
  }, [participants]);

  const orderedQuestions = useMemo(() => {
    if (!currentRun) return [];
    return currentRun.questionIds.map((id) => questionService.getById(id)).filter(Boolean);
  }, [currentRun]);

  const currentOrderIndex = useMemo(() => {
    if (!currentParticipant) return 0;
    return Math.max(0, currentParticipant.currentOrder - 1);
  }, [currentParticipant]);

  const currentQuestion = orderedQuestions[currentOrderIndex];

  const hasCompleted = Boolean(currentParticipant?.answers?.length >= orderedQuestions.length);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (selectedOption === null || !currentQuestion) {
      return;
    }
    const { correct } = submitAnswer({
      questionId: currentQuestion.id,
      answerIndex: selectedOption
    });
    setFeedback(correct ? 'Rätt svar!' : 'Tyvärr fel svar.');
    setSelectedOption(null);
  };

  const handleFinish = () => {
    completeRunForParticipant();
    navigate(`/run/${currentRun.id}/results`);
  };

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">Något gick fel</h1>
        <p className="text-red-300">{error}</p>
      </div>
    );
  }

  if (!currentRun || !currentParticipant) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 text-center">
        <p className="text-gray-300">Hämtar rundainformation...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header className="border-b border-slate-700 pb-4">
        <h1 className="text-3xl font-bold mb-2">{currentRun.name}</h1>
        <p className="text-gray-300">Deltagare: {currentParticipant.alias || currentUser?.name}</p>
        <p className="text-sm text-gray-400">Fråga {Math.min(currentParticipant.currentOrder, orderedQuestions.length)} av {orderedQuestions.length}</p>
      </header>

      {hasCompleted ? (
        <section className="rounded-lg border border-emerald-500/40 bg-emerald-900/20 p-6 text-center space-y-4">
          <h2 className="text-2xl font-semibold text-emerald-200">Bra jobbat!</h2>
          <p className="text-gray-200">Du har avslutat rundan med {currentParticipant.score} poäng.</p>
          <button
            type="button"
            onClick={handleFinish}
            className="rounded bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
          >
            Se resultat och ställning
          </button>
        </section>
      ) : (
        currentQuestion ? (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-lg border border-cyan-400/40 bg-slate-900/60 p-6">
                <h2 className="text-xl font-semibold mb-3">{currentQuestion.text}</h2>
                <div className="space-y-2">
                  {currentQuestion.options.map((option, index) => (
                    <label key={option} className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2 transition ${selectedOption === index ? 'border-cyan-400 bg-cyan-500/20' : 'border-slate-700 bg-slate-900/40 hover:border-cyan-500/60'}`}>
                      <input
                        type="radio"
                        name="answer"
                        value={index}
                        checked={selectedOption === index}
                        onChange={() => setSelectedOption(index)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={selectedOption === null}
                  className="rounded bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-gray-400"
                >
                  Lämna svar
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  className="rounded bg-slate-700 px-4 py-2 font-semibold text-gray-200 hover:bg-slate-600"
                >
                  Avsluta runda
                </button>
              </div>
              {feedback && (
                <div className={`rounded px-4 py-3 text-sm ${feedback.includes('Rätt') ? 'bg-emerald-900/40 text-emerald-100 border border-emerald-500/40' : 'bg-amber-900/40 text-amber-100 border border-amber-500/40'}`}>
                  {feedback}
                </div>
              )}
            </form>
            <section className="rounded border border-slate-700 bg-slate-900/50 p-4">
              <h2 className="text-lg font-semibold mb-2">Ställning</h2>
              <ul className="space-y-1 text-sm text-gray-300">
                {participantsSnapshot.length === 0 && <li>Inga andra svar ännu.</li>}
                {participantsSnapshot.map((participant, index) => (
                  <li key={participant.id} className="flex justify-between">
                    <span>{index + 1}. {participant.alias}</span>
                    <span>{participant.score} / {orderedQuestions.length}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (        ) : (
          <div className="rounded border border-slate-700 bg-slate-900/60 p-6">
            <p className="text-gray-300">Inga fler frågor hittades.</p>
            <button
              type="button"
              onClick={handleFinish}
              className="mt-4 rounded bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400"
            >
              Gå till resultat
            </button>
          </div>
        )
      )}
    </div>
  );
};

export default PlayRunPage;
