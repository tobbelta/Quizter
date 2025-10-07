/**
 * Panel för att visa och hantera dubblettfrågor
 */
import React, { useState } from 'react';
import { questionService } from '../../services/questionService';

const DuplicateQuestionsPanel = () => {
  const [duplicates, setDuplicates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [threshold, setThreshold] = useState(85);
  const [deletedQuestions, setDeletedQuestions] = useState(new Set());

  const scanForDuplicates = () => {
    setLoading(true);
    try {
      const found = questionService.findDuplicates('sv', threshold / 100);

      console.log('[DuplicateQuestionsPanel] Råa dubletter:', found.map(d => ({
        pairId: d.pairId,
        q1: d.question1.id,
        q2: d.question2.id,
        text: d.text1.substring(0, 30)
      })));

      // Filtrera bort dubbletter av dubletter (samma pairId)
      const uniqueDuplicates = [];
      const seenPairs = new Set();

      for (const dup of found) {
        const pairId = dup.pairId || [dup.question1.id, dup.question2.id].sort().join('-');

        if (seenPairs.has(pairId)) {
          console.warn('[DuplicateQuestionsPanel] Skippar dublett av dublett:', pairId);
          continue;
        }

        seenPairs.add(pairId);
        uniqueDuplicates.push(dup);
      }

      console.log(`[DuplicateQuestionsPanel] Hittade ${found.length} dubletter, ${uniqueDuplicates.length} unika par`);
      setDuplicates(uniqueDuplicates);
    } catch (error) {
      console.error('Fel vid dublettsökning:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm('Är du säker på att du vill ta bort denna fråga?')) {
      return;
    }

    try {
      await questionService.delete(questionId);
      setDeletedQuestions(prev => new Set([...prev, questionId]));
      // Skanna om för att uppdatera listan
      setTimeout(scanForDuplicates, 500);
    } catch (error) {
      alert('Kunde inte ta bort fråga: ' + error.message);
    }
  };

  const handleAutoCleanDuplicates = async () => {
    const confirmMessage =
      `Detta kommer att automatiskt ta bort ${visibleDuplicates.length} dublettfrågor.\n\n` +
      `För varje par behålls den första frågan och den andra tas bort.\n\n` +
      `Är du säker på att du vill fortsätta?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    let deletedCount = 0;
    const errors = [];

    try {
      // För varje dublett-par, ta bort question2 (behåll question1)
      for (const dup of visibleDuplicates) {
        try {
          console.log(`[AutoClean] Tar bort ${dup.question2.id} (behåller ${dup.question1.id})`);
          await questionService.delete(dup.question2.id);
          deletedCount++;
          setDeletedQuestions(prev => new Set([...prev, dup.question2.id]));
        } catch (error) {
          console.error(`[AutoClean] Fel vid borttagning av ${dup.question2.id}:`, error);
          errors.push(`${dup.question2.id}: ${error.message}`);
        }
      }

      // Visa resultat
      const resultMessage =
        `✅ Automatisk dublettrensning klar!\n\n` +
        `Borttagna frågor: ${deletedCount}\n` +
        (errors.length > 0 ? `Fel: ${errors.length}\n\n${errors.join('\n')}` : '');

      alert(resultMessage);

      // Skanna om
      setTimeout(scanForDuplicates, 1000);
    } catch (error) {
      alert('Fel vid automatisk rensning: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Filtrera bort dubletter där en av frågorna redan raderats
  const visibleDuplicates = duplicates.filter(
    dup => !deletedQuestions.has(dup.question1.id) && !deletedQuestions.has(dup.question2.id)
  );

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">Dubblettfrågor</h2>
          <p className="text-sm text-gray-400 mt-1">
            Sök efter liknande frågor i databasen
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={scanForDuplicates}
            disabled={loading}
            className="px-4 py-2 bg-cyan-500 text-black rounded-lg font-semibold hover:bg-cyan-400 disabled:bg-slate-600 disabled:text-gray-400"
          >
            {loading ? 'Söker...' : '🔍 Sök dubletter'}
          </button>
          {visibleDuplicates.length > 0 && (
            <button
              onClick={handleAutoCleanDuplicates}
              disabled={loading}
              className="px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-400 disabled:bg-slate-600 disabled:text-gray-400"
            >
              🧹 Auto-rensa ({visibleDuplicates.length})
            </button>
          )}
        </div>
      </div>

      {/* Likhetströsk */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Likhetströsk: {threshold}%
        </label>
        <input
          type="range"
          min="70"
          max="100"
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>70% - Många träffar</span>
          <span>100% - Endast identiska</span>
        </div>
      </div>

      {/* Resultat */}
      {visibleDuplicates.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-400">
          {duplicates.length === 0
            ? 'Klicka på "Sök dubletter" för att börja'
            : '✅ Inga dubletter hittades!'}
        </div>
      )}

      {visibleDuplicates.length > 0 && (
        <div className="space-y-4">
          <div className="text-sm text-gray-300 mb-4">
            Hittade {visibleDuplicates.length} potentiella dubletter
          </div>

          {visibleDuplicates.map((dup, index) => (
            <div
              key={`${dup.question1.id}-${dup.question2.id}`}
              className="bg-slate-900 rounded-lg p-4 border border-amber-500/30"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-amber-400">
                  {dup.similarity}% likhet
                </span>
                <span className="text-xs text-gray-500">Dublett #{index + 1}</span>
              </div>

              {/* Fråga 1 */}
              <div className="mb-3 pb-3 border-b border-slate-700">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-xs text-gray-400">Fråga 1:</div>
                      <code className="text-xs px-1.5 py-0.5 bg-slate-800 text-cyan-400 rounded font-mono">
                        {dup.question1.id}
                      </code>
                    </div>
                    <div className="text-sm text-white">{dup.text1}</div>
                    <div className="mt-1 flex gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded">
                        {dup.question1.difficulty}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                        {dup.question1.audience}
                      </span>
                      <span className="text-xs text-gray-500">
                        {dup.question1.categories?.join(', ')}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteQuestion(dup.question1.id)}
                    className="ml-4 px-3 py-1 bg-red-500/20 text-red-300 rounded text-xs hover:bg-red-500/30 flex-shrink-0"
                  >
                    Ta bort
                  </button>
                </div>
              </div>

              {/* Fråga 2 */}
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-xs text-gray-400">Fråga 2:</div>
                      <code className="text-xs px-1.5 py-0.5 bg-slate-800 text-cyan-400 rounded font-mono">
                        {dup.question2.id}
                      </code>
                    </div>
                    <div className="text-sm text-white">{dup.text2}</div>
                    <div className="mt-1 flex gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded">
                        {dup.question2.difficulty}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                        {dup.question2.audience}
                      </span>
                      <span className="text-xs text-gray-500">
                        {dup.question2.categories?.join(', ')}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteQuestion(dup.question2.id)}
                    className="ml-4 px-3 py-1 bg-red-500/20 text-red-300 rounded text-xs hover:bg-red-500/30 flex-shrink-0"
                  >
                    Ta bort
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DuplicateQuestionsPanel;
