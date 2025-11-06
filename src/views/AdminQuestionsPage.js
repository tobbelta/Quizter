/**
 * Admin-sida för att hantera och visa tillgängliga frågor.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// ...removed legacy Firestore imports...
// ...existing code...
import { useAuth } from '../context/AuthContext';
import { questionService } from '../services/questionService';
import { aiService } from '../services/aiService';
import { taskService } from '../services/taskService';
import { useBackgroundTasks } from '../context/BackgroundTaskContext';
import Header from '../components/layout/Header';
import Pagination from '../components/shared/Pagination';
import { questionRepository } from '../repositories/questionRepository';
import MessageDialog from '../components/shared/MessageDialog';

const QuestionCard = ({
  question,
  index,
  expandedQuestion,
  setExpandedQuestion,
  handleDeleteQuestion,
  handleManualApprove,
  handleManualReject,
  handleApproveReported,
  handleRejectReported,
  isSelected,
  onSelect,
  registerTask,
  validatingQuestions,
  regeneratingEmojis,
  onValidationStart,
  onValidationEnd,
  onEmojiRegenerationStart,
  onEmojiRegenerationEnd,
  setIndividualValidationTasks,
  setDialogConfig
}) => {
  const [currentLang, setCurrentLang] = useState('sv');

  // Hämta data för valt språk
  const svLang = question.languages?.sv || { text: question.text, options: question.options, explanation: question.explanation };
  const enLang = question.languages?.en;

  const isExpanded = expandedQuestion === question.id;

  const displayLang = currentLang === 'sv' ? svLang : enLang;
  const hasBothLanguages = svLang && enLang;
  const categories = Array.isArray(question.categories)
    ? question.categories
    : question.category
      ? [question.category]
      : [];
  const ageGroups = Array.isArray(question.ageGroups) ? question.ageGroups : [];
  const formattedAgeGroups = ageGroups.map((group) => {
    switch (group) {
      case 'children':
        return 'Barn';
      case 'youth':
        return 'Ungdom';
      case 'adults':
        return 'Vuxna';
      default:
        return group;
    }
  });
  const targetAudience = question.targetAudience;

  const handleRegenerateEmoji = async () => {
    if (regeneratingEmojis && regeneratingEmojis.has(question.id)) {
      return; // Already regenerating
    }

    if (onEmojiRegenerationStart) {
      onEmojiRegenerationStart(question.id);
    }
    try {
      const response = await questionService.regenerateEmoji(question.id);
      
      // Show immediate success feedback for synchronous operation
      if (response && response.success) {
        setDialogConfig({
          isOpen: true,
          title: '🎨 Emoji-regenerering lyckades',
          message: response.emoji ? 
            `Ny emoji genererad: ${response.emoji}\nProvider: ${response.provider || 'okänd'}` :
            'Nya emojis har genererats för frågan',
          type: 'success'
        });
      }
      
      // Legacy: Register task for background monitoring if taskId is returned (for older API responses)
      if (response?.taskId && typeof registerTask === 'function') {
        registerTask(response.taskId, {
          taskType: 'regenerateemoji',
          label: 'Emoji-regenerering',
          description: `Genererar nya emojis för fråga ${question.id}`,
          createdAt: new Date()
        });
      }
    } catch (error) {
      console.error('[AdminQuestionsPage] Kunde inte regenerera emojis:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid emoji-generering',
        message: `Kunde inte generera emojis: ${error.message}`,
        type: 'error'
      });
    } finally {
      if (onEmojiRegenerationEnd) {
        onEmojiRegenerationEnd(question.id);
      }
    }
  };

  const handleValidateWithAI = async () => {
    if (!question.id) return;

    if (validatingQuestions && validatingQuestions.has(question.id)) {
      return; // Already validating
    }

    if (onValidationStart) {
      onValidationStart(question.id);
    }

    try {
      const response = await questionService.validateSingleQuestion(question.id);
      
        // Since validation is now synchronous, show immediate feedback
        if (response.success && response.result) {
          const { isValid, feedback, details } = response.result;
          
          // Build detailed message with AI analysis
          let detailedMessage = feedback || (isValid ? 'Frågan godkändes av AI' : 'Frågan underkändes av AI');
          
          if (details) {
            if (details.confidence !== undefined) {
              detailedMessage += `\n\n📊 Konfidensgrad: ${details.confidence}%`;
            }
            
            if (details.issues && details.issues.length > 0) {
              detailedMessage += '\n\n⚠️ Identifierade problem:';
              details.issues.forEach(issue => {
                detailedMessage += `\n• ${issue}`;
              });
            }
            
            if (details.suggestions && details.suggestions.length > 0) {
              detailedMessage += '\n\n💡 Förbättringsförslag:';
              details.suggestions.forEach(suggestion => {
                detailedMessage += `\n• ${suggestion}`;
              });
            }
          }
          
          setDialogConfig({
            isOpen: true,
            title: isValid ? '✅ AI-validering lyckades' : '❌ AI-validering misslyckades',
            message: detailedMessage,
            type: isValid ? 'success' : 'warning'
          });

          // Note: Question list will be refreshed automatically by cache update in questionService
        }    } catch (error) {
      console.error('[AdminQuestionsPage] Kunde inte starta AI-validering:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid AI-validering',
        message: `Kunde inte starta AI-validering: ${error.message}`,
        type: 'error'
      });
    } finally {
      if (onValidationEnd) {
        onValidationEnd(question.id);
      }
    }
  };

  const rawAiResult = question.aiValidationResult;
  const structureResult =
    question.structureValidationResult ||
    (rawAiResult?.validationType === 'structure' ? rawAiResult : null);
  const aiResult =
    rawAiResult && rawAiResult.validationType !== 'structure' ? rawAiResult : null;

  const hasStructurePass = structureResult?.valid === true;
  const hasStructureIssue = structureResult?.valid === false;

  const aiPassed =
    question.manuallyApproved === true ||
    question.aiValidated === true ||
    (aiResult?.valid === true);
  const hasAiIssue =
    question.manuallyRejected === true ||
    (aiResult && aiResult.valid === false);

  return (
    <div className={`rounded-lg border transition-all duration-300 p-4 ${
      validatingQuestions && validatingQuestions.has(question.id)
        ? 'border-yellow-400 bg-yellow-50/5 animate-pulse' 
        : regeneratingEmojis && regeneratingEmojis.has(question.id)
          ? 'border-blue-400 bg-blue-50/5 animate-pulse'
          : isSelected 
            ? 'border-cyan-500 bg-slate-900/60' 
            : 'border-slate-700 bg-slate-900/60'
    }`}>
      <div className="flex items-start gap-4">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(question.id)}
          className="mt-1 h-5 w-5 rounded border-gray-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
        />
        <div className="flex-1">
          {/* Validation status indicator */}
          {validatingQuestions && validatingQuestions.has(question.id) && (
            <div className="mb-2 flex items-center text-yellow-400">
              <div className="animate-spin mr-2">⏳</div>
              <span className="text-sm font-medium">AI-validering pågår...</span>
            </div>
          )}

          {/* Emoji regeneration status indicator */}
          {regeneratingEmojis && regeneratingEmojis.has(question.id) && (
            <div className="mb-2 flex items-center text-blue-400">
              <div className="animate-spin mr-2">🎨</div>
              <span className="text-sm font-medium">Emoji-regenerering pågår...</span>
            </div>
          )}

          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <span className="text-sm font-mono text-gray-400">#{index + 1}</span>
                {/* AI-Valideringsstatus */}
                {question.reported === true && (
                  <span className="inline-flex items-center rounded-full bg-yellow-500/20 px-2.5 py-0.5 text-xs font-medium text-yellow-300" title="Rapporterad av användare - i karantän">
                    ⚠️ Rapporterad ({question.reportCount || 1})
                  </span>
                )}
                {question.aiValidated === true && question.manuallyApproved === true && !question.reported && (
                  <span className="inline-flex items-center rounded-full bg-blue-500/20 px-2.5 py-0.5 text-xs font-medium text-blue-300" title="Manuellt godkänd efter granskning">
                    ✓ Manuell OK
                  </span>
                )}
                {question.manuallyRejected === true && !question.reported && (
                  <span className="inline-flex items-center rounded-full bg-orange-500/20 px-2.5 py-0.5 text-xs font-medium text-orange-300" title="Manuellt underkänd efter granskning">
                    ✗ Manuellt underkänd
                  </span>
                )}
                {hasStructureIssue && (
                  <span className="inline-flex items-center rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-medium text-red-300" title="Strukturvalidering - problem hittades">
                    ✗ Struktur-fel
                  </span>
                )}
                {hasStructurePass && !hasStructureIssue && (
                  <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-200" title="Strukturvalidering - godkänd">
                    ✓ Struktur-OK
                  </span>
                )}
                {aiPassed && question.manuallyRejected !== true && (
                  <span className="inline-flex items-center rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs font-medium text-green-300" title="AI-validerad - Alla providers godkände">
                    ✓ AI-OK
                  </span>
                )}
                {hasAiIssue && (
                  <span className="inline-flex items-center rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-medium text-red-300" title="AI-validering - problem hittades">
                    ✗ AI-fel
                  </span>
                )}

                {question.createdAt && (
                  <span className="text-xs text-gray-500">
                    {question.createdAt.toDate ?
                      question.createdAt.toDate().toLocaleString('sv-SE', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) :
                      new Date(question.createdAt).toLocaleString('sv-SE', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    }
                  </span>
                )}
                {formattedAgeGroups.map((label, idx) => (
                  <span key={`age-${question.id}-${label}-${idx}`} className="inline-flex items-center rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-xs font-medium text-cyan-200">
                    {label}
                  </span>
                ))}
                {categories.map((categoryName, idx) => (
                  <span key={`cat-${question.id}-${categoryName}-${idx}`} className="inline-flex items-center rounded-full bg-purple-500/20 px-2.5 py-0.5 text-xs font-medium text-purple-200">
                    {categoryName}
                  </span>
                ))}
                {targetAudience && (
                  <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-200">
                    {targetAudience === 'swedish' ? 'Svensk målgrupp' : targetAudience}
                  </span>
                )}
                {question.difficulty && (
                  <span className="inline-flex items-center rounded-full bg-slate-700/60 px-2.5 py-0.5 text-xs font-medium text-gray-200">
                    {question.difficulty === 'kid'
                      ? 'Legacy: Barn'
                      : question.difficulty === 'family'
                      ? 'Legacy: Familj'
                      : question.difficulty === 'adult'
                      ? 'Legacy: Vuxen'
                      : `Legacy: ${question.difficulty}`}
                  </span>
                )}
                {hasBothLanguages && (
                  <div className="flex items-center rounded-full bg-slate-800 p-0.5">
                    <button onClick={() => setCurrentLang('sv')} className={`px-2 py-0.5 text-xs rounded-full ${currentLang === 'sv' ? 'bg-cyan-500 text-black' : 'text-gray-300'}`}>SV</button>
                    <button onClick={() => setCurrentLang('en')} className={`px-2 py-0.5 text-xs rounded-full ${currentLang === 'en' ? 'bg-cyan-500 text-black' : 'text-gray-300'}`}>EN</button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                {question.emoji && (
                  <span className="text-2xl" title="Emoji">
                    {question.emoji}
                  </span>
                )}
                <button
                  onClick={() => setExpandedQuestion(isExpanded ? null : question.id)}
                  className="text-lg font-semibold text-left hover:text-cyan-300 transition-colors flex-1"
                >
                  {displayLang?.text || (currentLang === 'en' ? '(No English text)' : '(Ingen svensk text)')}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              {question.reported === true ? (
                <>
                  <button
                    onClick={() => handleApproveReported(question.id)}
                    className="rounded bg-green-600 px-3 py-1 text-sm font-semibold text-white hover:bg-green-500"
                    title="Godkänn rapporterad fråga - ta bort från karantän"
                  >
                    ✓ Godkänn
                  </button>
                  <button
                    onClick={() => handleRejectReported(question.id)}
                    className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-500"
                    title="Underkänn rapporterad fråga"
                  >
                    ✗ Underkänn
                  </button>
                </>
              ) : (
                <>

                  {!question.manuallyApproved && (
                    <button
                      onClick={() => handleManualApprove(question.id)}
                      className="rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white hover:bg-blue-500"
                      title="Godkänn manuellt efter granskning"
                    >
                      ✓ Godkänn
                    </button>
                  )}
                  {!question.manuallyRejected && (
                    <button
                      onClick={() => handleManualReject(question.id)}
                      className="rounded bg-orange-600 px-3 py-1 text-sm font-semibold text-white hover:bg-orange-500"
                      title="Underkänn manuellt"
                    >
                      ✗ Underkänn
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteQuestion(question.id)}
                    className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-500"
                  >
                    Ta bort
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-slate-700 space-y-4">
          {/* Metadata sektion */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-slate-800/40 rounded border border-slate-600 p-3">
              <p className="text-xs font-semibold text-gray-400 mb-2">📊 Metadata</p>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Svårighetsgrad:</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    question.difficulty === 'easy' ? 'bg-green-500/20 text-green-300' :
                    question.difficulty === 'hard' ? 'bg-red-500/20 text-red-300' :
                    'bg-yellow-500/20 text-yellow-300'
                  }`}>
                    {question.difficulty === 'easy' ? 'Lätt' : question.difficulty === 'medium' ? 'Medel' : 'Svår'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Målgrupp:</span>
                  <span className="text-xs text-gray-200">
                    {question.targetAudience === 'swedish' ? '🇸🇪 Svensk' : '🌍 Global'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Åldersgrupper:</span>
                  <span className="text-xs text-gray-200">
                    {formattedAgeGroups.length > 0 ? formattedAgeGroups.join(', ') : 'Alla åldrar'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Kategorier:</span>
                  <span className="text-xs text-gray-200">
                    {categories.length > 0 ? categories.join(', ') : 'Allmän'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/40 rounded border border-slate-600 p-3">
              <p className="text-xs font-semibold text-gray-400 mb-2">🤖 AI-Information</p>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Provider:</span>
                  <span className="text-xs text-gray-200 capitalize">
                    {question.provider || 'Ej angivet'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Modell:</span>
                  <span className="text-xs text-gray-200">
                    {question.model || 'Ej angivet'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Skapad av:</span>
                  <span className="text-xs text-gray-200">
                    {question.createdBy || 'system'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Skapad:</span>
                  <span className="text-xs text-gray-200">
                    {question.createdAt ? new Date(question.createdAt).toLocaleString('sv-SE', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : 'Okänt'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Illustration (Emoji eller SVG) */}
          {question.emoji && (
            <div className="bg-slate-800/40 rounded border border-slate-600 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-300">Illustration:</p>
              </div>
              <div className="mx-auto w-full max-w-xs">
                <div className="flex items-center justify-center py-8">
                  <span className="text-8xl" role="img" aria-label="Question illustration">
                    {question.emoji}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Gamla illustration-koden (för bakåtkompatibilitet med gamla frågor) */}
          {question.illustration && (() => {
            // Stöd både nya och gamla fältnamn
            const illustrationDate = question.illustrationGeneratedAt || question.migrationSvgUpdatedAt;
            const illustrationProvider = question.illustrationProvider || question.migrationSvgProvider;

            // Kolla om det är emoji eller SVG
            const isSvg = question.illustration.includes('<svg');
            const isEmoji = !isSvg;

            return (
              <div className="bg-slate-800/40 rounded border border-slate-600 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-300">Illustration:</p>
                  {(illustrationDate || illustrationProvider) && (
                    <p className="text-xs text-gray-400">
                      {illustrationDate && (
                        <>
                          {illustrationDate.toDate ?
                            illustrationDate.toDate().toLocaleString('sv-SE', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) :
                            new Date(illustrationDate).toLocaleString('sv-SE', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                        </>
                      )}
                      {illustrationProvider && ` · ${illustrationProvider.charAt(0).toUpperCase() + illustrationProvider.slice(1)}`}
                    </p>
                  )}
                </div>
                <div className="mx-auto w-full max-w-xs">
                  {isEmoji ? (
                    <div className="flex items-center justify-center py-8">
                      <span className="text-8xl" role="img" aria-label="Question illustration">
                        {question.illustration}
                      </span>
                    </div>
                  ) : (
                    <div
                      className="rounded bg-white/5 p-3 shadow-inner [&_svg]:mx-auto [&_svg]:block [&_svg]:h-auto [&_svg]:max-h-60 [&_svg]:w-full"
                      dangerouslySetInnerHTML={{ __html: question.illustration }}
                    />
                  )}
                </div>
              </div>
            );
          })()}

          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-300 mb-2">Svarsalternativ ({currentLang.toUpperCase()}):</p>
            {(displayLang?.options || []).map((option, optionIndex) => (
              <div
                key={optionIndex}
                className={`flex items-center gap-3 rounded border px-3 py-2 ${
                  optionIndex === question.correctOption
                    ? 'border-emerald-500 bg-emerald-500/20 text-emerald-100'
                    : 'border-slate-600 bg-slate-800/40 text-gray-300'
                }`}
              >
                <span className="text-sm font-mono">
                  {String.fromCharCode(65 + optionIndex)}:
                </span>
                <span>{option}</span>
                {optionIndex === question.correctOption && (
                  <span className="ml-auto text-xs font-semibold text-emerald-200">
                    RÄTT SVAR
                  </span>
                )}
              </div>
            ))}
          </div>

          {displayLang?.explanation && (
            <div className="p-3 bg-slate-800/40 rounded border border-slate-600">
              <p className="text-sm font-semibold text-gray-300 mb-1">Förklaring ({currentLang.toUpperCase()}):</p>
              <p className="text-sm text-gray-300">{displayLang.explanation}</p>
            </div>
          )}

          {/* Strukturvalidering */}
          {structureResult && (
            <div
              className={`p-4 rounded border ${
                structureResult.valid
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-sm font-bold ${
                    structureResult.valid ? 'text-emerald-300' : 'text-red-300'
                  }`}
                >
                  {structureResult.valid
                    ? '✓ Strukturvalidering: GODKÄND'
                    : '✗ Strukturvalidering: UNDERKÄND'}
                </span>
              </div>

              {structureResult.issues && structureResult.issues.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-red-300 mb-1">Problem:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {structureResult.issues.map((issue, idx) => (
                      <li key={`structure-issue-${idx}`} className="text-xs text-red-200">
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {structureResult.reasoning && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-gray-300 mb-1">Motivering:</p>
                  <p className="text-xs text-gray-300 whitespace-pre-wrap">{structureResult.reasoning}</p>
                </div>
              )}

              {structureResult.checkedAt && (
                <p className="text-xs text-gray-400 mt-2">
                  Kontrollerad: {new Date(structureResult.checkedAt).toLocaleString('sv-SE')}
                </p>
              )}
            </div>
          )}

          {/* AI-Valideringsresultat */}
          {aiResult && (
            <div
              className={`p-4 rounded border ${
                question.manuallyRejected
                  ? 'bg-orange-500/10 border-orange-500/30'
                  : question.aiValidated
                  ? question.manuallyApproved
                    ? 'bg-blue-500/10 border-blue-500/30'
                    : 'bg-green-500/10 border-green-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm font-bold ${
                  question.manuallyRejected ? 'text-orange-300' :
                  question.aiValidated ? (question.manuallyApproved ? 'text-blue-300' : 'text-green-300') : 'text-red-300'
                }`}>
                  {question.manuallyRejected
                    ? '✗ Manuellt underkänd'
                    : aiResult.validationType === 'manual'
                    ? '✓ Manuellt godkänd'
                    : (question.aiValidated ? '✓ AI-validering: GODKÄND' : '✗ AI-validering: UNDERKÄND')
                  }
                </span>
                {aiResult.providersChecked && (
                  <span className="text-xs text-gray-400">
                    ({aiResult.providersChecked} providers)
                  </span>
                )}
              </div>

              {aiResult.issues && aiResult.issues.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-red-300 mb-1">Problem:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {aiResult.issues.map((issue, idx) => (
                      <li key={idx} className="text-xs text-red-200">{issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              {aiResult.suggestions && aiResult.suggestions.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-blue-300 mb-1">Förbättringsförslag:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {aiResult.suggestions.map((suggestion, idx) => (
                      <li key={idx} className="text-xs text-blue-200">{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(aiResult.feedback || aiResult.reasoning) && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-gray-300 mb-1">
                    {aiResult.feedback ? 'AI-feedback:' : 'Motivering:'}
                  </p>
                  <p className="text-xs text-gray-300 whitespace-pre-wrap">
                    {aiResult.feedback || aiResult.reasoning}
                  </p>
                </div>
              )}

              {(aiResult.confidence || aiResult.provider || aiResult.model) && (
                <div className="mb-2 flex flex-wrap gap-3 text-xs text-gray-400">
                  {aiResult.provider && (
                    <span>Provider: <span className="text-gray-300">{aiResult.provider}</span></span>
                  )}
                  {aiResult.model && (
                    <span>Model: <span className="text-gray-300">{aiResult.model}</span></span>
                  )}
                  {aiResult.confidence && (
                    <span>Konfidens: <span className="text-gray-300">{aiResult.confidence}%</span></span>
                  )}
                </div>
              )}

              {aiResult.providerResults && (
                <div className="mt-3 pt-3 border-t border-slate-600">
                  <p className="text-xs font-semibold text-gray-300 mb-2">Provider-resultat:</p>
                  <div className="space-y-2">
                    {Object.entries(aiResult.providerResults).map(([provider, result]) => {
                      const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);
                      let statusClass = 'text-amber-300';
                      let statusIcon = '⚠';
                      let statusText = result?.error || 'Otillgänglig';

                      if (result?.valid === true) {
                        statusClass = 'text-green-300';
                        statusIcon = '✓';
                        statusText = 'Godkänd';
                      } else if (result?.valid === false) {
                        statusClass = 'text-red-300';
                        statusIcon = '✗';
                        statusText = Array.isArray(result?.issues) && result.issues.length > 0
                          ? result.issues.join(', ')
                          : 'Underkänd';
                      }

                      return (
                        <div key={provider} className="flex items-start gap-2">
                          <span className={`text-xs font-bold ${statusClass}`}>
                            {statusIcon} {providerLabel}:
                          </span>
                          <span className="text-xs text-gray-300 flex-1">
                            {statusText}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {question.manuallyApprovedAt && (
                <p className="text-xs text-gray-400 mt-2">
                  Manuellt godkänd: {question.manuallyApprovedAt.toDate ?
                    question.manuallyApprovedAt.toDate().toLocaleString('sv-SE') :
                    new Date(question.manuallyApprovedAt).toLocaleString('sv-SE')}
                </p>
              )}
              {question.manuallyRejectedAt && (
                <p className="text-xs text-gray-400 mt-2">
                  Manuellt underkänd: {question.manuallyRejectedAt.toDate ?
                    question.manuallyRejectedAt.toDate().toLocaleString('sv-SE') :
                    new Date(question.manuallyRejectedAt).toLocaleString('sv-SE')}
                </p>
              )}
              {question.aiValidatedAt && !question.manuallyApprovedAt && !question.manuallyRejectedAt && (
                <p className="text-xs text-gray-400 mt-2">
                  Validerad: {question.aiValidatedAt.toDate ?
                    question.aiValidatedAt.toDate().toLocaleString('sv-SE') :
                    new Date(question.aiValidatedAt).toLocaleString('sv-SE')}
                </p>
              )}
            </div>
          )}

          {/* Rapporter */}
          {question.reports && question.reports.length > 0 && (
            <div className="p-4 rounded border bg-yellow-500/10 border-yellow-500/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-yellow-300">
                  ⚠️ Användarrapporter ({question.reports.length})
                </span>
              </div>
              <div className="space-y-2">
                {question.reports.map((report, idx) => (
                  <div key={idx} className="bg-slate-900 rounded p-2 border border-yellow-500/20">
                    <div className="text-xs text-yellow-200 mb-1">
                      <strong>Rapporterad av:</strong> {report.reportedBy || 'Anonym'}
                    </div>
                    <div className="text-xs text-yellow-200 mb-1">
                      <strong>Anledning:</strong> {report.reason || 'Ingen anledning angiven'}
                    </div>
                    <div className="text-xs text-gray-400">
                      {report.reportedAt && new Date(report.reportedAt).toLocaleString('sv-SE')}
                      {report.resolved && (
                        <span className="ml-2 text-green-300">
                          ({report.resolution === 'approved' ? 'Godkänd' : 'Underkänd'} - {new Date(report.resolvedAt).toLocaleString('sv-SE')})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-sm text-gray-400 space-y-1">
            <p>ID: {question.id}</p>
            {question.source && <p>Källa: {question.source}</p>}
            {question.createdBy && <p>Skapad av: {question.createdBy}</p>}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-700">
            {/* Visa AI-valideringsknapp endast om frågan INTE är AI-validerad */}
            {!aiPassed && (
              <button
                onClick={handleValidateWithAI}
                disabled={validatingQuestions && validatingQuestions.has(question.id)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  validatingQuestions && validatingQuestions.has(question.id)
                    ? 'bg-gray-600 text-gray-400 opacity-50 cursor-not-allowed' 
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {validatingQuestions && validatingQuestions.has(question.id) ? '⏳ Validerar...' : '✅ AI-validera'}
              </button>
            )}

            <button
              onClick={handleRegenerateEmoji}
              disabled={(validatingQuestions && validatingQuestions.has(question.id)) || (regeneratingEmojis && regeneratingEmojis.has(question.id))}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                (validatingQuestions && validatingQuestions.has(question.id)) || (regeneratingEmojis && regeneratingEmojis.has(question.id))
                  ? 'bg-gray-600 text-gray-400 opacity-50 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {(regeneratingEmojis && regeneratingEmojis.has(question.id)) ? '⏳ Genererar...' : '🎨 Nya emojis'}
            </button>

            {question.reported === true && (
              <>
                <button
                  onClick={() => handleApproveReported(question.id)}
                  className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded-md"
                >
                  ✅ Godkänn rapport
                </button>
                <button
                  onClick={() => handleRejectReported(question.id)}
                  className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md"
                >
                  ❌ Underkänn rapport
                </button>
              </>
            )}

            <button
              onClick={() => handleDeleteQuestion(question.id)}
              className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md"
            >
              🗑️ Radera
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const AdminQuestionsPage = () => {
  const navigate = useNavigate();
  const { isSuperUser } = useAuth();
  const { registerTask } = useBackgroundTasks();
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [validatingQuestions, setValidatingQuestions] = useState(new Set());
  const [regeneratingEmojis, setRegeneratingEmojis] = useState(new Set());
  const [individualValidationTasks, setIndividualValidationTasks] = useState(new Map()); // Map: taskId -> questionId
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiAmount, setAiAmount] = useState(10);
  const [aiCategory, setAiCategory] = useState('');
  const [aiAgeGroup, setAiAgeGroup] = useState('');
  const [aiProvider, setAiProvider] = useState('random'); // random, gemini, anthropic, openai
  const [aiStatus, setAiStatus] = useState(null); // Status för alla providers
  const [loadingAiStatus, setLoadingAiStatus] = useState(false);
  const [expandedQuestion, setExpandedQuestion] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [validationStatusFilter, setValidationStatusFilter] = useState('all'); // 'all' | 'validated' | 'failed' | 'unvalidated' | 'reported'
  const [selectedAgeGroup, setSelectedAgeGroup] = useState('all');
  const [selectedAudience, setSelectedAudience] = useState('all');
  const [selectedQuestions, setSelectedQuestions] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const isMountedRef = useRef(true);
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    const loadQuestions = () => {
      try {
        setIsLoading(true);
        const allQuestions = questionService.listAll();
        setQuestions(allQuestions || []);
      } catch (error) {
        console.error('Kunde inte ladda frågor:', error);
        setQuestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadQuestions();

    // Prenumerera på uppdateringar
    const unsubscribe = questionService.subscribe((updatedQuestions) => {
      setQuestions(updatedQuestions || []);
    });

    return () => unsubscribe();
  }, []);

  // Redirect om användaren inte är SuperUser
  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
    }
  }, [isSuperUser, navigate]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Listen for background task updates to update validation status
  useEffect(() => {
    if (!isSuperUser) return;

  // TODO: Replace legacy backgroundTasks subscription with API polling or local state updates
    // For now, skip this logic. All background task state should be managed via API or local state.
  }, [isSuperUser, individualValidationTasks]);

  // Hämta AI-status när AI-dialogen öppnas
  useEffect(() => {
    if (showAIDialog && !aiStatus) {
      fetchAIStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAIDialog]);

  const fetchAIStatus = async () => {
    setLoadingAiStatus(true);
    try {
      const response = await fetch('/api/getProviderStatus');
      const data = await response.json();
      
      if (data.success) {
        // Convert array to object for compatibility
        const providersObj = {};
        data.providers.forEach(p => {
          providersObj[p.name] = {
            available: p.available,
            status: p.status,
            model: p.model,
            error: p.error,
            errorType: p.errorType
          };
        });
        
        setAiStatus(providersObj);
        
        // Select first available provider
        const available = data.providers.find(p => p.available);
        if (available) {
          setAiProvider(available.name);
        }
      }
    } catch (error) {
      console.error('Failed to fetch AI status:', error);
      setAiStatus({
        gemini: { available: false, status: 'error', error: 'Kunde inte hämta status' },
        anthropic: { available: false, status: 'error', error: 'Kunde inte hämta status' },
        openai: { available: false, status: 'error', error: 'Kunde inte hämta status' },
        mistral: { available: false, status: 'error', error: 'Kunde inte hämta status' }
      });
    } finally {
      setLoadingAiStatus(false);
    }
  };

  // Samla kategorier, målgrupper m.m. för filter
  const categorySet = new Set();
  const ageGroupSet = new Set();
  const audienceSet = new Set();

  questions.forEach((question) => {
    const categoryList = Array.isArray(question.categories)
      ? question.categories
      : question.category
        ? [question.category]
        : [];
    categoryList.forEach((category) => {
      if (category) {
        categorySet.add(category);
      }
    });

    const groups = Array.isArray(question.ageGroups) ? question.ageGroups : [];
    groups.forEach((group) => {
      if (group) {
        ageGroupSet.add(group);
      }
    });

    const audience = question.targetAudience || question.audience;
    if (audience) {
      audienceSet.add(audience);
    }
  });

  const categories = ['all', ...Array.from(categorySet).sort((a, b) => a.localeCompare(b, 'sv'))];
  const ageGroupOrder = ['children', 'youth', 'adults'];
  const ageGroupOptions = ['all', ...Array.from(ageGroupSet).sort((a, b) => {
    const order = ageGroupOrder.indexOf(a);
    const otherOrder = ageGroupOrder.indexOf(b);
    if (order === -1 || otherOrder === -1) {
      return a.localeCompare(b);
    }
    return order - otherOrder;
  })];
  const audienceOptions = ['all', ...Array.from(audienceSet).sort((a, b) => a.localeCompare(b, 'sv'))];

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const normalizedCategory = selectedCategory.toLowerCase();
  const normalizedAudience = selectedAudience.toLowerCase();

  // Filtrera frågor baserat på sökning, kategori och valideringsstatus
  const filteredQuestions = questions.filter((question) => {
    const svText = question.languages?.sv?.text || question.text || '';
    const enText = question.languages?.en?.text || '';
    const svOptions = question.languages?.sv?.options || question.options || [];
    const enOptions = question.languages?.en?.options || [];
    const categoryList = Array.isArray(question.categories)
      ? question.categories
      : question.category
        ? [question.category]
        : [];
    const lowerCaseCategories = categoryList.map((category) => (category || '').toLowerCase());
    const ageGroups = Array.isArray(question.ageGroups) ? question.ageGroups : [];
    const lowerCaseAgeGroups = ageGroups.map((group) => (group || '').toLowerCase());
    const audienceValue = (question.targetAudience || question.audience || '').toLowerCase();

    const matchesSearch =
      !normalizedSearch ||
      [
        svText,
        enText,
        ...svOptions,
        ...enOptions,
        question.id,
        ...categoryList,
        ...ageGroups,
        question.targetAudience,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedSearch));

    const matchesCategory =
      selectedCategory === 'all' || lowerCaseCategories.includes(normalizedCategory);

    const matchesAgeGroup =
      selectedAgeGroup === 'all' || lowerCaseAgeGroups.includes(selectedAgeGroup.toLowerCase());

    const matchesAudience =
      selectedAudience === 'all' || audienceValue === normalizedAudience;

    const rawAi = question.aiValidationResult;
    const structureResult =
      question.structureValidationResult ||
      (rawAi?.validationType === 'structure' ? rawAi : null);
    const aiResult =
      rawAi && rawAi.validationType !== 'structure' ? rawAi : null;

    const hasStructureResult = Boolean(structureResult);
    const structureValid = structureResult?.valid === true;
    const structureInvalid = structureResult?.valid === false;
    const aiValid =
      question.manuallyApproved === true ||
      question.aiValidated === true ||
      (aiResult?.valid === true);
    const aiInvalid =
      question.manuallyRejected === true ||
      (aiResult && aiResult.valid === false);

    let matchesValidationStatus = true;
    if (validationStatusFilter === 'validated') {
      matchesValidationStatus = aiValid && (!hasStructureResult || structureValid);
    } else if (validationStatusFilter === 'failed') {
      matchesValidationStatus = aiInvalid || structureInvalid;
    } else if (validationStatusFilter === 'unvalidated') {
      matchesValidationStatus =
        !hasStructureResult &&
        !aiValid &&
        !aiInvalid &&
        !question.reported;
    } else if (validationStatusFilter === 'reported') {
      matchesValidationStatus = question.reported === true;
    } else if (validationStatusFilter === 'manual-approved') {
      matchesValidationStatus = question.manuallyApproved === true;
    } else if (validationStatusFilter === 'manual-rejected') {
      matchesValidationStatus = question.manuallyRejected === true;
    } else if (validationStatusFilter === 'structure-approved') {
      matchesValidationStatus = structureValid;
    } else if (validationStatusFilter === 'structure-rejected') {
      matchesValidationStatus = structureInvalid;
    }

    return (
      matchesSearch &&
      matchesCategory &&
      matchesAgeGroup &&
      matchesAudience &&
      matchesValidationStatus
    );
  });

  // Paginering
  const paginatedQuestions = filteredQuestions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  /** Genererar frågor med AI */
  const handleGenerateAIQuestions = async () => {
    setIsGeneratingAI(true);
    setShowAIDialog(false);

    // Begär 50% fler frågor för att kompensera för dubletter och ogiltiga
    const requestAmount = Math.ceil(aiAmount * 1.5);

    try {
      const { taskId } = await aiService.startAIGeneration({
        amount: requestAmount,
        category: aiCategory || undefined,
        ageGroup: aiAgeGroup || undefined,
        provider: aiProvider,
      });

      if (taskId) {
        const providerLabel = aiProvider === 'random' ? 'Blandade providers' : aiProvider.toUpperCase();
        const descriptorParts = [];
        descriptorParts.push(`${aiAmount} frågor`);
        if (aiCategory) descriptorParts.push(aiCategory);
        if (aiAgeGroup) {
          const ageGroupLabels = {
            'children': 'Barn',
            'youth': 'Ungdomar',
            'adults': 'Vuxna'
          };
          descriptorParts.push(ageGroupLabels[aiAgeGroup] || aiAgeGroup);
        }
        descriptorParts.push(providerLabel);

        registerTask(taskId, {
          taskType: 'generation',
          label: 'AI-generering',
          description: descriptorParts.join(' · '),
          createdAt: new Date(),
        });
      }

      if (!taskId) {
        throw new Error('Bakgrundsjobbet saknar taskId.');
      }
      await taskService.waitForCompletion(taskId);

    } catch (error) {
      console.error('Kunde inte generera frågor:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid AI-generering',
        message: `Kunde inte generera frågor: ${error.message}`,
        type: 'error'
      });
    } finally {
      if (isMountedRef.current) {
        setIsGeneratingAI(false);
      }
    }
  };

  const handleManualApprove = async (questionId) => {
    if (!window.confirm('Godkänn denna fråga manuellt?\n\nDetta markerar frågan som validerad oavsett AI-valideringens resultat.')) {
      return;
    }

    try {
      await questionService.markAsManuallyApproved(questionId);
      setDialogConfig({
        isOpen: true,
        title: 'Fråga godkänd',
        message: 'Frågan har markerats som manuellt godkänd!',
        type: 'success'
      });
    } catch (error) {
      console.error('Kunde inte godkänna fråga:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid godkännande',
        message: 'Kunde inte godkänna fråga: ' + error.message,
        type: 'error'
      });
    }
  };

  const handleManualReject = async (questionId) => {
    const reason = window.prompt('Underkänn denna fråga manuellt?\n\nAnge anledning (valfritt):');

    // Om användaren klickar Cancel returneras null
    if (reason === null) {
      return;
    }

    try {
      await questionService.markAsManuallyRejected(questionId, reason);
      setDialogConfig({
        isOpen: true,
        title: 'Fråga underkänd',
        message: 'Frågan har markerats som manuellt underkänd!',
        type: 'success'
      });
    } catch (error) {
      console.error('Kunde inte underkänna fråga:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid underkännande',
        message: 'Kunde inte underkänna fråga: ' + error.message,
        type: 'error'
      });
    }
  };

  const handleApproveReported = async (questionId) => {
    if (!window.confirm('Godkänn denna rapporterade fråga?\n\nDetta tar bort den från karantän och gör den tillgänglig för rundor igen.')) {
      return;
    }

    try {
      await questionService.approveReportedQuestion(questionId);
      setDialogConfig({
        isOpen: true,
        title: 'Rapporterad fråga godkänd',
        message: 'Frågan har godkänts och tagits bort från karantän!',
        type: 'success'
      });
    } catch (error) {
      console.error('Kunde inte godkänna rapporterad fråga:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid godkännande',
        message: 'Kunde inte godkänna fråga: ' + error.message,
        type: 'error'
      });
    }
  };

  const handleRejectReported = async (questionId) => {
    if (!window.confirm('Underkänn denna rapporterade fråga?\n\nDetta markerar frågan som manuellt underkänd baserat på användarrapporterna.')) {
      return;
    }

    try {
      await questionService.rejectReportedQuestion(questionId);
      setDialogConfig({
        isOpen: true,
        title: 'Rapporterad fråga underkänd',
        message: 'Frågan har underkänts baserat på användarrapporter!',
        type: 'success'
      });
    } catch (error) {
      console.error('Kunde inte underkänna rapporterad fråga:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid underkännande',
        message: 'Kunde inte underkänna fråga: ' + error.message,
        type: 'error'
      });
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm('Är du säker på att du vill ta bort denna fråga?')) {
      return;
    }

    try {
      await questionService.delete(questionId);
      setQuestions(prev => prev.filter(q => q.id !== questionId));
    } catch (error) {
      console.error('Kunde inte ta bort fråga:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid radering',
        message: error.message || 'Kunde inte ta bort frågan. Försök igen.',
        type: 'error'
      });
    }
  };

  const handleToggleSelect = (questionId) => {
    setSelectedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedQuestions.size === deletableQuestions.length) {
      setSelectedQuestions(new Set());
    } else {
      setSelectedQuestions(new Set(deletableQuestions.map(q => q.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedQuestions.size === 0) return;

    if (!window.confirm(`Är du säker på att du vill radera ${selectedQuestions.size} fråga(r)?`)) {
      return;
    }

    try {
      // Anropa repository direkt för massradering
      await questionRepository.deleteQuestions(Array.from(selectedQuestions));

      setQuestions(prev => prev.filter(q => !selectedQuestions.has(q.id)));
      setSelectedQuestions(new Set());
    } catch (error) {
      console.error('Kunde inte radera markerade frågor:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid radering',
        message: 'Ett fel uppstod vid radering. Vissa frågor kan vara kvar.',
        type: 'error'
      });
    }
  };

  // Handler for individual question validation
  const handleValidationStart = (questionId) => {
    setValidatingQuestions(prev => new Set([...prev, questionId]));
  };

  const handleValidationEnd = (questionId) => {
    setValidatingQuestions(prev => {
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
  };

  // Handler for individual emoji regeneration
  const handleEmojiRegenerationStart = (questionId) => {
    setRegeneratingEmojis(prev => new Set([...prev, questionId]));
  };

  const handleEmojiRegenerationEnd = (questionId) => {
    setRegeneratingEmojis(prev => {
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
  };

  // Alla frågor kan raderas nu (inga inbyggda frågor)
  const deletableQuestions = filteredQuestions;
  const isAllSelected = selectedQuestions.size > 0 && selectedQuestions.size === deletableQuestions.length;

  if (!isSuperUser) {
    return null; // Visa inget medan omdirigering sker
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title="Frågebank" />

      <div className="mx-auto max-w-6xl px-4 pt-24 pb-8">
        {/* Sök och filter */}
        <div className="mb-6 flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-cyan-200 mb-2">Sök frågor</label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                    placeholder="Sök i frågetext, svarsalternativ eller ID..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-cyan-200 mb-2">Kategori</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category === 'all' ? 'Alla kategorier' : category}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-cyan-200 mb-2">Valideringsstatus</label>
                  <select
                    value={validationStatusFilter}
                    onChange={(e) => setValidationStatusFilter(e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                  >
                    <option value="all">Alla</option>
                    <option value="validated">Godkända (AI)</option>
                    <option value="failed">Underkända (AI)</option>
                    <option value="manual-approved">Manuellt godkända</option>
                    <option value="manual-rejected">Manuellt underkända</option>
                    <option value="structure-approved">Strukturellt godkända</option>
                    <option value="structure-rejected">Strukturellt underkända</option>
                    <option value="unvalidated">Ej validerade</option>
                    <option value="reported">Rapporterade (karantän)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-cyan-200 mb-2">Åldersgrupp</label>
                  <select
                    value={selectedAgeGroup}
                    onChange={(e) => setSelectedAgeGroup(e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                  >
                    {ageGroupOptions.map((group) => (
                      <option key={group} value={group}>
                        {group === 'all'
                          ? 'Alla åldersgrupper'
                          : (group === 'children' && 'Barn') ||
                            (group === 'youth' && 'Ungdom') ||
                            (group === 'adults' && 'Vuxna') ||
                            group}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-cyan-200 mb-2">Målgrupp</label>
                  <select
                    value={selectedAudience}
                    onChange={(e) => setSelectedAudience(e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                  >
                    {audienceOptions.map((audience) => (
                      <option key={audience} value={audience}>
                        {audience === 'all'
                          ? 'Alla målgrupper'
                          : audience === 'swedish'
                            ? 'Svensk målgrupp'
                            : audience.charAt(0).toUpperCase() + audience.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  onClick={() => setShowAIDialog(true)}
                  disabled={isGeneratingAI}
                  className="rounded bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 font-semibold text-white hover:from-purple-700 hover:to-indigo-700 disabled:bg-slate-700 disabled:text-gray-400 flex items-center gap-2"
                >
                  {isGeneratingAI ? '🤖 Genererar...' : '🤖 AI-Generera frågor'}
                </button>
              </div>
            </div>

        {/* Masshantering */}
        <div className="mb-4 flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-2">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={handleSelectAll}
              disabled={deletableQuestions.length === 0}
              className="h-5 w-5 rounded border-gray-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500 disabled:opacity-50"
            />
            <label className="text-sm text-gray-300">
              {selectedQuestions.size > 0 ? `${selectedQuestions.size} valda` : 'Markera alla'}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDeleteSelected} disabled={selectedQuestions.size === 0} className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed">
              Radera markerade
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8">
            <p className="text-gray-300">Laddar frågor...</p>
          </div>
        ) : (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-400">
                Visar {filteredQuestions.length} av {questions.length} frågor
              </p>
            </div>

            {filteredQuestions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-300">
                  {searchTerm || selectedCategory !== 'all'
                    ? 'Inga frågor matchade dina filter.'
                    : 'Inga frågor hittades i systemet.'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {paginatedQuestions.map((question, index) => {
                  const absoluteIndex = (currentPage - 1) * itemsPerPage + index;
                  return (
                    <QuestionCard
                      key={`${question.id}-${index}`}
                      question={question}
                      index={absoluteIndex}
                      expandedQuestion={expandedQuestion}
                      setExpandedQuestion={setExpandedQuestion}
                      handleDeleteQuestion={handleDeleteQuestion}
                      handleManualApprove={handleManualApprove}
                      handleManualReject={handleManualReject}
                      handleApproveReported={handleApproveReported}
                      handleRejectReported={handleRejectReported}
                      registerTask={registerTask}
                      isSelected={selectedQuestions.has(question.id)}
                      onSelect={handleToggleSelect}
                      validatingQuestions={validatingQuestions}
                      regeneratingEmojis={regeneratingEmojis}
                      onValidationStart={handleValidationStart}
                      onValidationEnd={handleValidationEnd}
                      onEmojiRegenerationStart={handleEmojiRegenerationStart}
                      onEmojiRegenerationEnd={handleEmojiRegenerationEnd}
                      setIndividualValidationTasks={setIndividualValidationTasks}
                      setDialogConfig={setDialogConfig}
                    />
                  );
                })}

                <Pagination
                  currentPage={currentPage}
                  totalItems={filteredQuestions.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={handlePageChange}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Generation Dialog */}
      {showAIDialog && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[1200]">
          <div className="bg-slate-900 rounded-xl shadow-2xl border border-purple-500/40 max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
                🤖 AI-Generera frågor
              </h3>
              <button
                onClick={() => setShowAIDialog(false)}
                className="text-gray-400 hover:text-gray-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-gray-300 text-sm mb-4">
              Generera frågor med AI som automatiskt får både svensk och engelsk text, kategori och svårighetsgrad.
            </p>

            {/* AI Status Display */}
            {loadingAiStatus ? (
              <div className="bg-slate-800 rounded-lg p-4 mb-4 flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-400"></div>
                <span className="text-gray-300 text-sm">Kontrollerar AI-providers...</span>
              </div>
            ) : aiStatus && (
              <div className="space-y-2 mb-4">
                {Object.entries(aiStatus).map(([provider, status]) => {
                  const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);
                  return (
                  <div key={provider} className={`rounded-lg p-3 text-sm ${
                    status.available
                      ? 'bg-green-500/10 border border-green-500/30'
                      : 'bg-red-500/10 border border-red-500/30'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {status.available ? '✅' : '❌'}
                      </span>
                      <span className="font-semibold">{providerLabel}</span>
                      <span className={`ml-auto text-xs ${status.available ? 'text-green-400' : 'text-red-400'}`}>
                        {status.available ? 'Tillgänglig' : (status.configured ? 'Ej tillgänglig' : 'Inte konfigurerad')}
                      </span>
                    </div>
                    {status.model && (
                      <p className="text-xs text-gray-400 mt-1">Model: {status.model}</p>
                    )}
                    {!status.available && status.error && (
                      <p className="text-xs text-red-200 mt-1">Fel: {status.error}</p>
                    )}
                    {!status.available && status.errorStatus && (
                      <p className="text-[11px] text-red-200/80 mt-1">Statuskod: {status.errorStatus}</p>
                    )}
                  </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-4">
              {/* Antal */}
              <div>
                <label className="block text-sm font-semibold text-cyan-200 mb-2">
                  Antal frågor (1-50)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={aiAmount}
                  onChange={(e) => setAiAmount(parseInt(e.target.value) || 10)}
                  className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                />
              </div>

              {/* Kategori */}
              <div>
                <label className="block text-sm font-semibold text-cyan-200 mb-2">
                  Kategori (valfri)
                </label>
                <select
                  value={aiCategory}
                  onChange={(e) => setAiCategory(e.target.value)}
                  className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                >
                  <option value="">Blandad</option>
                  <option value="Geografi">Geografi</option>
                  <option value="Historia">Historia</option>
                  <option value="Naturvetenskap">Naturvetenskap</option>
                  <option value="Kultur">Kultur</option>
                  <option value="Sport">Sport</option>
                  <option value="Natur">Natur</option>
                  <option value="Teknik">Teknik</option>
                  <option value="Djur">Djur</option>
                  <option value="Gåtor">Gåtor</option>
                </select>
              </div>

              {/* Åldersgrupp */}
              <div>
                <label className="block text-sm font-semibold text-cyan-200 mb-2">
                  Åldersgrupp (valfri)
                </label>
                <select
                  value={aiAgeGroup}
                  onChange={(e) => setAiAgeGroup(e.target.value)}
                  className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                >
                  <option value="">Blandad</option>
                  <option value="children">Barn (6-12 år)</option>
                  <option value="youth">Ungdomar (13-25 år)</option>
                  <option value="adults">Vuxna (25+ år)</option>
                </select>
              </div>

              {/* AI Provider */}
              <div>
                <label className="block text-sm font-semibold text-cyan-200 mb-2">
                  AI-Provider
                </label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value)}
                  className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  disabled={!aiStatus || Object.values(aiStatus).every(s => !s.available)}
                >
                  {/* Slumpmässig option - alltid tillgänglig om någon provider finns */}
                  {aiStatus && Object.values(aiStatus).some(s => s.available) && (
                    <option value="random">🎲 Slumpmässig (rekommenderad)</option>
                  )}
                  {aiStatus?.gemini?.available && (
                    <option value="gemini">Gemini (Google) - Snabb & Gratis</option>
                  )}
                  {aiStatus?.anthropic?.available && (
                    <option value="anthropic">Claude (Anthropic) - Hög kvalitet</option>
                  )}
                  {aiStatus?.openai?.available && (
                    <option value="openai">GPT-4 (OpenAI) - Balanserad</option>
                  )}
                  {(!aiStatus || Object.values(aiStatus).every(s => !s.available)) && (
                    <option value="">Ingen provider tillgänglig</option>
                  )}
                </select>
              </div>

              {/* Info box - Dynamisk text baserat på vald provider */}
              {aiProvider === 'random' && aiStatus && Object.values(aiStatus).some(s => s.available) && (
                <div className="bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/30 rounded-lg p-3">
                  <p className="text-xs text-purple-200">
                    🎲 Slumpmässig provider ger bäst variation och kvalitet. Systemet väljer automatiskt mellan tillgängliga AI-providers för varje fråga.
                  </p>
                </div>
              )}
              {aiProvider === 'gemini' && aiStatus?.gemini?.available && (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
                  <p className="text-xs text-cyan-200">
                    💡 Gemini är Google's AI-modell. Den är helt gratis att använda och genererar frågor snabbt på både svenska och engelska.
                  </p>
                </div>
              )}
              {aiProvider === 'anthropic' && aiStatus?.anthropic?.available && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                  <p className="text-xs text-purple-200">
                    💡 Claude är Anthropic's AI-modell. Hög kvalitet med $5 gratis kredit per månad (ca 500-1000 frågor).
                  </p>
                </div>
              )}
              {aiProvider === 'openai' && aiStatus?.openai?.available && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                  <p className="text-xs text-green-200">
                    💡 GPT-4 är OpenAI's AI-modell. Balanserad mellan kvalitet och kostnad. Kräver betalning efter gratis-krediter.
                  </p>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAIDialog(false)}
                  className="flex-1 rounded-lg bg-slate-700 px-4 py-2 font-semibold text-gray-200 hover:bg-slate-600"
                >
                  Avbryt
                </button>
                <button
                  onClick={handleGenerateAIQuestions}
                  disabled={!aiStatus || (aiProvider !== 'random' && !aiStatus[aiProvider]?.available) || (aiProvider === 'random' && !Object.values(aiStatus).some(s => s.available))}
                  className={`flex-1 rounded-lg px-4 py-2 font-semibold text-white transition-colors ${
                    (aiStatus && ((aiProvider === 'random' && Object.values(aiStatus).some(s => s.available)) || aiStatus[aiProvider]?.available))
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'
                      : 'bg-gray-600 cursor-not-allowed opacity-50'
                  }`}
                >
                  Generera
                </button>
              </div>
            </div>
          </div>
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
};export default AdminQuestionsPage;

