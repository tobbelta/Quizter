/**
 * Admin-sida för att hantera och visa tillgängliga frågor.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { questionService } from '../services/questionService';
import Header from '../components/layout/Header';
import Pagination from '../components/shared/Pagination';
import { questionRepository } from '../repositories/questionRepository';
import DuplicateQuestionsPanel from '../components/admin/DuplicateQuestionsPanel';
import ValidationPanel from '../components/admin/ValidationPanel';
import AIValidationPanel from '../components/admin/AIValidationPanel';

const QuestionCard = ({ question, index, expandedQuestion, setExpandedQuestion, handleDeleteQuestion, handleValidateQuestion, handleManualApprove, handleManualReject, handleApproveReported, handleRejectReported, validatingQuestion, isSelected, onSelect }) => {
  const [currentLang, setCurrentLang] = useState('sv');

  // Hämta data för valt språk
  const svLang = question.languages?.sv || { text: question.text, options: question.options, explanation: question.explanation };
  const enLang = question.languages?.en;

  const isExpanded = expandedQuestion === question.id;

  const displayLang = currentLang === 'sv' ? svLang : enLang;
  const hasBothLanguages = svLang && enLang;

  return (
    <div className={`rounded-lg border bg-slate-900/60 p-4 transition-colors ${isSelected ? 'border-cyan-500' : 'border-slate-700'}`}>
      <div className="flex items-start gap-4">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(question.id)}
          className="mt-1 h-5 w-5 rounded border-gray-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
        />
        <div className="flex-1">
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
                {question.aiValidated === true && question.manuallyApproved !== true && !question.manuallyRejected && (
                  <span className="inline-flex items-center rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs font-medium text-green-300" title="AI-validerad - Alla providers godkände">
                    ✓ AI-OK
                  </span>
                )}
                {question.aiValidated === false && question.aiValidationResult && !question.manuallyRejected && (
                  <span className="inline-flex items-center rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-medium text-red-300" title={
                    question.aiValidationResult.validationType === 'structure'
                      ? 'Strukturvalidering - Problem hittades'
                      : 'AI-validering - Problem hittades'
                  }>
                    ✗ {question.aiValidationResult.validationType === 'structure' ? 'Struktur-fel' : 'AI-Fel'}
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
                {question.category && (
                  <span className="inline-flex items-center rounded-full bg-purple-500/20 px-2.5 py-0.5 text-xs font-medium text-purple-200">
                    {question.category}
                  </span>
                )}
                {question.difficulty && (
                  <span className="inline-flex items-center rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-xs font-medium text-cyan-200">
                    {question.difficulty === 'kid' ? 'Barn' : question.difficulty === 'family' ? 'Familj' : question.difficulty === 'adult' ? 'Vuxen' : question.difficulty}
                  </span>
                )}
                {hasBothLanguages && (
                  <div className="flex items-center rounded-full bg-slate-800 p-0.5">
                    <button onClick={() => setCurrentLang('sv')} className={`px-2 py-0.5 text-xs rounded-full ${currentLang === 'sv' ? 'bg-cyan-500 text-black' : 'text-gray-300'}`}>SV</button>
                    <button onClick={() => setCurrentLang('en')} className={`px-2 py-0.5 text-xs rounded-full ${currentLang === 'en' ? 'bg-cyan-500 text-black' : 'text-gray-300'}`}>EN</button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setExpandedQuestion(isExpanded ? null : question.id)}
                className="text-lg font-semibold text-left hover:text-cyan-300 transition-colors"
              >
                {displayLang?.text || (currentLang === 'en' ? '(No English text)' : '(Ingen svensk text)')}
              </button>
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
                  {!question.manuallyApproved && !question.manuallyRejected && (
                    <button
                      onClick={() => handleValidateQuestion(question)}
                      disabled={validatingQuestion === question.id}
                      className="rounded bg-purple-600 px-3 py-1 text-sm font-semibold text-white hover:bg-purple-500 disabled:bg-slate-600 disabled:text-gray-400"
                      title="AI-validera fråga"
                    >
                      {validatingQuestion === question.id ? '🤖 Validerar...' : '🤖 Validera'}
                    </button>
                  )}
                  {question.aiValidated === false && question.aiValidationResult && !question.manuallyApproved && (
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

          {/* AI-Valideringsresultat */}
          {question.aiValidationResult && (
            <div className={`p-4 rounded border ${
              question.manuallyRejected
                ? 'bg-orange-500/10 border-orange-500/30'
                : question.aiValidated
                ? (question.manuallyApproved ? 'bg-blue-500/10 border-blue-500/30' : 'bg-green-500/10 border-green-500/30')
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm font-bold ${
                  question.manuallyRejected ? 'text-orange-300' :
                  question.aiValidated ? (question.manuallyApproved ? 'text-blue-300' : 'text-green-300') : 'text-red-300'
                }`}>
                  {question.manuallyRejected
                    ? '✗ Manuellt underkänd'
                    : question.aiValidationResult.validationType === 'manual'
                    ? '✓ Manuellt godkänd'
                    : question.aiValidationResult.validationType === 'structure'
                    ? (question.aiValidated ? '✓ Strukturvalidering: GODKÄND' : '✗ Strukturvalidering: UNDERKÄND')
                    : (question.aiValidated ? '✓ AI-Validering: GODKÄND' : '✗ AI-Validering: UNDERKÄND')
                  }
                </span>
                {question.aiValidationResult.providersChecked && (
                  <span className="text-xs text-gray-400">
                    ({question.aiValidationResult.providersChecked} providers)
                  </span>
                )}
              </div>

              {question.aiValidationResult.issues && question.aiValidationResult.issues.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-red-300 mb-1">Problem:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {question.aiValidationResult.issues.map((issue, idx) => (
                      <li key={idx} className="text-xs text-red-200">{issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              {question.aiValidationResult.reasoning && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-gray-300 mb-1">Motivering:</p>
                  <p className="text-xs text-gray-300 whitespace-pre-wrap">{question.aiValidationResult.reasoning}</p>
                </div>
              )}

              {question.aiValidationResult.providerResults && (
                <div className="mt-3 pt-3 border-t border-slate-600">
                  <p className="text-xs font-semibold text-gray-300 mb-2">Provider-resultat:</p>
                  <div className="space-y-2">
                    {Object.entries(question.aiValidationResult.providerResults).map(([provider, result]) => (
                      <div key={provider} className="flex items-start gap-2">
                        <span className={`text-xs font-bold ${result.valid ? 'text-green-300' : 'text-red-300'}`}>
                          {result.valid ? '✓' : '✗'} {provider}:
                        </span>
                        <span className="text-xs text-gray-300 flex-1">
                          {result.error || (result.valid ? 'Godkänd' : result.issues?.join(', ') || 'Underkänd')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {question.manuallyApprovedAt && (
                <p className="text-xs text-gray-400 mt-2">
                  Manuellt godkänd: {new Date(question.manuallyApprovedAt).toLocaleString('sv-SE')}
                </p>
              )}
              {question.manuallyRejectedAt && (
                <p className="text-xs text-gray-400 mt-2">
                  Manuellt underkänd: {new Date(question.manuallyRejectedAt).toLocaleString('sv-SE')}
                </p>
              )}
              {question.aiValidatedAt && !question.manuallyApprovedAt && !question.manuallyRejectedAt && (
                <p className="text-xs text-gray-400 mt-2">
                  Validerad: {new Date(question.aiValidatedAt).toLocaleString('sv-SE')}
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
        </div>
      )}
    </div>
  );
};

const AdminQuestionsPage = () => {
  const navigate = useNavigate();
  const { isSuperUser } = useAuth();
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiAmount, setAiAmount] = useState(10);
  const [aiCategory, setAiCategory] = useState('');
  const [aiDifficulty, setAiDifficulty] = useState('');
  const [aiProvider, setAiProvider] = useState('gemini'); // gemini, anthropic, openai
  const [aiStatus, setAiStatus] = useState(null); // Status för alla providers
  const [loadingAiStatus, setLoadingAiStatus] = useState(false);
  const [expandedQuestion, setExpandedQuestion] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [validationStatusFilter, setValidationStatusFilter] = useState('all'); // 'all' | 'validated' | 'failed' | 'unvalidated' | 'reported'
  const [selectedQuestions, setSelectedQuestions] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [activeTab, setActiveTab] = useState('questions'); // 'questions' | 'duplicates'
  const [validatingQuestion, setValidatingQuestion] = useState(null); // ID av fråga som valideras
  const [validatingBatch, setValidatingBatch] = useState(false);

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
      const response = await fetch('https://europe-west1-geoquest2-7e45c.cloudfunctions.net/getAIStatus');
      const data = await response.json();

      // Använd providers från response
      setAiStatus(data.providers);

      // Välj första tillgängliga provider
      if (data.providers.gemini?.available) {
        setAiProvider('gemini');
      } else if (data.providers.anthropic?.available) {
        setAiProvider('anthropic');
      } else if (data.providers.openai?.available) {
        setAiProvider('openai');
      }
    } catch (error) {
      console.error('Failed to fetch AI status:', error);
      setAiStatus({
        gemini: { available: false, message: 'Kunde inte hämta status' },
        anthropic: { available: false, message: 'Kunde inte hämta status' },
        openai: { available: false, message: 'Kunde inte hämta status' }
      });
    } finally {
      setLoadingAiStatus(false);
    }
  };

  // Filtrera frågor baserat på sökning, kategori och valideringsstatus
  const filteredQuestions = questions.filter(question => {
    // Hämta text för valt språk
    const svText = question.languages?.sv?.text || question.text || '';
    const enText = question.languages?.en?.text || '';
    const svOptions = question.languages?.sv?.options || question.options || [];
    const enOptions = question.languages?.en?.options || [];

    const matchesSearch = svText.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         enText.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         svOptions.some(o => o.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         enOptions.some(o => o.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' ||
                           (question.category && question.category.toLowerCase() === selectedCategory.toLowerCase());

    // Valideringsstatus-filter
    let matchesValidationStatus = true;
    if (validationStatusFilter === 'validated') {
      // Godkända (AI eller manuellt)
      matchesValidationStatus = question.aiValidated === true;
    } else if (validationStatusFilter === 'failed') {
      // Underkända (AI eller manuellt, men inte manuellt godkända)
      matchesValidationStatus = question.aiValidated === false && !question.manuallyApproved;
    } else if (validationStatusFilter === 'unvalidated') {
      // Ej validerade (inte testade alls)
      matchesValidationStatus = !question.aiValidationResult;
    } else if (validationStatusFilter === 'reported') {
      // Rapporterade (i karantän)
      matchesValidationStatus = question.reported === true;
    }

    return matchesSearch && matchesCategory && matchesValidationStatus;
  });

  // Få unika kategorier från frågor
  const categories = ['all', ...new Set(questions.map(q => q.category).filter(Boolean))];

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
      const response = await fetch('https://europe-west1-geoquest2-7e45c.cloudfunctions.net/generateAIQuestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: requestAmount,
          category: aiCategory || undefined,
          difficulty: aiDifficulty || undefined,
          provider: aiProvider
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to generate questions');
      }

      // Lägg till frågor (validering och dublettkontroll sker automatiskt)
      const importResult = await questionService.addQuestions(data.questions || []);

      let message = `🎉 AI-generering med ${aiProvider} klar!\n\n`;
      message += `✓ ${importResult.added} nya giltiga frågor importerades\n`;

      if (importResult.addedInvalid > 0) {
        message += `⚠️ ${importResult.addedInvalid} frågor importerades med valideringsfel (taggade)\n`;
      }

      if (importResult.duplicatesBlocked > 0) {
        message += `⚠️ ${importResult.duplicatesBlocked} dubletter blockerades\n`;
      }

      // Varna om vi inte fick tillräckligt många giltiga frågor
      if (importResult.added < aiAmount) {
        message += `\n⚠️ OBS: Du begärde ${aiAmount} frågor men fick bara ${importResult.added} giltiga.\n`;
        message += `Försök generera fler för att få det antal du behöver.`;
      }

      message += `\nFrågorna finns nu både på svenska och engelska med kategorier och svårighetsgrader.`;

      alert(message);
    } catch (error) {
      alert(`❌ Kunde inte generera frågor: ${error.message}\n\nKontrollera att API-nyckeln för ${aiProvider} är konfigurerad i Firebase.`);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleValidateQuestion = async (question, silent = false) => {
    setValidatingQuestion(question.id);

    try {
      const langData = question.languages?.sv || {
        text: question.text,
        options: question.options,
        explanation: question.explanation
      };

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
            provider: 'anthropic'
          })
        }
      );

      const result = await response.json();

      console.log('[AI-Validering] Raw response:', result);
      console.log('[AI-Validering] Response status:', response.status);

      // Kontrollera om det finns ett felmeddelande
      if (result.error || result.message) {
        throw new Error(result.error || result.message);
      }

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${JSON.stringify(result)}`);
      }

      // Kontrollera att svaret har rätt format
      if (!result || typeof result !== 'object') {
        throw new Error('Ogiltigt svar från AI-validering: ' + JSON.stringify(result));
      }

      // Sätt default-värden om de saknas
      const validationResult = {
        valid: result.valid !== false,
        issues: Array.isArray(result.issues) ? result.issues : [],
        suggestedCorrectOption: result.suggestedCorrectOption,
        reasoning: result.reasoning || ''
      };

      console.log('[AI-Validering] Result:', validationResult);

      // Spara BARA om frågan är valid (alla providers godkände)
      if (validationResult.valid) {
        await questionService.markAsValidated(question.id, validationResult);
      } else {
        // Om frågan underkänns, markera som invalid
        await questionService.markAsInvalid(question.id, validationResult);
      }

      if (!silent) {
        if (validationResult.valid) {
          // Visa vilka providers som validerade
          const providersInfo = validationResult.providersChecked
            ? `\n\nValiderad av ${validationResult.providersChecked} AI-providers`
            : '';
          alert('✅ Frågan är validerad!' + providersInfo + '\n\nAI:n bekräftar att det markerade svaret är korrekt.');
        } else {
          let message = '⚠️ AI hittade problem:\n\n';
          validationResult.issues.forEach(issue => {
            message += `• ${issue}\n`;
          });
          if (validationResult.suggestedCorrectOption !== undefined && validationResult.suggestedCorrectOption !== question.correctOption) {
            message += `\n💡 AI föreslår: Alternativ ${validationResult.suggestedCorrectOption + 1}`;
          }

          // Visa provider-resultat om tillgängliga
          if (validationResult.providerResults) {
            message += `\n\n--- Provider-resultat ---\n`;
            Object.entries(validationResult.providerResults).forEach(([provider, result]) => {
              message += `${provider}: ${result.valid ? '✓' : '✗'}\n`;
            });
          }

          alert(message);
        }
      }

      return validationResult;
    } catch (error) {
      console.error('Fel vid AI-validering:', error);
      if (!silent) {
        alert('❌ Kunde inte validera fråga: ' + error.message);
      }
      throw error;
    } finally {
      setValidatingQuestion(null);
    }
  };

  const handleManualApprove = async (questionId) => {
    if (!window.confirm('Godkänn denna fråga manuellt?\n\nDetta markerar frågan som validerad oavsett AI-valideringens resultat.')) {
      return;
    }

    try {
      await questionService.markAsManuallyApproved(questionId);
      alert('✅ Frågan har markerats som manuellt godkänd!');
    } catch (error) {
      console.error('Kunde inte godkänna fråga:', error);
      alert('❌ Kunde inte godkänna fråga: ' + error.message);
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
      alert('✅ Frågan har markerats som manuellt underkänd!');
    } catch (error) {
      console.error('Kunde inte underkänna fråga:', error);
      alert('❌ Kunde inte underkänna fråga: ' + error.message);
    }
  };

  const handleApproveReported = async (questionId) => {
    if (!window.confirm('Godkänn denna rapporterade fråga?\n\nDetta tar bort den från karantän och gör den tillgänglig för rundor igen.')) {
      return;
    }

    try {
      await questionService.approveReportedQuestion(questionId);
      alert('✅ Frågan har godkänts och tagits bort från karantän!');
    } catch (error) {
      console.error('Kunde inte godkänna rapporterad fråga:', error);
      alert('❌ Kunde inte godkänna fråga: ' + error.message);
    }
  };

  const handleRejectReported = async (questionId) => {
    if (!window.confirm('Underkänn denna rapporterade fråga?\n\nDetta markerar frågan som manuellt underkänd baserat på användarrapporterna.')) {
      return;
    }

    try {
      await questionService.rejectReportedQuestion(questionId);
      alert('✅ Frågan har underkänts baserat på användarrapporter!');
    } catch (error) {
      console.error('Kunde inte underkänna rapporterad fråga:', error);
      alert('❌ Kunde inte underkänna fråga: ' + error.message);
    }
  };

  const handleValidateAllUnvalidated = async () => {
    // Exkludera manuellt godkända och manuellt underkända
    const unvalidatedQuestions = questions.filter(q =>
      !q.aiValidated && !q.manuallyApproved && !q.manuallyRejected
    );

    if (unvalidatedQuestions.length === 0) {
      alert('✅ Alla frågor är redan validerade!');
      return;
    }

    if (!window.confirm(`Detta kommer att AI-validera ${unvalidatedQuestions.length} ovaliderade frågor.\n\nDetta kostar API-anrop och kan ta några minuter.\n\nVill du fortsätta?`)) {
      return;
    }

    setValidatingBatch(true);
    let validated = 0;
    let failed = 0;
    const issues = [];
    const validationUpdates = []; // Samla alla uppdateringar för batch-skrivning

    try {
      // Steg 1: Hämta valideringsresultat från AI (detta måste göras sekventiellt pga API-begränsningar)
      for (const question of unvalidatedQuestions) {
        try {
          const langData = question.languages?.sv || {
            text: question.text,
            options: question.options,
            explanation: question.explanation
          };

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
                provider: 'anthropic'
              })
            }
          );

          const result = await response.json();

          if (result.error || result.message || !response.ok) {
            throw new Error(result.error || result.message || `API returned ${response.status}`);
          }

          const validationResult = {
            valid: result.valid !== false,
            issues: Array.isArray(result.issues) ? result.issues : [],
            suggestedCorrectOption: result.suggestedCorrectOption,
            reasoning: result.reasoning || ''
          };

          // Samla uppdateringar istället för att skriva direkt
          validationUpdates.push({
            questionId: question.id,
            valid: validationResult.valid,
            validationData: validationResult
          });

          validated++;

          if (!validationResult.valid) {
            issues.push({
              id: question.id,
              text: question.languages?.sv?.text || question.text,
              issues: validationResult.issues
            });
          }
        } catch (error) {
          failed++;
          console.error(`Fel vid validering av ${question.id}:`, error);
        }
      }

      // Steg 2: Skriv ALLA uppdateringar till Firestore i EN batch-operation
      if (validationUpdates.length > 0) {
        console.log(`[Batch-validering] Skriver ${validationUpdates.length} uppdateringar till Firestore...`);
        await questionService.markManyAsValidated(validationUpdates);
      }

      let message = `✅ Batch-validering klar!\n\n`;
      message += `Validerade: ${validated}\n`;
      message += `Misslyckades: ${failed}\n`;
      message += `Problem hittade: ${issues.length}\n`;

      if (issues.length > 0) {
        message += `\n⚠️ Frågor med problem:\n`;
        issues.slice(0, 5).forEach(issue => {
          message += `\n• ${issue.text.substring(0, 50)}...\n`;
          issue.issues.forEach(i => message += `  - ${i}\n`);
        });
        if (issues.length > 5) {
          message += `\n...och ${issues.length - 5} fler.`;
        }
      }

      alert(message);
    } finally {
      setValidatingBatch(false);
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
      alert(error.message || 'Kunde inte ta bort frågan. Försök igen.');
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
      alert('Ett fel uppstod vid radering. Vissa frågor kan vara kvar.');
    }
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
        {/* Flik-navigation */}
        <div className="mb-6 flex gap-2 border-b border-slate-700">
          <button
            onClick={() => setActiveTab('questions')}
            className={`px-4 py-2 font-semibold transition-colors ${
              activeTab === 'questions'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            📝 Frågor ({questions.length})
          </button>
          <button
            onClick={() => setActiveTab('duplicates')}
            className={`px-4 py-2 font-semibold transition-colors ${
              activeTab === 'duplicates'
                ? 'text-amber-400 border-b-2 border-amber-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            🔍 Dubletter
          </button>
          <button
            onClick={() => setActiveTab('validation')}
            className={`px-4 py-2 font-semibold transition-colors ${
              activeTab === 'validation'
                ? 'text-green-400 border-b-2 border-green-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            ✓ Validering
          </button>
          <button
            onClick={() => setActiveTab('ai-validation')}
            className={`px-4 py-2 font-semibold transition-colors ${
              activeTab === 'ai-validation'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            🤖 AI-Validering
          </button>
        </div>

        {/* Innehåll baserat på aktiv flik */}
        {activeTab === 'ai-validation' ? (
          <AIValidationPanel />
        ) : activeTab === 'validation' ? (
          <ValidationPanel />
        ) : activeTab === 'duplicates' ? (
          <DuplicateQuestionsPanel />
        ) : (
          <>
            {/* Sök och filter */}
            <div className="mb-6 flex flex-col md:flex-row gap-4 items-end justify-between">
          <div>
            <label className="block text-sm font-semibold text-cyan-200 mb-2">Sök frågor</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
              placeholder="Sök i frågetext och svarsalternativ..."
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-cyan-200 mb-2">Kategori</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
            >
              {categories.map(category => (
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
              <option value="validated">Godkända</option>
              <option value="failed">Underkända</option>
              <option value="unvalidated">Ej validerade</option>
              <option value="reported">Rapporterade (karantän)</option>
            </select>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={handleValidateAllUnvalidated}
              disabled={validatingBatch}
              className="rounded bg-purple-600 px-4 py-2 font-semibold text-white hover:bg-purple-500 disabled:bg-slate-700 disabled:text-gray-400"
            >
              {validatingBatch ? '🤖 Validerar...' : `🤖 Validera ovaliderade (${questions.filter(q => !q.aiValidated).length})`}
            </button>
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
          <div>
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
                      handleValidateQuestion={handleValidateQuestion}
                      handleManualApprove={handleManualApprove}
                      handleManualReject={handleManualReject}
                      handleApproveReported={handleApproveReported}
                      handleRejectReported={handleRejectReported}
                      validatingQuestion={validatingQuestion}
                      isSelected={selectedQuestions.has(question.id)}
                      onSelect={handleToggleSelect}
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
                {Object.entries(aiStatus).map(([provider, status]) => (
                  <div key={provider} className={`rounded-lg p-3 text-sm ${
                    status.available
                      ? 'bg-green-500/10 border border-green-500/30'
                      : 'bg-red-500/10 border border-red-500/30 opacity-60'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {status.available ? '✅' : '❌'}
                      </span>
                      <span className="font-semibold capitalize">{provider}</span>
                      <span className={`ml-auto text-xs ${status.available ? 'text-green-400' : 'text-red-400'}`}>
                        {status.available ? 'Tillgänglig' : 'Ej tillgänglig'}
                      </span>
                    </div>
                    {status.model && (
                      <p className="text-xs text-gray-400 mt-1">Model: {status.model}</p>
                    )}
                  </div>
                ))}
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

              {/* Svårighetsgrad */}
              <div>
                <label className="block text-sm font-semibold text-cyan-200 mb-2">
                  Svårighetsgrad (valfri)
                </label>
                <select
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value)}
                  className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                >
                  <option value="">Blandad</option>
                  <option value="kid">Barn (6-12 år)</option>
                  <option value="family">Familj (alla åldrar)</option>
                  <option value="adult">Vuxen (utmanande)</option>
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
                  disabled={!aiStatus || !aiStatus[aiProvider]?.available}
                  className={`flex-1 rounded-lg px-4 py-2 font-semibold text-white transition-colors ${
                    (aiStatus && aiStatus[aiProvider]?.available)
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
        </>
      )}
      </div>
    </div>
  );
};

export default AdminQuestionsPage;