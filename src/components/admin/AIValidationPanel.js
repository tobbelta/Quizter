/**
 * Panel för AI-baserad validering av frågor
 * Kontrollerar att rätt svar verkligen är rätt och att inga andra alternativ också är korrekta
 */
import React, { useState } from 'react';
import { questionService } from '../../services/questionService';

const AIValidationPanel = () => {
  const [validationResults, setValidationResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState('anthropic');

  const runAIValidation = async () => {
    setLoading(true);
    try {
      const allQuestions = questionService.listAll();

      // Ta en mindre batch för testning (kan expanderas)
      const questionsToValidate = allQuestions.slice(0, 10);

      const results = [];

      for (const question of questionsToValidate) {
        const langData = question.languages?.sv || {
          text: question.text,
          options: question.options,
          explanation: question.explanation
        };

        // Anropa backend för AI-validering
        try {
          const response = await fetch(
            'https://europe-west1-geoquest2-7e45c.cloudfunctions.net/validateQuestionWithAI',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                question: langData.text,
                options: langData.options,
                correctOption: question.correctOption,
                explanation: langData.explanation,
                provider: provider
              })
            }
          );

          const data = await response.json();

          if (data.valid === false) {
            results.push({
              questionId: question.id,
              questionText: langData.text,
              issues: data.issues || [],
              correctOption: question.correctOption,
              suggestedCorrectOption: data.suggestedCorrectOption
            });
          }
        } catch (error) {
          console.error(`Fel vid AI-validering av ${question.id}:`, error);
        }
      }

      setValidationResults({
        total: questionsToValidate.length,
        valid: questionsToValidate.length - results.length,
        invalid: results.length,
        issues: results
      });
    } catch (error) {
      console.error('Fel vid AI-validering:', error);
      alert('Kunde inte köra AI-validering: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">AI-validering av frågor</h2>
          <p className="text-sm text-gray-400 mt-1">
            Kontrollerar att rätt svar är korrekt och att inga andra alternativ också kan vara rätt
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
          >
            <option value="anthropic">Anthropic Claude</option>
            <option value="openai">OpenAI GPT-4</option>
            <option value="gemini">Google Gemini</option>
          </select>
          <button
            onClick={runAIValidation}
            disabled={loading}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg font-semibold hover:bg-purple-400 disabled:bg-slate-600 disabled:text-gray-400"
          >
            {loading ? '🤖 Validerar...' : '🤖 AI-Validera frågor'}
          </button>
        </div>
      </div>

      {/* Varning om kostnad */}
      <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
        <div className="text-sm text-amber-300">
          ⚠️ <strong>Obs:</strong> AI-validering kostar pengar (API-anrop). Validerar för närvarande 10 frågor åt gången.
        </div>
      </div>

      {/* Resultat */}
      {validationResults && (
        <div className="space-y-4">
          {/* Översikt */}
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-3">Översikt</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-cyan-400">{validationResults.total}</div>
                <div className="text-sm text-gray-400 mt-1">Validerade</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400">{validationResults.valid}</div>
                <div className="text-sm text-gray-400 mt-1">Korrekta</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-400">{validationResults.invalid}</div>
                <div className="text-sm text-gray-400 mt-1">Problem</div>
              </div>
            </div>
          </div>

          {/* Problem */}
          {validationResults.invalid > 0 ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-red-400 mb-3">
                ⚠️ Hittade {validationResults.invalid} frågor med problem
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {validationResults.issues.map((issue, index) => (
                  <div
                    key={issue.questionId || index}
                    className="bg-slate-900 rounded p-3 border border-red-500/20"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-xs px-1.5 py-0.5 bg-slate-800 text-cyan-400 rounded font-mono">
                            {issue.questionId}
                          </code>
                          <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-300 rounded">
                            Svar: Alternativ {issue.correctOption + 1}
                          </span>
                          {issue.suggestedCorrectOption !== undefined && issue.suggestedCorrectOption !== issue.correctOption && (
                            <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-300 rounded">
                              AI föreslår: Alternativ {issue.suggestedCorrectOption + 1}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-white mb-2">
                          {issue.questionText}
                        </div>
                        <div className="space-y-1">
                          {issue.issues.map((problem, i) => (
                            <div key={i} className="text-xs text-red-300 flex items-start gap-2">
                              <span className="text-red-400">•</span>
                              <span>{problem}</span>
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
                Alla validerade frågor är korrekta!
              </div>
              <div className="text-sm text-gray-400 mt-2">
                AI:n hittade inga problem med de {validationResults.total} validerade frågorna.
              </div>
            </div>
          )}
        </div>
      )}

      {!validationResults && !loading && (
        <div className="text-center py-8 text-gray-400">
          Klicka på "🤖 AI-Validera frågor" för att börja
        </div>
      )}
    </div>
  );
};

export default AIValidationPanel;
