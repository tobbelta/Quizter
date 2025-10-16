/**
 * Panel för att validera alla frågor i databasen
 */
import React, { useState } from 'react';
import { questionService } from '../../services/questionService';

const ValidationPanel = () => {
  const [validationResults, setValidationResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);

  const runValidation = async () => {
    setLoading(true);
    setValidationResults(null);
    try {
      const allQuestions = await questionService.loadAllQuestions();
      const total = allQuestions.length;

      if (total === 0) {
        setValidationResults({
          total: 0,
          valid: 0,
          invalid: 0,
          results: [],
        });
        return;
      }

      setProgress({ current: 0, total });

      const results = [];
      let validCount = 0;
      let invalidCount = 0;

      for (let index = 0; index < total; index += 1) {
        const question = allQuestions[index];
        const validation = questionService.validateQuestion(question, 'sv');

        const issues = validation.errors || [];
        const structureResult = {
          validationType: 'structure',
          valid: validation.valid,
          issues,
          reasoning: validation.valid
            ? 'Strukturvalidering: Godkänd'
            : `Strukturvalidering: ${issues.join(', ')}`,
          checkedAt: new Date().toISOString(),
        };

        if (validation.valid) {
          validCount += 1;
          try {
            await questionService.updateStructureValidation(question.id, structureResult);
          } catch (error) {
            console.error('[ValidationPanel] Kunde inte uppdatera strukturvalidering:', error);
          }
        } else {
          invalidCount += 1;
          const questionText = question.languages?.sv?.text || question.text || '';

          results.push({
            index,
            questionId: question.id,
            questionText,
            errors: issues,
            valid: false,
          });

          try {
            await questionService.markAsInvalid(question.id, structureResult);
          } catch (error) {
            console.error('[ValidationPanel] Kunde inte markera fråga som ogiltig:', error);
          }
        }

        setProgress({ current: index + 1, total });
      }

      setValidationResults({
        total,
        valid: validCount,
        invalid: invalidCount,
        results,
      });
    } catch (error) {
      console.error('Fel vid validering:', error);
      alert('Kunde inte validera frågor: ' + error.message);
    } finally {
      setProgress(null);
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">Validering av frågor</h2>
          <p className="text-sm text-gray-400 mt-1">
            Kontrollera att alla frågor i databasen är korrekt formaterade
          </p>
        </div>
        <button
          onClick={runValidation}
          disabled={loading}
          className="px-4 py-2 bg-cyan-500 text-black rounded-lg font-semibold hover:bg-cyan-400 disabled:bg-slate-600 disabled:text-gray-400"
        >
          {loading ? 'Validerar...' : '✅ Validera alla frågor'}
        </button>
      </div>

      {progress && (
        <div className="mb-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-4">
          <div className="flex items-center justify-between text-sm text-cyan-200">
            <span>Validerar frågor...</span>
            <span>
              {progress.current} / {progress.total}
            </span>
          </div>
          <div className="mt-2 h-2 w-full rounded bg-slate-900">
            <div
              className="h-full rounded bg-cyan-400 transition-all"
              style={{ width: `${progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Resultat */}
      {validationResults && (
        <div className="space-y-4">
          {/* Översikt */}
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-3">Översikt</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-cyan-400">{validationResults.total}</div>
                <div className="text-sm text-gray-400 mt-1">Totalt frågor</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400">{validationResults.valid}</div>
                <div className="text-sm text-gray-400 mt-1">Giltiga</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-400">{validationResults.invalid}</div>
                <div className="text-sm text-gray-400 mt-1">Ogiltiga</div>
              </div>
            </div>
          </div>

          {/* Felmeddelanden */}
          {validationResults.invalid > 0 ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-red-400 mb-3">
                ⚠️ Hittade {validationResults.invalid} ogiltiga frågor
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {validationResults.results.map((result, index) => (
                  <div
                    key={result.questionId || index}
                    className="bg-slate-900 rounded p-3 border border-red-500/20"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-gray-400">Fråga #{result.index + 1}:</span>
                          <code className="text-xs px-1.5 py-0.5 bg-slate-800 text-cyan-400 rounded font-mono">
                            {result.questionId}
                          </code>
                        </div>
                        <div className="text-sm text-white mb-2">
                          {result.questionText.substring(0, 80)}
                          {result.questionText.length > 80 ? '...' : ''}
                        </div>
                        <div className="space-y-1">
                          {result.errors.map((error, i) => (
                            <div key={i} className="text-xs text-red-300 flex items-start gap-2">
                              <span className="text-red-400">•</span>
                              <span>{error}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6 text-center">
              <div className="text-4xl mb-2">✅</div>
              <div className="text-lg font-semibold text-green-400">
                Alla frågor är giltiga!
              </div>
              <div className="text-sm text-gray-400 mt-2">
                Alla {validationResults.total} frågor i databasen är korrekt formaterade.
              </div>
            </div>
          )}
        </div>
      )}

      {!validationResults && !loading && !progress && (
        <div className="text-center py-8 text-gray-400">
          Klicka på "Validera alla frågor" för att börja
        </div>
      )}
    </div>
  );
};

export default ValidationPanel;
