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
      setDuplicates(found);
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
        <button
          onClick={scanForDuplicates}
          disabled={loading}
          className="px-4 py-2 bg-cyan-500 text-black rounded-lg font-semibold hover:bg-cyan-400 disabled:bg-slate-600 disabled:text-gray-400"
        >
          {loading ? 'Söker...' : '🔍 Sök dubletter'}
        </button>
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
                    <div className="text-xs text-gray-400 mb-1">Fråga 1:</div>
                    <div className="text-sm text-white">{dup.text1}</div>
                    <div className="mt-1 flex gap-2">
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
                    className="ml-4 px-3 py-1 bg-red-500/20 text-red-300 rounded text-xs hover:bg-red-500/30"
                  >
                    Ta bort
                  </button>
                </div>
              </div>

              {/* Fråga 2 */}
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-xs text-gray-400 mb-1">Fråga 2:</div>
                    <div className="text-sm text-white">{dup.text2}</div>
                    <div className="mt-1 flex gap-2">
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
                    className="ml-4 px-3 py-1 bg-red-500/20 text-red-300 rounded text-xs hover:bg-red-500/30"
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
