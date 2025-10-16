/**
 * Panel för AI-baserad validering av frågor
 * Kontrollerar att rätt svar verkligen är rätt och att inga andra alternativ också är korrekta
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { questionService } from '../../services/questionService';
import { aiService } from '../../services/aiService';
import { taskService } from '../../services/taskService';
import { useBackgroundTasks } from '../../context/BackgroundTaskContext';
import MessageDialog from '../shared/MessageDialog';

const AIValidationPanel = () => {
  const [validationResults, setValidationResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [providerStatus, setProviderStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState(null);
  const [includeAllQuestions, setIncludeAllQuestions] = useState(false);
  const [maxQuestions, setMaxQuestions] = useState(50);
  const [limitQuestions, setLimitQuestions] = useState(true);
  const { registerTask } = useBackgroundTasks();
  const isMountedRef = useRef(true);
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadProviderStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);

    try {
      const response = await fetch('https://europe-west1-geoquest2-7e45c.cloudfunctions.net/getAIStatus');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (isMountedRef.current) {
        setProviderStatus(data.providers || null);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setStatusError(error.message || 'Okänt fel');
        setProviderStatus(null);
      }
    } finally {
      if (isMountedRef.current) {
        setStatusLoading(false);
      }
    }
  }, []);

  const runAIValidation = async () => {
    setLoading(true);
    setValidationResults(null);
    try {
      const allQuestions = await questionService.loadAllQuestions();

      const unvalidatedQuestions = allQuestions.filter(
        (q) => !q.aiValidated && !q.manuallyApproved && !q.manuallyRejected && !q.reported
      );

      let questionsToValidate = includeAllQuestions ? allQuestions : unvalidatedQuestions;

      // Begränsa antalet frågor om limitQuestions är aktiverat
      if (limitQuestions && maxQuestions > 0 && questionsToValidate.length > maxQuestions) {
        questionsToValidate = questionsToValidate.slice(0, maxQuestions);
      }

      if (questionsToValidate.length === 0) {
        setDialogConfig({
          isOpen: true,
          title: 'Inga frågor att validera',
          message: '✅ Det finns inga frågor att validera just nu.',
          type: 'info'
        });
        return;
      }

      // Bygg batch-payload
      const batchQuestions = questionsToValidate.map(question => {
        const langData = question.languages?.sv || {
          text: question.text,
          options: question.options,
          explanation: question.explanation,
        };

        return {
          id: question.id,
          question: langData.text,
          options: langData.options,
          correctOption: question.correctOption,
          explanation: langData.explanation,
        };
      });

      // Starta ETT batch-jobb
      const { taskId } = await aiService.startBatchAIValidation({ questions: batchQuestions });

      // Registrera bakgrundsjobb
      if (taskId) {
        const descriptionParts = [`${batchQuestions.length} frågor`];
        if (includeAllQuestions) {
          descriptionParts.push('inkl. redan validerade');
        }
        if (limitQuestions) {
          descriptionParts.push(`max ${maxQuestions}`);
        }

        registerTask(taskId, {
          taskType: 'batchvalidation',
          label: 'AI-validering (batch)',
          description: descriptionParts.join(' · '),
          createdAt: new Date(),
        });
      }

      if (!taskId) {
        throw new Error('Bakgrundsjobbet saknar taskId.');
      }

      // Vänta på att batch-jobbet blir klart
      const taskData = await taskService.waitForCompletion(taskId);

      const batchResult = taskData?.result || {};
      const validationResults = batchResult.results || [];

      // Bygg validationUpdates och results från batch-resultatet
      const results = [];
      const validationUpdates = [];

      for (const result of validationResults) {
        const question = questionsToValidate.find(q => q.id === result.questionId);
        if (!question) continue;

        const langData = question.languages?.sv || {
          text: question.text,
          options: question.options,
          explanation: question.explanation,
        };

        const validationResult = {
          valid: result.valid,
          issues: Array.isArray(result.issues) ? result.issues : [],
          suggestedCorrectOption: result.suggestedCorrectOption,
          reasoning: result.reasoning || '',
          providerResults: result.providerResults,
          providersChecked: result.providersChecked,
        };

        validationUpdates.push({
          questionId: result.questionId,
          valid: validationResult.valid,
          validationData: validationResult
        });

        // Samla ogiltiga frågor för UI-visning
        if (!result.valid) {
          results.push({
            questionId: result.questionId,
            questionText: langData.text,
            issues: result.issues || [],
            correctOption: question.correctOption,
            suggestedCorrectOption: result.suggestedCorrectOption,
          });
        }
      }

      // KRITISKT: Spara alla valideringsresultat till Firestore
      if (validationUpdates.length > 0) {
        try {
          await questionService.markManyAsValidated(validationUpdates);
        } catch (error) {
          console.error('[AIValidationPanel] ❌ Fel vid sparande till Firestore:', error);
          throw error;
        }
      }

      if (isMountedRef.current) {
        setValidationResults({
          total: questionsToValidate.length,
          valid: questionsToValidate.length - results.length,
          invalid: results.length,
          issues: results,
        });
      }
    } catch (error) {
      console.error('Fel vid AI-validering:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid AI-validering',
        message: 'Kunde inte köra AI-validering: ' + error.message,
        type: 'error'
      });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-white">AI-validering av frågor</h2>
            <p className="text-sm text-gray-400 mt-1">
              Validerar med alla tillgängliga AI-providers (Anthropic, Gemini, OpenAI)
            </p>
          </div>
        </div>

        {/* Kontroller */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Antal frågor */}
          <div>
            <label className="block text-xs font-semibold text-cyan-200 mb-2">
              Antal frågor att validera
            </label>
            <input
              type="number"
              min="1"
              max="1000"
              value={maxQuestions}
              onChange={(e) => setMaxQuestions(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={loading || !limitQuestions}
              className="w-full rounded bg-slate-900 border border-slate-600 px-3 py-2 text-white text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Checkboxes */}
          <div className="flex flex-col gap-2 justify-end">
            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={limitQuestions}
                onChange={(event) => setLimitQuestions(event.target.checked)}
                disabled={loading}
                className="h-4 w-4 rounded border-slate-500 bg-slate-800 text-purple-500 focus:ring-purple-400"
              />
              Begränsa antal frågor
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={includeAllQuestions}
                onChange={(event) => setIncludeAllQuestions(event.target.checked)}
                disabled={loading}
                className="h-4 w-4 rounded border-slate-500 bg-slate-800 text-purple-500 focus:ring-purple-400"
              />
              Inkludera redan validerade frågor
            </label>
          </div>

          {/* Validera-knapp */}
          <div className="flex items-end">
            <button
              onClick={runAIValidation}
              disabled={loading}
              className="w-full px-4 py-2 bg-purple-500 text-white rounded-lg font-semibold hover:bg-purple-400 disabled:bg-slate-600 disabled:text-gray-400 transition-colors"
            >
              {loading ? '🤖 Validerar...' : `🤖 Validera ${limitQuestions ? `${maxQuestions}` : 'alla'} frågor`}
            </button>
          </div>
        </div>
      </div>

      {/* Varning om kostnad */}
      <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
        <div className="text-sm text-amber-300">
          ⚠️ <strong>Obs:</strong> AI-validering kostar pengar (API-anrop). {limitQuestions ? `Kommer att validera upp till ${maxQuestions} frågor.` : 'Kommer att validera alla frågor.'} {includeAllQuestions ? 'Inkluderar redan validerade frågor.' : 'Validerar endast frågor som inte redan är validerade.'}
        </div>
      </div>

      {/* Providerstatus */}
      <div className="mb-6 bg-slate-900 rounded-lg border border-slate-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-white">AI-providerstatus</h3>
            <p className="text-xs text-gray-400 mt-1">Kontrollerar Anthropic, Gemini och OpenAI</p>
          </div>
          <button
            onClick={loadProviderStatus}
            disabled={statusLoading}
            className="text-xs px-3 py-1 border border-cyan-500/40 text-cyan-200 rounded hover:bg-cyan-500/10 disabled:opacity-50"
          >
            ↻ Uppdatera
          </button>
        </div>

        {statusLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-400" />
            Kontrollerar providers...
          </div>
        ) : statusError ? (
          <div className="text-sm text-red-300">
            Kunde inte läsa status: {statusError}
          </div>
        ) : providerStatus ? (
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(providerStatus).map(([provider, status]) => {
              const available = status.available;
              const configured = status.configured;
              const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);
              return (
                <div
                  key={provider}
                  className={`rounded-lg p-3 text-sm border ${
                    available
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-red-500/40 bg-red-500/10 text-red-200'
                  }`}
                >
                  <div className="font-semibold">{providerLabel}</div>
                  <div className="text-xs mt-1">
                    {configured ? (available ? 'Tillgänglig' : 'Ej tillgänglig') : 'Inte konfigurerad'}
                  </div>
                  {status.model && (
                    <div className="text-[11px] text-gray-200/80 mt-1">
                      Modell: {status.model}
                    </div>
                  )}
                  {!available && status.error && (
                    <div className="text-[11px] text-red-200/90 mt-2">
                      Fel: {status.error}
                    </div>
                  )}
                  {status.errorStatus && (
                    <div className="text-[11px] text-red-200/70 mt-1">
                      Statuskod: {status.errorStatus}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-gray-400">
            Ingen statusinformation tillgänglig.
          </div>
        )}
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

      <MessageDialog
        isOpen={dialogConfig.isOpen}
        onClose={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
      />
    </div>
  );
};

export default AIValidationPanel;
