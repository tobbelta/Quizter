/**
 * Administrationsvy med live-status över deltagare och kontrollknappar.
 */
import React, { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRun } from '../context/RunContext';
import { questionService } from '../services/questionService';
import { describeParticipantStatus } from '../utils/participantStatus';
import QRCodeDisplay from '../components/shared/QRCodeDisplay';
import { buildJoinLink } from '../utils/joinLink';

const RunAdminPage = () => {
  const { runId } = useParams();
  const navigate = useNavigate();
  const { currentRun, participants, loadRunById, refreshParticipants, closeRun, updateRun } = useRun();
  const [saveStatus, setSaveStatus] = React.useState('');

  useEffect(() => {
    if (!currentRun || currentRun.id !== runId) {
      loadRunById(runId).catch((error) => console.warn('Kunde inte ladda runda', error));
    }
  }, [currentRun, loadRunById, runId]);

  useEffect(() => {
    refreshParticipants().catch((error) => console.warn('Kunde inte uppdatera deltagare', error));
  }, [refreshParticipants]);

    /** Slår upp frågetexterna en gång så att tabellen blir snabb. */
  const questionMap = useMemo(() => {
    if (!currentRun) return {};
    return currentRun.questionIds.reduce((acc, questionId) => {
      const question = questionService.getById(questionId);
      if (question) acc[questionId] = question;
      return acc;
    }, {});
  }, [currentRun]);

  if (!currentRun) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-center">
        <p className="text-gray-300">Hämtar rundainformation...</p>
      </div>
    );
  }

    /** Sorterar deltagarna så att toppresultatet visas först. */
  const rankedParticipants = [...participants].sort((a, b) => b.score - a.score);
  const joinLink = buildJoinLink(currentRun.joinCode);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
      <header className="flex flex-col gap-4 border-b border-slate-700 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1">{currentRun.name}</h1>
          <p className="text-gray-300">Kod: <span className="font-mono text-lg">{currentRun.joinCode}</span></p>
          <p className="text-sm text-gray-400">Status: {currentRun.status}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(currentRun.joinCode)}
            className="rounded bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400"
          >
            Kopiera anslutningskod
          </button>
          <button
            type="button"
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
            }}
            className={`rounded px-4 py-2 font-semibold text-black ${
              saveStatus === 'saving'
                ? 'bg-yellow-500 hover:bg-yellow-400'
                : saveStatus === 'saved'
                ? 'bg-green-600 hover:bg-green-500'
                : saveStatus === 'error'
                ? 'bg-red-500 hover:bg-red-400'
                : 'bg-green-500 hover:bg-green-400'
            }`}
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving'
              ? 'Sparar...'
              : saveStatus === 'saved'
              ? '✓ Sparad'
              : saveStatus === 'error'
              ? '✗ Fel'
              : 'Spara runda'
            }
          </button>
          <button
            type="button"
            onClick={() => navigate(`/run/${currentRun.id}/results`)}
            className="rounded bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
          >
            Visa resultatvy
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await closeRun();
              } catch (error) {
                console.error('Kunde inte avsluta runda', error);
              }
            }}
            className="rounded bg-slate-700 px-4 py-2 font-semibold text-gray-200 hover:bg-slate-600"
          >
            Avsluta runda
          </button>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="rounded border border-indigo-400/40 bg-slate-900/60 p-6">
            <h2 className="text-xl font-semibold mb-3">Deltagarlista</h2>
            <ul className="space-y-2">
              {rankedParticipants.length === 0 && <li className="text-gray-400">Inga deltagare har anslutit ännu.</li>}
              {rankedParticipants.map((participant, index) => {
                const statusMeta = describeParticipantStatus(participant.status);
                return (
                  <li key={participant.id} className="flex items-center justify-between rounded bg-slate-800/60 px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className={`h-2 w-2 rounded-full ${statusMeta.dotClass}`} />
                      <span>
                        {index + 1}. {participant.alias}
                        {participant.isAnonymous ? ' (anonym)' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-300">{participant.score} poäng</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${statusMeta.pillClass}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded border border-slate-600 bg-slate-900/60 p-6">
            <h2 className="text-xl font-semibold mb-3">Frågor</h2>
            <ol className="space-y-3 list-decimal list-inside text-sm text-gray-300">
              {currentRun.questionIds.map((questionId) => {
                const question = questionMap[questionId];
                return (
                  <li key={questionId}>
                    <p className="font-semibold text-cyan-100">{question?.text}</p>
                    <p className="text-xs text-gray-400">Kategori: {question?.category} - Rätt svar: {question?.options[question?.correctOption || 0]}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <QRCodeDisplay
          value={joinLink}
          title="QR för anslutning"
          description="Låt deltagarna skanna koden för att ansluta direkt."
        />
      </section>

      <section className="rounded border border-cyan-500/40 bg-slate-900/60 p-6">
        <h2 className="text-xl font-semibold mb-3">Resultatdetaljer</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-700 text-sm">
            <thead className="bg-slate-800/80">
              <tr>
                <th className="px-3 py-2 text-left">Deltagare</th>
                {currentRun.questionIds.map((questionId, index) => (
                  <th key={questionId} className="px-3 py-2 text-center">{index + 1}</th>
                ))}
                <th className="px-3 py-2 text-center">Poäng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rankedParticipants.map((participant) => (
                <tr key={participant.id}>
                  <td className="px-3 py-2 font-medium text-gray-200">{participant.alias}</td>
                  {currentRun.questionIds.map((questionId) => {
                    const answer = participant.answers.find((entry) => entry.questionId === questionId);
                    return (
                      <td key={`${participant.id}-${questionId}`} className="px-3 py-2 text-center">
                        {answer ? (
                          <span className={answer.correct ? 'text-emerald-400' : 'text-rose-400'}>
                            {answer.correct ? '✔' : '✖'}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center text-cyan-200 font-semibold">{participant.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default RunAdminPage;
