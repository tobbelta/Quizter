/**
 * Resultatvy efter avslutad runda.
 */
import React, { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRun } from '../context/RunContext';
import { describeParticipantStatus } from '../utils/participantStatus';

const RunResultsPage = () => {
  const { runId } = useParams();
  const navigate = useNavigate();
  const { currentRun, participants, loadRunById, refreshParticipants } = useRun();

  useEffect(() => {
    if (!currentRun || currentRun.id !== runId) {
      loadRunById(runId).catch((error) => console.warn('Kunde inte ladda runda', error));
    }
  }, [currentRun, loadRunById, runId]);

  useEffect(() => {
    refreshParticipants().catch((error) => console.warn('Kunde inte uppdatera deltagare', error));
  }, [refreshParticipants]);

    /** Skapar topplistan baserat på poäng och sluttider. */
  const ranking = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.completedAt || '').localeCompare(b.completedAt || '');
    });
  }, [participants]);

  if (!currentRun) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 text-center">
        <p className="text-gray-300">Hämtar resultat...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <header className="border-b border-slate-700 pb-4">
        <h1 className="text-3xl font-bold mb-2">Resultat – {currentRun.name}</h1>
        <p className="text-gray-400">Status: {currentRun.status}</p>
      </header>

      <section className="rounded border border-emerald-500/40 bg-emerald-900/20 p-6">
        <h2 className="text-xl font-semibold mb-3 text-emerald-200">Ledartavla</h2>
        <ol className="space-y-2">
          {ranking.length === 0 && <li className="text-gray-300">Inga svar registrerade ännu.</li>}
          {ranking.map((participant, index) => {
            const statusMeta = describeParticipantStatus(participant.status);
            return (
              <li key={participant.id} className="flex items-center justify-between rounded bg-emerald-900/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${statusMeta.dotClass}`} />
                  <span>#{index + 1} {participant.alias}{participant.isAnonymous ? ' (anonym)' : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{participant.score} poäng</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${statusMeta.pillClass}`}>
                    {statusMeta.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded border border-slate-600 bg-slate-900/60 p-6">
        <h2 className="text-xl font-semibold mb-3">Detaljer</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-800/70">
              <tr>
                <th className="px-3 py-2 text-left">Deltagare</th>
                <th className="px-3 py-2 text-left">Rätt svar</th>
                <th className="px-3 py-2 text-left">Tidsstämpel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {ranking.map((participant) => (
                <tr key={participant.id}>
                  <td className="px-3 py-2">{participant.alias}</td>
                  <td className="px-3 py-2">{participant.score} / {currentRun.questionCount}</td>
                  <td className="px-3 py-2 text-gray-400">{participant.completedAt ? new Date(participant.completedAt).toLocaleString() : 'Pågående'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => navigate(`/run/${currentRun.id}/play`)}
          className="rounded bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400"
        >
          Tillbaka till frågorna
        </button>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded bg-slate-700 px-4 py-2 font-semibold text-gray-200 hover:bg-slate-600"
        >
          Gå till startsidan
        </button>
      </div>
    </div>
  );
};

export default RunResultsPage;
