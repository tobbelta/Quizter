/**
 * Admin-sida för att hantera och visa tillgängliga frågor.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// ...removed legacy Firestore imports...
// ...existing code...
import { useAuth } from '../context/AuthContext';
import { questionService } from '../services/questionService';
import { aiService } from '../services/aiService';
import { taskService } from '../services/taskService';
import { categoryService } from '../services/categoryService';
import { audienceService } from '../services/audienceService';
import { useBackgroundTasks } from '../context/BackgroundTaskContext';
import Header from '../components/layout/Header';
import Pagination from '../components/shared/Pagination';
import { questionRepository } from '../repositories/questionRepository';
import MessageDialog from '../components/shared/MessageDialog';
import { DEFAULT_CATEGORY_OPTIONS } from '../data/categoryOptions';
import { DEFAULT_AGE_GROUPS, DEFAULT_TARGET_AUDIENCES, formatAgeGroupLabel } from '../data/audienceOptions';

const PROVIDER_LABELS = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  anthropic: 'Claude',
  mistral: 'Mistral',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  together: 'Together AI',
  fireworks: 'Fireworks AI',
};

const formatProviderLabel = (value) => {
  if (!value) return null;
  const key = value.toLowerCase();
  return PROVIDER_LABELS[key] || `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
};

const normalizeOptionList = (options = []) => {
  const normalized = Array.isArray(options) ? [...options] : [];
  while (normalized.length < 4) {
    normalized.push('');
  }
  return normalized.slice(0, 4);
};

const buildEditState = (question) => {
  const baseSv = question.languages?.sv || {
    text: question.text,
    options: question.options,
    explanation: question.explanation,
    background: question.background || ''
  };
  const baseEn = question.languages?.en || {
    text: '',
    options: [],
    explanation: '',
    background: ''
  };
  const initialCategories = Array.isArray(question.categories)
    ? question.categories
    : question.category
      ? [question.category]
      : [];
  const initialAgeGroups = Array.isArray(question.ageGroups) ? question.ageGroups : [];
  const bestBeforeAt = question.bestBeforeAt || question.best_before_at || null;
  const bestBeforeDate = bestBeforeAt ? new Date(bestBeforeAt).toISOString().slice(0, 10) : '';
  return {
    sv: {
      text: baseSv?.text || '',
      options: normalizeOptionList(baseSv?.options || []),
      explanation: baseSv?.explanation || '',
      background: baseSv?.background || ''
    },
    en: {
      text: baseEn?.text || '',
      options: normalizeOptionList(baseEn?.options || []),
      explanation: baseEn?.explanation || '',
      background: baseEn?.background || ''
    },
    categories: initialCategories,
    ageGroups: initialAgeGroups,
    targetAudience: question.targetAudience || 'swedish',
    difficulty: question.difficulty || 'medium',
    correctOption: typeof question.correctOption === 'number' ? question.correctOption : 0,
    emoji: question.emoji || '',
    timeSensitive: question.timeSensitive === true,
    bestBeforeDate
  };
};

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
  setDialogConfig,
  validationProviders,
  validationProvidersLoading,
  categoryOptions,
  ageGroupOptions,
  targetAudienceOptions,
  aiRulesConfig,
  loadingAiRules
}) => {
  const [currentLang, setCurrentLang] = useState('sv');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplyingEdits, setIsApplyingEdits] = useState(false);
  const [editErrors, setEditErrors] = useState([]);
  const [showPromptInfo, setShowPromptInfo] = useState(false);

  // Hämta data för valt språk
  const svLang = question.languages?.sv || {
    text: question.text,
    options: question.options,
    explanation: question.explanation,
    background: question.background || ''
  };
  const enLang = question.languages?.en;
  const [editData, setEditData] = useState(() => buildEditState(question));

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
    if (Array.isArray(ageGroupOptions)) {
      const match = ageGroupOptions.find((option) => option.id === group);
      if (match) {
        return formatAgeGroupLabel(match);
      }
    }
    return group;
  });
  const targetAudience = question.targetAudience;
  const providerLabel = formatProviderLabel(question.provider);
  const createdByLabel = question.createdBy || 'system';
  const createdByDisplay = providerLabel
    ? `${createdByLabel} (${providerLabel})`
    : createdByLabel;
  const bestBeforeAt = question.bestBeforeAt || question.best_before_at || null;
  const bestBeforeLabel = bestBeforeAt ? new Date(bestBeforeAt).toLocaleDateString('sv-SE') : null;
  const isExpired = question.isExpired === true || (bestBeforeAt ? bestBeforeAt <= Date.now() : false);
  const resolvedAgeGroupDetails = ageGroups
    .map((group) => (Array.isArray(ageGroupOptions) ? ageGroupOptions.find((option) => option.id === group) : null))
    .filter(Boolean);
  const resolvedCategoryDetails = categories
    .map((category) => (Array.isArray(categoryOptions) ? categoryOptions.find((option) => option.value === category) : null))
    .filter(Boolean);
  const resolvedTargetAudience = Array.isArray(targetAudienceOptions)
    ? targetAudienceOptions.find((option) => option.id === targetAudience)
    : null;
  const normalizedAudienceKey = targetAudience ? targetAudience.toLowerCase() : null;
  const globalRules = aiRulesConfig?.global || null;
  const targetRules = normalizedAudienceKey
    ? aiRulesConfig?.targetAudiences?.[normalizedAudienceKey]
    : null;
  const activeBlocklist = [
    ...(Array.isArray(globalRules?.blocklist) ? globalRules.blocklist : []),
    ...(Array.isArray(targetRules?.blocklist) ? targetRules.blocklist : [])
  ].filter((rule) => {
    if (!rule || rule.enabled === false) return false;
    const scopedAgeGroups = Array.isArray(rule.ageGroups) ? rule.ageGroups : [];
    if (scopedAgeGroups.length === 0) return true;
    return ageGroups.some((group) => scopedAgeGroups.includes(group));
  });
  const answerRule = globalRules?.answerInQuestion || null;
  const maxLengthMap = {
    ...(globalRules?.maxQuestionLengthByAgeGroup || {}),
    ...(targetRules?.maxQuestionLengthByAgeGroup || {})
  };
  const maxLengthEntries = ageGroups
    .map((group) => ({
      group,
      value: maxLengthMap[group]
    }))
    .filter((entry) => Number.isFinite(Number(entry.value)));
  const freshnessRules = targetRules?.freshness || globalRules?.freshness || null;
  const autoTimeSensitiveAgeGroups = Array.isArray(freshnessRules?.autoTimeSensitiveAgeGroups)
    ? freshnessRules.autoTimeSensitiveAgeGroups.filter(Boolean)
    : [];
  const normalizedAgeGroups = ageGroups.map((group) => String(group).toLowerCase());
  const relevantAutoAgeGroups = normalizedAgeGroups.length > 0
    ? autoTimeSensitiveAgeGroups.filter((group) => normalizedAgeGroups.includes(String(group).toLowerCase()))
    : autoTimeSensitiveAgeGroups;
  const autoTimeSensitiveLabel = autoTimeSensitiveAgeGroups.length === 0
    ? 'Av'
    : normalizedAgeGroups.length === 0
      ? autoTimeSensitiveAgeGroups.join(', ')
      : relevantAutoAgeGroups.length > 0
        ? relevantAutoAgeGroups.join(', ')
        : `Nej (gäller: ${autoTimeSensitiveAgeGroups.join(', ')})`;
  const showFreshnessGuidance = Boolean(freshnessRules?.guidance)
    && (normalizedAgeGroups.length === 0 || relevantAutoAgeGroups.length > 0);
  const normalizedGenerator = question.provider ? question.provider.toLowerCase() : null;
  const availableValidationProviders = Array.isArray(validationProviders) ? validationProviders : [];
  const hasAlternativeValidationProvider = normalizedGenerator
    ? availableValidationProviders.some(name => name !== normalizedGenerator)
    : availableValidationProviders.length > 0;
  const validationDisabledReason = validationProvidersLoading
    ? 'Laddar valideringsproviders...'
    : hasAlternativeValidationProvider
      ? null
      : 'Ingen alternativ valideringsprovider tillgänglig';
  const isValidationBlocked = Boolean(validationDisabledReason);

  useEffect(() => {
    if (!isEditing) {
      setEditData(buildEditState(question));
      setEditErrors([]);
    }
  }, [question, isEditing]);

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

  const updateLangField = (lang, field, value) => {
    setEditData((prev) => ({
      ...prev,
      [lang]: {
        ...prev[lang],
        [field]: value
      }
    }));
  };

  const updateLangOption = (lang, index, value) => {
    setEditData((prev) => {
      const options = normalizeOptionList(prev[lang]?.options || []);
      options[index] = value;
      return {
        ...prev,
        [lang]: {
          ...prev[lang],
          options
        }
      };
    });
  };

  const toggleListValue = (key, value) => {
    setEditData((prev) => {
      const currentList = Array.isArray(prev[key]) ? prev[key] : [];
      const nextSet = new Set(currentList);
      if (nextSet.has(value)) {
        nextSet.delete(value);
      } else {
        nextSet.add(value);
      }
      return {
        ...prev,
        [key]: Array.from(nextSet)
      };
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditData(buildEditState(question));
    setEditErrors([]);
  };

  const validateEditData = () => {
    const errors = [];
    if (!editData?.sv?.text || editData.sv.text.trim().length < 5) {
      errors.push('Svensk frågetext måste vara minst 5 tecken.');
    }
    const svOptions = normalizeOptionList(editData?.sv?.options || []);
    if (svOptions.length !== 4 || svOptions.some((option) => !option || option.trim().length === 0)) {
      errors.push('Alla svenska svarsalternativ måste vara ifyllda (4 st).');
    }
    const correct = typeof editData?.correctOption === 'number' ? editData.correctOption : -1;
    if (correct < 0 || correct >= svOptions.length) {
      errors.push('Korrekt svar måste vara ett giltigt alternativ (A-D).');
    }
    if (!editData?.sv?.explanation || editData.sv.explanation.trim().length < 5) {
      errors.push('Svensk förklaring måste vara minst 5 tecken.');
    }
    if (!editData?.en?.text || editData.en.text.trim().length < 5) {
      errors.push('Engelsk frågetext måste vara minst 5 tecken.');
    }
    const enOptions = normalizeOptionList(editData?.en?.options || []);
    if (enOptions.length !== 4 || enOptions.some((option) => !option || option.trim().length === 0)) {
      errors.push('Alla engelska svarsalternativ måste vara ifyllda (4 st).');
    }
    if (!editData?.en?.explanation || editData.en.explanation.trim().length < 5) {
      errors.push('Engelsk förklaring måste vara minst 5 tecken.');
    }
    if (!Array.isArray(editData?.categories) || editData.categories.length === 0) {
      errors.push('Välj minst en kategori.');
    }
    if (!Array.isArray(editData?.ageGroups) || editData.ageGroups.length === 0) {
      errors.push('Välj minst en åldersgrupp.');
    }
    if (!editData?.targetAudience) {
      errors.push('Välj en målgrupp.');
    }
    if (editData?.timeSensitive && !editData?.bestBeforeDate) {
      errors.push('Ange ett bäst före-datum för tidskänsliga frågor.');
    }
    if (editData?.bestBeforeDate) {
      const parsed = Date.parse(editData.bestBeforeDate);
      if (Number.isNaN(parsed)) {
        errors.push('Bäst före-datum måste vara i formatet YYYY-MM-DD.');
      } else if (parsed <= Date.now()) {
        errors.push('Bäst före-datum måste ligga i framtiden.');
      }
    }
    return errors;
  };

  const handleSaveEdits = async (shouldValidate = false) => {
    if (isSaving) return;
    const errors = validateEditData();
    if (errors.length > 0) {
      setEditErrors(errors);
      return;
    }
    setIsSaving(true);
    setEditErrors([]);
    try {
      await questionService.updateQuestionContent(question.id, editData);
      setIsEditing(false);
      setDialogConfig({
        isOpen: true,
        title: '✅ Frågan uppdaterad',
        message: shouldValidate
          ? 'Frågan sparades och AI-validering startas.'
          : 'Frågan sparades. AI-validering är nollställd tills du kör den igen.',
        type: 'success'
      });
      if (shouldValidate) {
        await handleValidateWithAI();
      }
    } catch (error) {
      console.error('[AdminQuestionsPage] Kunde inte spara ändringar:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid uppdatering',
        message: `Kunde inte spara ändringar: ${error.message}`,
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleValidateWithAI = async (options = {}) => {
    const { allowAutoCorrection = true, force = false } = options;
    if (!question.id) return;

    if (!force && validatingQuestions && validatingQuestions.has(question.id)) {
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
          const detailsEdits = details?.proposedEdits && typeof details.proposedEdits === 'object'
            ? details.proposedEdits
            : null;
          const shouldAutoCorrect = allowAutoCorrection
            && autoCorrectionEnabled
            && detailsEdits
            && isValid === false;
          if (shouldAutoCorrect) {
            setDialogConfig({
              isOpen: true,
              title: '♻️ Auto‑korrigering',
              message: 'AI föreslog ändringar. De appliceras nu och validering körs om.',
              type: 'info'
            });
            await handleApplyProposedEdits(detailsEdits, {
              revalidate: true,
              allowAutoCorrection: false,
              forceValidate: true
            });
            return;
          }
          
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

  const buildEditDataFromProposed = (edits) => {
    if (!edits) return null;
    const base = buildEditState(question);
    const next = {
      ...base,
      sv: { ...base.sv },
      en: { ...base.en }
    };
    if (typeof edits.question_sv === 'string') next.sv.text = edits.question_sv;
    if (Array.isArray(edits.options_sv) && edits.options_sv.length > 0) {
      next.sv.options = normalizeOptionList(edits.options_sv);
    }
    if (typeof edits.explanation_sv === 'string') next.sv.explanation = edits.explanation_sv;
    if (typeof edits.background_sv === 'string') next.sv.background = edits.background_sv;
    if (typeof edits.question_en === 'string') next.en.text = edits.question_en;
    if (Array.isArray(edits.options_en) && edits.options_en.length > 0) {
      next.en.options = normalizeOptionList(edits.options_en);
    }
    if (typeof edits.explanation_en === 'string') next.en.explanation = edits.explanation_en;
    if (typeof edits.background_en === 'string') next.en.background = edits.background_en;
    if (Number.isFinite(Number(edits.correctOption))) {
      next.correctOption = Number(edits.correctOption);
    }
    return next;
  };

  const handleApplyProposedEdits = async (edits = proposedEdits, options = {}) => {
    const { revalidate = true, allowAutoCorrection = false, forceValidate = false } = options;
    if (!edits || isApplyingEdits) return;
    const nextEditData = buildEditDataFromProposed(edits);
    if (!nextEditData) return;

    setIsApplyingEdits(true);
    try {
      await questionService.updateQuestionContent(question.id, nextEditData);
      setDialogConfig({
        isOpen: true,
        title: '✅ Ändringar applicerade',
        message: 'AI‑förslagen är nu sparade.',
        type: 'success'
      });
      if (revalidate) {
        await handleValidateWithAI({ allowAutoCorrection, force: forceValidate });
      }
    } catch (error) {
      console.error('[AdminQuestionsPage] Kunde inte applicera AI‑ändringar:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid uppdatering',
        message: `Kunde inte applicera AI‑förslag: ${error.message}`,
        type: 'error'
      });
    } finally {
      setIsApplyingEdits(false);
    }
  };

  const handleReactivateExpired = async () => {
    const defaultDate = bestBeforeAt ? new Date(bestBeforeAt).toISOString().slice(0, 10) : '';
    const nextDate = window.prompt(
      'Ange nytt bäst före-datum (YYYY-MM-DD). Lämna tomt för att ta bort bäst före och göra frågan evergreen.',
      defaultDate
    );

    if (nextDate === null) {
      return;
    }

    const trimmed = nextDate.trim();
    let bestBeforeAtValue = null;
    let timeSensitiveValue = false;

    if (trimmed) {
      const parsed = Date.parse(trimmed);
      if (Number.isNaN(parsed)) {
        setDialogConfig({
          isOpen: true,
          title: 'Felaktigt datum',
          message: 'Datumet måste vara i formatet YYYY-MM-DD.',
          type: 'error'
        });
        return;
      }
      if (parsed <= Date.now()) {
        setDialogConfig({
          isOpen: true,
          title: 'Bäst före har redan passerat',
          message: 'Ange ett datum som ligger i framtiden.',
          type: 'error'
        });
        return;
      }
      bestBeforeAtValue = parsed;
      timeSensitiveValue = true;
    }

    try {
      await questionService.updateQuestionMeta(question.id, {
        timeSensitive: timeSensitiveValue,
        bestBeforeAt: bestBeforeAtValue,
        quarantined: false,
        quarantinedAt: null,
        quarantineReason: null,
        aiValidated: false,
        aiValidationResult: null,
        aiValidatedAt: null
      });

      setDialogConfig({
        isOpen: true,
        title: 'Fråga återaktiverad',
        message: 'Frågan är nu aktiv igen.',
        type: 'success'
      });

      if (isValidationBlocked) {
        setDialogConfig({
          isOpen: true,
          title: 'Validering saknas',
          message: 'Frågan återaktiverades men kan inte AI-valideras eftersom ingen alternativ provider är aktiv.',
          type: 'warning'
        });
        return;
      }

      await handleValidateWithAI();
    } catch (error) {
      console.error('[AdminQuestionsPage] Kunde inte återaktivera fråga:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Fel vid återaktivering',
        message: `Kunde inte återaktivera fråga: ${error.message}`,
        type: 'error'
      });
    }
  };

  const rawAiResult = question.aiValidationResult;
  const structureResult =
    question.structureValidationResult ||
    (rawAiResult?.validationType === 'structure' ? rawAiResult : null);
  const aiResult =
    rawAiResult && rawAiResult.validationType !== 'structure' ? rawAiResult : null;
  const aiResultValid = typeof aiResult?.valid === 'boolean'
    ? aiResult.valid
    : typeof aiResult?.isValid === 'boolean'
      ? aiResult.isValid
      : null;
  const autoCorrectionEnabled = aiRulesConfig?.global?.autoCorrection?.enabled === true;
  const proposedEdits = aiResult?.proposedEdits && typeof aiResult.proposedEdits === 'object'
    ? aiResult.proposedEdits
    : null;
  const hasProposedEdits = Boolean(
    proposedEdits && Object.values(proposedEdits).some((value) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== null && value !== undefined && value !== '';
    })
  );
  const validationContext = aiResult?.validationContext || null;

  const hasStructurePass = structureResult?.valid === true;
  const hasStructureIssue = structureResult?.valid === false;

  const aiPassed =
    question.manuallyApproved === true ||
    aiResultValid === true ||
    question.aiValidated === true;
  const hasAiIssue =
    question.manuallyRejected === true ||
    aiResultValid === false;
  const aiValidationState = aiResultValid === true
    ? 'passed'
    : aiResultValid === false
      ? 'failed'
      : (question.aiValidated ? 'passed' : 'unknown');
  const aiValidatedState = aiValidationState === 'passed'
    ? true
    : aiValidationState === 'failed'
      ? false
      : null;
  const showSkippedValidationBadge = !aiResult && !aiValidatedState && !question.manuallyApproved
    && !question.manuallyRejected && !validationProvidersLoading && !hasAlternativeValidationProvider;
  const editingLang = editData?.[currentLang] || editData?.sv || { text: '', options: [], explanation: '', background: '' };
  const baseCategoryChoices = Array.isArray(categoryOptions)
    ? categoryOptions.map((option) => ({ value: option.value, label: option.label || option.value }))
    : [];
  const categoryChoiceValues = new Set(baseCategoryChoices.map((option) => option.value));
  const extraCategories = (editData?.categories || []).filter((value) => !categoryChoiceValues.has(value));
  const categoryChoices = [
    ...baseCategoryChoices,
    ...extraCategories.map((value) => ({ value, label: value }))
  ];
  const baseAgeGroupChoices = Array.isArray(ageGroupOptions)
    ? ageGroupOptions.map((group) => ({
      value: group.id,
      label: formatAgeGroupLabel(group) || group.label || group.id
    }))
    : [];
  const ageGroupChoiceValues = new Set(baseAgeGroupChoices.map((option) => option.value));
  const extraAgeGroups = (editData?.ageGroups || []).filter((value) => !ageGroupChoiceValues.has(value));
  const ageGroupChoices = [
    ...baseAgeGroupChoices,
    ...extraAgeGroups.map((value) => ({ value, label: value }))
  ];
  const baseTargetAudienceChoices = Array.isArray(targetAudienceOptions)
    ? targetAudienceOptions.map((target) => ({
      value: target.id,
      label: target.label || target.id
    }))
    : [];
  const targetChoiceValues = new Set(baseTargetAudienceChoices.map((option) => option.value));
  const extraTargets = editData?.targetAudience && !targetChoiceValues.has(editData.targetAudience)
    ? [{ value: editData.targetAudience, label: editData.targetAudience }]
    : [];
  const targetAudienceChoices = [...baseTargetAudienceChoices, ...extraTargets];
  const baseDifficultyChoices = ['easy', 'medium', 'hard'];
  const difficultyValue = editData?.difficulty || 'medium';
  const difficultyChoices = baseDifficultyChoices.includes(difficultyValue)
    ? baseDifficultyChoices
    : [...baseDifficultyChoices, difficultyValue];

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
                {isExpired && (
                  <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-200" title="Bäst före-datum har passerat">
                    ⏳ Utgången
                  </span>
                )}
                {!isExpired && bestBeforeLabel && (
                  <span className="inline-flex items-center rounded-full bg-slate-700/60 px-2.5 py-0.5 text-xs font-medium text-slate-100" title="Bäst före-datum">
                    ⏳ Bäst före {bestBeforeLabel}
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
                  <span
                    className="inline-flex items-center rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs font-medium text-green-300"
                    title={`AI-validerad${aiResult?.provider ? ` med ${formatProviderLabel(aiResult.provider)}` : ''}`}
                  >
                    ✓ AI-OK{aiResult?.provider ? ` (${formatProviderLabel(aiResult.provider)})` : ''}
                  </span>
                )}
                {hasAiIssue && (
                  <span className="inline-flex items-center rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-medium text-red-300" title="AI-validering - problem hittades">
                    ✗ AI-fel
                  </span>
                )}
                {showSkippedValidationBadge && (
                  <span
                    className="inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-200"
                    title={`Validering hoppad över: ingen alternativ provider${providerLabel ? ` (skapad av ${providerLabel})` : ''}`}
                  >
                    ⏭ Ingen validering
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

                  {isExpired && (
                    <button
                      onClick={handleReactivateExpired}
                      className="rounded bg-amber-600 px-3 py-1 text-sm font-semibold text-white hover:bg-amber-500"
                      title="Återaktivera fråga och kör ny AI-validering"
                    >
                      ♻️ Återaktivera
                    </button>
                  )}
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
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Aktualitet:</span>
                  <span className="text-xs text-gray-200">
                    {question.timeSensitive
                      ? (isExpired ? 'Utgången' : (bestBeforeLabel ? `Bäst före ${bestBeforeLabel}` : 'Tidskänslig'))
                      : 'Evergreen'}
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

          {isEditing && (
            <div className="rounded border border-cyan-500/30 bg-slate-900/60 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-cyan-200">✏️ Redigera fråga</p>
                  <p className="text-xs text-gray-400">Sparar nollställer tidigare AI-validering.</p>
                </div>
                <div className="flex items-center rounded-full bg-slate-800 p-0.5">
                  <button
                    type="button"
                    onClick={() => setCurrentLang('sv')}
                    className={`px-2 py-0.5 text-xs rounded-full ${currentLang === 'sv' ? 'bg-cyan-500 text-black' : 'text-gray-300'}`}
                  >
                    SV
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentLang('en')}
                    className={`px-2 py-0.5 text-xs rounded-full ${currentLang === 'en' ? 'bg-cyan-500 text-black' : 'text-gray-300'}`}
                  >
                    EN
                  </button>
                </div>
              </div>

              {editErrors.length > 0 && (
                <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                  <p className="font-semibold mb-1">Åtgärda innan sparning:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {editErrors.map((error, idx) => (
                      <li key={`edit-error-${question.id}-${idx}`}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Frågetext ({currentLang.toUpperCase()})
                  </label>
                  <textarea
                    value={editingLang.text}
                    onChange={(e) => updateLangField(currentLang, 'text', e.target.value)}
                    className="w-full min-h-[80px] rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                    placeholder={`Skriv frågetext på ${currentLang === 'sv' ? 'svenska' : 'engelska'}...`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Svarsalternativ ({currentLang.toUpperCase()})
                  </label>
                  <div className="space-y-2">
                    {normalizeOptionList(editingLang.options).map((option, optionIndex) => (
                      <div key={`option-${question.id}-${currentLang}-${optionIndex}`} className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-400 w-6">
                          {String.fromCharCode(65 + optionIndex)}:
                        </span>
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => updateLangOption(currentLang, optionIndex, e.target.value)}
                          className="flex-1 rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                          placeholder={`Alternativ ${optionIndex + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Förklaring ({currentLang.toUpperCase()})
                  </label>
                  <textarea
                    value={editingLang.explanation}
                    onChange={(e) => updateLangField(currentLang, 'explanation', e.target.value)}
                    className="w-full min-h-[70px] rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                    placeholder="Skriv en kort förklaring..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Bakgrund ({currentLang.toUpperCase()})
                  </label>
                  <textarea
                    value={editingLang.background}
                    onChange={(e) => updateLangField(currentLang, 'background', e.target.value)}
                    className="w-full min-h-[70px] rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                    placeholder="Fördjupande bakgrund (valfritt)..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-300 mb-2">Kategorier</p>
                  <div className="flex flex-wrap gap-2">
                    {categoryChoices.map((option) => (
                      <label key={`category-${question.id}-${option.value}`} className="inline-flex items-center gap-2 rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-gray-200">
                        <input
                          type="checkbox"
                          checked={editData.categories.includes(option.value)}
                          onChange={() => toggleListValue('categories', option.value)}
                          className="h-4 w-4 rounded border-gray-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-300 mb-2">Åldersgrupper</p>
                  <div className="flex flex-wrap gap-2">
                    {ageGroupChoices.map((option) => (
                      <label key={`age-${question.id}-${option.value}`} className="inline-flex items-center gap-2 rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-gray-200">
                        <input
                          type="checkbox"
                          checked={editData.ageGroups.includes(option.value)}
                          onChange={() => toggleListValue('ageGroups', option.value)}
                          className="h-4 w-4 rounded border-gray-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Målgrupp</label>
                  <select
                    value={editData.targetAudience}
                    onChange={(e) => setEditData((prev) => ({ ...prev, targetAudience: e.target.value }))}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  >
                    {targetAudienceChoices.map((option) => (
                      <option key={`target-${question.id}-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Svårighetsgrad</label>
                  <select
                    value={editData.difficulty}
                    onChange={(e) => setEditData((prev) => ({ ...prev, difficulty: e.target.value }))}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  >
                    {difficultyChoices.map((value) => (
                      <option key={`difficulty-${question.id}-${value}`} value={value}>
                        {value === 'easy' ? 'Lätt' : value === 'medium' ? 'Medel' : value === 'hard' ? 'Svår' : value}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Korrekt svar</label>
                  <select
                    value={editData.correctOption}
                    onChange={(e) => setEditData((prev) => ({ ...prev, correctOption: Number(e.target.value) }))}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  >
                    {normalizeOptionList(editData.sv.options).map((option, optionIndex) => (
                      <option key={`correct-${question.id}-${optionIndex}`} value={optionIndex}>
                        {String.fromCharCode(65 + optionIndex)}: {option || 'Tomt'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Emoji (valfritt)</label>
                  <input
                    type="text"
                    value={editData.emoji}
                    onChange={(e) => setEditData((prev) => ({ ...prev, emoji: e.target.value }))}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                    placeholder="Ex: 🎯"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Bäst före</label>
                  <label className="flex items-center gap-2 text-xs text-gray-300 mb-2">
                    <input
                      type="checkbox"
                      checked={editData.timeSensitive === true}
                      onChange={(e) => setEditData((prev) => ({
                        ...prev,
                        timeSensitive: e.target.checked,
                        bestBeforeDate: e.target.checked ? prev.bestBeforeDate : ''
                      }))}
                      className="h-4 w-4 rounded border-gray-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                    />
                    Frågan är tidskänslig
                  </label>
                  <input
                    type="date"
                    value={editData.bestBeforeDate || ''}
                    onChange={(e) => setEditData((prev) => ({
                      ...prev,
                      bestBeforeDate: e.target.value,
                      timeSensitive: true
                    }))}
                    disabled={!editData.timeSensitive}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-cyan-500 focus:outline-none disabled:opacity-60"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    Lämna tomt om frågan inte behöver ett bäst före-datum.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveEdits(false)}
                  disabled={isSaving}
                  className="px-3 py-1 text-xs rounded-md bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-slate-700 disabled:text-gray-400"
                >
                  {isSaving ? '⏳ Sparar...' : '💾 Spara'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveEdits(true)}
                  disabled={isSaving}
                  className="px-3 py-1 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-700 disabled:text-gray-400"
                >
                  {isSaving ? '⏳ Sparar...' : '🚀 Spara + AI-validera'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="px-3 py-1 text-xs rounded-md bg-slate-700 hover:bg-slate-600 text-white disabled:bg-slate-800 disabled:text-gray-500"
                >
                  Avbryt
                </button>
              </div>
            </div>
          )}

          <div className="bg-slate-800/40 rounded border border-slate-600 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400">🧭 Prompt-info</p>
              <button
                type="button"
                onClick={() => setShowPromptInfo((prev) => !prev)}
                className="text-xs text-cyan-200 hover:text-cyan-100"
              >
                {showPromptInfo ? 'Dölj' : 'Visa'}
              </button>
            </div>
            {showPromptInfo && (
              <div className="mt-3 space-y-3 text-xs text-gray-200">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">Åldersgrupp</div>
                  {resolvedAgeGroupDetails.length > 0 ? (
                    <div className="space-y-2">
                      {resolvedAgeGroupDetails.map((group) => (
                        <div key={`prompt-age-${question.id}-${group.id}`}>
                          <div className="font-semibold">{formatAgeGroupLabel(group) || group.label || group.id}</div>
                          <div className="text-gray-300">
                            {group.prompt || group.description || 'Ingen prompt sparad.'}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-300">Ingen åldersgruppsprompt hittades.</div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">Kategori</div>
                  {resolvedCategoryDetails.length > 0 ? (
                    <div className="space-y-2">
                      {resolvedCategoryDetails.map((category) => (
                        <div key={`prompt-cat-${question.id}-${category.value}`}>
                          <div className="font-semibold">{category.label || category.value}</div>
                          <div className="text-gray-300">
                            {category.prompt || category.description || 'Ingen prompt sparad.'}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-300">Ingen kategoriprompt hittades.</div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">Målgrupp</div>
                  {resolvedTargetAudience ? (
                    <div>
                      <div className="font-semibold">{resolvedTargetAudience.label || resolvedTargetAudience.id}</div>
                      <div className="text-gray-300">
                        {resolvedTargetAudience.prompt || resolvedTargetAudience.description || 'Ingen prompt sparad.'}
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-300">Ingen målgruppsprompt hittades.</div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">AI-regler</div>
                  {loadingAiRules && (
                    <div className="text-gray-300">Laddar AI-regler...</div>
                  )}
                  {!loadingAiRules && !aiRulesConfig && (
                    <div className="text-gray-300">Inga AI-regler hittades.</div>
                  )}
                  {!loadingAiRules && aiRulesConfig && (
                    <div className="space-y-2 text-gray-300">
                      <div>
                        Svar i frågan: {answerRule?.enabled === false
                          ? 'Av'
                          : `På (min ${answerRule?.minAnswerLength || 4} tecken)`}
                      </div>
                      {maxLengthEntries.length > 0 ? (
                        <div>
                          Max frågelängd:{' '}
                          {maxLengthEntries.map((entry) => {
                            const label = formatAgeGroupLabel(
                              (Array.isArray(ageGroupOptions) ? ageGroupOptions.find((option) => option.id === entry.group) : null)
                              || { id: entry.group, label: entry.group }
                            );
                            return `${label}: ${entry.value} tecken`;
                          }).join(' · ')}
                        </div>
                      ) : (
                        <div>Max frågelängd: Ingen gräns satt.</div>
                      )}
                      {activeBlocklist.length > 0 ? (
                        <div>
                          Blocklista ({activeBlocklist.length}):
                          <div className="mt-1 space-y-1">
                            {activeBlocklist.map((rule, idx) => (
                              <div key={`rule-${question.id}-${idx}`}>
                                <span className="font-semibold">{rule.pattern}</span>
                                {rule.issue ? ` → ${rule.issue}` : ''}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>Blocklista: Inga regler som matchar frågan.</div>
                      )}
                      {freshnessRules ? (
                        <div>
                          Aktualitet: {freshnessRules.enabled === false ? 'Av' : 'På'}
                          {freshnessRules.enabled !== false && (
                            <div className="mt-1 space-y-1">
                              <div>
                                Standard: {freshnessRules.defaultShelfLifeDays || 0} dagar
                                {freshnessRules.minShelfLifeDays ? ` · Min ${freshnessRules.minShelfLifeDays} dagar` : ''}
                                {freshnessRules.maxShelfLifeDays ? ` · Max ${freshnessRules.maxShelfLifeDays} dagar` : ''}
                              </div>
                              <div>Auto‑tidskänslig: {autoTimeSensitiveLabel}</div>
                              {showFreshnessGuidance && (
                                <div>Riktlinje: {freshnessRules.guidance}</div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>Aktualitet: Ingen regelkonfig.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
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

          {!isEditing && (
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
          )}

          {!isEditing && displayLang?.explanation && (
            <div className="p-3 bg-slate-800/40 rounded border border-slate-600">
              <p className="text-sm font-semibold text-gray-300 mb-1">Förklaring ({currentLang.toUpperCase()}):</p>
              <p className="text-sm text-gray-300">{displayLang.explanation}</p>
            </div>
          )}

          {!isEditing && displayLang?.background && (
            <div className="p-3 bg-slate-800/40 rounded border border-slate-600">
              <p className="text-sm font-semibold text-gray-300 mb-1">Bakgrund ({currentLang.toUpperCase()}):</p>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{displayLang.background}</p>
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

          {!aiResult && !aiValidatedState && !question.manuallyApproved && !question.manuallyRejected && !validationProvidersLoading && !hasAlternativeValidationProvider && (
            <div
              className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200"
              title={`Validering hoppad över: ingen alternativ provider${providerLabel ? ` (skapad av ${providerLabel})` : ''}`}
            >
              Validering hoppad över: ingen alternativ provider.
            </div>
          )}

          {/* AI-Valideringsresultat */}
          {aiResult && (
            <div
              className={`p-4 rounded border ${
                question.manuallyRejected
                  ? 'bg-orange-500/10 border-orange-500/30'
                  : aiValidationState === 'passed'
                  ? question.manuallyApproved
                    ? 'bg-blue-500/10 border-blue-500/30'
                    : 'bg-green-500/10 border-green-500/30'
                  : aiValidationState === 'failed'
                    ? 'bg-red-500/10 border-red-500/30'
                    : 'bg-amber-500/10 border-amber-500/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm font-bold ${
                  question.manuallyRejected ? 'text-orange-300' :
                  aiValidationState === 'passed'
                    ? (question.manuallyApproved ? 'text-blue-300' : 'text-green-300')
                    : aiValidationState === 'failed'
                      ? 'text-red-300'
                      : 'text-amber-300'
                }`}>
                  {question.manuallyRejected
                    ? '✗ Manuellt underkänd'
                    : aiResult.validationType === 'manual'
                    ? '✓ Manuellt godkänd'
                    : aiValidationState === 'passed'
                      ? '✓ AI-validering: GODKÄND'
                      : aiValidationState === 'failed'
                        ? '✗ AI-validering: UNDERKÄND'
                        : '⏳ AI-validering: EJ KLAR'
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

              {Array.isArray(aiResult.blockingRules) && aiResult.blockingRules.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-amber-300 mb-1">Blockerande regler:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {aiResult.blockingRules.map((rule, idx) => (
                      <li key={idx} className="text-xs text-amber-200">{rule}</li>
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

              {hasProposedEdits && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-amber-300 mb-1">Föreslagna ändringar:</p>
                  <div className="space-y-2 text-xs text-amber-200">
                    {aiResult?.proposedEditsReason && (
                      <div className="text-xs text-amber-200/90">
                        {aiResult.proposedEditsReason}
                      </div>
                    )}
                    {typeof proposedEdits.question_sv === 'string' && proposedEdits.question_sv.trim() !== '' && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-amber-300/80">Fråga (SV)</div>
                        <div>{proposedEdits.question_sv}</div>
                      </div>
                    )}
                    {Array.isArray(proposedEdits.options_sv) && proposedEdits.options_sv.length > 0 && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-amber-300/80">Alternativ (SV)</div>
                        <ul className="list-disc list-inside">
                          {proposedEdits.options_sv.map((option, idx) => (
                            <li key={`sv-opt-${idx}`}>{option}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {typeof proposedEdits.question_en === 'string' && proposedEdits.question_en.trim() !== '' && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-amber-300/80">Fråga (EN)</div>
                        <div>{proposedEdits.question_en}</div>
                      </div>
                    )}
                    {Array.isArray(proposedEdits.options_en) && proposedEdits.options_en.length > 0 && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-amber-300/80">Alternativ (EN)</div>
                        <ul className="list-disc list-inside">
                          {proposedEdits.options_en.map((option, idx) => (
                            <li key={`en-opt-${idx}`}>{option}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {Number.isFinite(Number(proposedEdits.correctOption)) && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-amber-300/80">Korrekt svar</div>
                        <div>Index: {Number(proposedEdits.correctOption)}</div>
                      </div>
                    )}
                    {typeof proposedEdits.explanation_sv === 'string' && proposedEdits.explanation_sv.trim() !== '' && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-amber-300/80">Förklaring (SV)</div>
                        <div className="whitespace-pre-wrap">{proposedEdits.explanation_sv}</div>
                      </div>
                    )}
                    {typeof proposedEdits.background_sv === 'string' && proposedEdits.background_sv.trim() !== '' && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-amber-300/80">Bakgrund (SV)</div>
                        <div className="whitespace-pre-wrap">{proposedEdits.background_sv}</div>
                      </div>
                    )}
                    {typeof proposedEdits.explanation_en === 'string' && proposedEdits.explanation_en.trim() !== '' && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-amber-300/80">Förklaring (EN)</div>
                        <div className="whitespace-pre-wrap">{proposedEdits.explanation_en}</div>
                      </div>
                    )}
                    {typeof proposedEdits.background_en === 'string' && proposedEdits.background_en.trim() !== '' && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-amber-300/80">Bakgrund (EN)</div>
                        <div className="whitespace-pre-wrap">{proposedEdits.background_en}</div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApplyProposedEdits(proposedEdits, { revalidate: true, allowAutoCorrection: false })}
                    disabled={isApplyingEdits || isEditing}
                    className={`mt-3 px-3 py-1 text-xs rounded-md transition-colors ${
                      isApplyingEdits || isEditing
                        ? 'bg-slate-700 text-gray-400 cursor-not-allowed'
                        : 'bg-amber-500 text-slate-900 hover:bg-amber-400'
                    }`}
                  >
                    {isApplyingEdits ? '⏳ Applicerar...' : '✅ Godkänn ändringar'}
                  </button>
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

              {aiResult.background && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-gray-300 mb-1">Bakgrund:</p>
                  <p className="text-xs text-gray-300 whitespace-pre-wrap">
                    {aiResult.background}
                  </p>
                </div>
              )}

              {Array.isArray(aiResult.factSummary) && aiResult.factSummary.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-gray-300 mb-1">Faktapunkter:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {aiResult.factSummary.map((fact, idx) => (
                      <li key={idx} className="text-xs text-gray-300">{fact}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validationContext && (
                <div className="mt-3 rounded border border-slate-700 bg-slate-900/50 p-3">
                  <p className="text-xs font-semibold text-gray-300 mb-2">Valideringsunderlag</p>
                  <div className="space-y-1 text-xs text-gray-300">
                    {validationContext.validationProvider && (
                      <div>
                        <span className="text-gray-400">Valideringsprovider:</span>{' '}
                        {formatProviderLabel(validationContext.validationProvider)}
                      </div>
                    )}
                    {validationContext.generatorProvider && (
                      <div>
                        <span className="text-gray-400">Generator:</span>{' '}
                        {formatProviderLabel(validationContext.generatorProvider)}
                      </div>
                    )}
                    {(validationContext.criteria?.category ||
                      validationContext.criteria?.ageGroup ||
                      validationContext.criteria?.difficulty) && (
                      <div>
                        <span className="text-gray-400">Kriterier:</span>{' '}
                        {[validationContext.criteria?.category,
                          validationContext.criteria?.ageGroup,
                          validationContext.criteria?.difficulty]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                    {validationContext.question?.targetAudience && (
                      <div>
                        <span className="text-gray-400">Målgrupp:</span>{' '}
                        {validationContext.question.targetAudience}
                      </div>
                    )}
                    {validationContext.question?.question_sv && (
                      <div>
                        <span className="text-gray-400">Fråga (SV):</span>{' '}
                        {validationContext.question.question_sv}
                      </div>
                    )}
                    {validationContext.question?.question_en && (
                      <div>
                        <span className="text-gray-400">Fråga (EN):</span>{' '}
                        {validationContext.question.question_en}
                      </div>
                    )}
                    {Array.isArray(validationContext.question?.options_sv) && (
                      <div>
                        <span className="text-gray-400">Alternativ (SV):</span>{' '}
                        {validationContext.question.options_sv.join(' | ')}
                      </div>
                    )}
                    {Array.isArray(validationContext.question?.options_en) && validationContext.question.options_en.length > 0 && (
                      <div>
                        <span className="text-gray-400">Alternativ (EN):</span>{' '}
                        {validationContext.question.options_en.join(' | ')}
                      </div>
                    )}
                    {typeof validationContext.question?.correctOption === 'number' && (
                      <div>
                        <span className="text-gray-400">Rätt svar:</span>{' '}
                        {String.fromCharCode(65 + validationContext.question.correctOption)} ({validationContext.question.correctOption})
                      </div>
                    )}
                  </div>
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
                      const providerLabel = formatProviderLabel(provider);
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
            <p>Skapad av: {createdByDisplay}</p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-700">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-1 text-xs rounded-md bg-cyan-600 hover:bg-cyan-700 text-white transition-colors"
              >
                ✏️ Redigera
              </button>
            )}
            {/* Visa AI-valideringsknapp endast om frågan INTE är AI-validerad */}
            {!aiPassed && (
              <button
                onClick={handleValidateWithAI}
                disabled={isEditing || isValidationBlocked || (validatingQuestions && validatingQuestions.has(question.id))}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  isEditing || isValidationBlocked || (validatingQuestions && validatingQuestions.has(question.id))
                    ? 'bg-gray-600 text-gray-400 opacity-50 cursor-not-allowed' 
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
                title={isEditing ? 'Avsluta redigering för att validera' : (validationDisabledReason || 'AI-validera')}
              >
                {validatingQuestions && validatingQuestions.has(question.id)
                  ? '⏳ Validerar...'
                  : '✅ AI-validera'}
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
  const location = useLocation();
  const { isSuperUser, currentUser } = useAuth();
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
  const [aiProvider, setAiProvider] = useState('random'); // random, gemini, anthropic, openai, mistral, groq, openrouter, together, fireworks
  const [aiStatus, setAiStatus] = useState(null); // Status för alla providers
  const [loadingAiStatus, setLoadingAiStatus] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState(DEFAULT_CATEGORY_OPTIONS);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [ageGroupOptions, setAgeGroupOptions] = useState(DEFAULT_AGE_GROUPS);
  const [loadingAgeGroups, setLoadingAgeGroups] = useState(false);
  const [targetAudienceOptions, setTargetAudienceOptions] = useState(DEFAULT_TARGET_AUDIENCES);
  const [aiRulesConfig, setAiRulesConfig] = useState(null);
  const [loadingAiRules, setLoadingAiRules] = useState(false);
  const [validationProviders, setValidationProviders] = useState(null);
  const [validationProvidersLoading, setValidationProvidersLoading] = useState(false);
  const [expandedQuestion, setExpandedQuestion] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [validationStatusFilter, setValidationStatusFilter] = useState('all'); // 'all' | 'validated' | 'failed' | 'unvalidated' | 'reported' | 'expired'
  const [selectedAgeGroup, setSelectedAgeGroup] = useState('all');
  const [selectedAudience, setSelectedAudience] = useState('all');
  const [selectedQuestions, setSelectedQuestions] = useState(new Set());
  const [idFilter, setIdFilter] = useState(null);
  const [idFilterTaskId, setIdFilterTaskId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const isMountedRef = useRef(true);
  const validationPollRef = useRef(null);
  const validationSourceRef = useRef(null);
  const [validationSyncing, setValidationSyncing] = useState(false);
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const availableProviders = aiStatus
    ? Object.entries(aiStatus).filter(([, info]) => info?.available)
    : [];
  const getAgeGroupLabel = (value) => {
    if (!value) return '';
    const match = ageGroupOptions.find((group) => group.id === value);
    return match ? formatAgeGroupLabel(match) : value;
  };

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

  useEffect(() => {
    let isActive = true;

    const loadAiRules = async () => {
      setLoadingAiRules(true);
      try {
        const response = await fetch('/api/ai-rules');
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Kunde inte ladda AI-regler');
        }
        if (isActive) {
          setAiRulesConfig(data.config || null);
        }
      } catch (error) {
        console.warn('[AdminQuestionsPage] Kunde inte ladda AI-regler:', error);
      } finally {
        if (isActive) {
          setLoadingAiRules(false);
        }
      }
    };

    loadAiRules();

    return () => {
      isActive = false;
    };
  }, []);

  // Redirect om användaren inte är SuperUser
  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
    }
  }, [isSuperUser, navigate]);

  useEffect(() => {
    let isActive = true;

    const loadCategories = async () => {
      setLoadingCategories(true);
      try {
        const categories = await categoryService.getCategories();
        if (!isActive) return;
        if (categories && categories.length > 0) {
          const nextOptions = categories.map((category) => ({
            value: category.name,
            label: category.name,
            description: category.description || '',
            prompt: category.prompt || ''
          }));
          setCategoryOptions(nextOptions);
          const optionValues = new Set(nextOptions.map((option) => option.value));
          setAiCategory((prev) => (prev && optionValues.has(prev) ? prev : ''));
        }
      } catch (error) {
        console.warn('[AdminQuestionsPage] Kunde inte ladda kategorier:', error);
      } finally {
        if (isActive) {
          setLoadingCategories(false);
        }
      }
    };

    loadCategories();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadAgeGroups = async () => {
      setLoadingAgeGroups(true);
      try {
        const config = await audienceService.getAudienceConfig();
        if (!isActive) return;
        if (config?.ageGroups && config.ageGroups.length > 0) {
          setAgeGroupOptions(config.ageGroups);
          const optionIds = new Set(config.ageGroups.map((group) => group.id));
          setAiAgeGroup((prev) => (prev && optionIds.has(prev) ? prev : ''));
        }
        if (config?.targetAudiences && config.targetAudiences.length > 0) {
          setTargetAudienceOptions(config.targetAudiences);
        }
      } catch (error) {
        console.warn('[AdminQuestionsPage] Kunde inte ladda åldersgrupper:', error);
      } finally {
        if (isActive) {
          setLoadingAgeGroups(false);
        }
      }
    };

    loadAgeGroups();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (validationPollRef.current) {
        clearTimeout(validationPollRef.current);
        validationPollRef.current = null;
      }
      if (validationSourceRef.current) {
        validationSourceRef.current.close();
        validationSourceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const idsParam = params.get('ids');
    const taskIdParam = params.get('taskId');

    if (idsParam) {
      const ids = idsParam
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      const nextKey = ids.join(',');
      const currentKey = idFilter ? Array.from(idFilter).join(',') : '';
      if (nextKey !== currentKey) {
        setIdFilter(ids.length > 0 ? new Set(ids) : null);
        setIdFilterTaskId(taskIdParam || null);
        setCurrentPage(1);
      }
    } else if (idFilter) {
      setIdFilter(null);
      setIdFilterTaskId(null);
      setCurrentPage(1);
    }
  }, [location.search, idFilter]);

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

  useEffect(() => {
    if (!isSuperUser || !currentUser?.email) return;
    fetchValidationProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperUser, currentUser?.email]);

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
            errorType: p.errorType,
            label: p.label
          };
        });
        
        setAiStatus(providersObj);
        
        // Behåll default "random" om användaren inte har valt något annat
        if (!aiProvider) {
          const available = data.providers.find(p => p.available);
          if (available) {
            setAiProvider(available.name);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch AI status:', error);
      setAiStatus({
        gemini: { available: false, status: 'error', error: 'Kunde inte hämta status' },
        anthropic: { available: false, status: 'error', error: 'Kunde inte hämta status' },
        openai: { available: false, status: 'error', error: 'Kunde inte hämta status' },
        mistral: { available: false, status: 'error', error: 'Kunde inte hämta status' },
        groq: { available: false, status: 'error', error: 'Kunde inte hämta status' },
        openrouter: { available: false, status: 'error', error: 'Kunde inte hämta status' },
        together: { available: false, status: 'error', error: 'Kunde inte hämta status' },
        fireworks: { available: false, status: 'error', error: 'Kunde inte hämta status' }
      });
    } finally {
      setLoadingAiStatus(false);
    }
  };

  const fetchValidationProviders = async () => {
    setValidationProvidersLoading(true);
    try {
      const response = await fetch('/api/getProviderSettings', {
        headers: {
          'x-user-email': currentUser?.email || ''
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Kunde inte hämta provider-inställningar');
      }

      const purposes = data.settings?.purposes?.validation || {};
      const providers = data.settings?.providers || {};
      const enabledValidationProviders = Object.entries(providers)
        .filter(([, config]) => config?.hasKey)
        .filter(([provider]) => purposes[provider] !== false)
        .map(([provider]) => provider);

      setValidationProviders(enabledValidationProviders);
    } catch (error) {
      console.error('Failed to fetch provider settings:', error);
      setValidationProviders([]);
    } finally {
      setValidationProvidersLoading(false);
    }
  };

  const waitForValidationCompletion = async (questionIds, generatorProvider) => {
    if (!Array.isArray(questionIds) || questionIds.length === 0) return;

    const normalizedGenerator = generatorProvider ? generatorProvider.toLowerCase() : null;
    const configuredValidationProviders = Array.isArray(validationProviders) ? validationProviders : null;
    const shouldExpectValidation = configuredValidationProviders
      ? normalizedGenerator
        ? configuredValidationProviders.some(name => name !== normalizedGenerator)
        : configuredValidationProviders.length > 0
      : true;

    if (!shouldExpectValidation) return;

    if (validationPollRef.current) {
      clearTimeout(validationPollRef.current);
      validationPollRef.current = null;
    }
    if (validationSourceRef.current) {
      validationSourceRef.current.close();
      validationSourceRef.current = null;
    }
    if (isMountedRef.current) {
      setValidationSyncing(true);
    }

    const timeoutMs = 2 * 60 * 1000;
    const startTime = Date.now();

    const handleSnapshot = async (tasks) => {
      if (!isMountedRef.current) return true;

      const matchingTasks = (tasks || []).filter((task) => (
        task.taskType === 'validate_questions' &&
        Array.isArray(task.payload?.questionIds) &&
        task.payload.questionIds.some((id) => questionIds.includes(id))
      ));

      const finalTask = matchingTasks.find((task) => (
        task.status === 'completed' ||
        task.status === 'failed' ||
        task.status === 'cancelled'
      ));

      if (finalTask) {
        await questionService.refreshFromServer();
        if (isMountedRef.current) {
          setValidationSyncing(false);
        }
        return true;
      }

      if (Date.now() - startTime >= timeoutMs && isMountedRef.current) {
        setValidationSyncing(false);
        return true;
      }

      return false;
    };

    const poll = async () => {
      if (!isMountedRef.current) return;

      try {
        const response = await fetch('/api/getBackgroundTasks?limit=100');
        const data = await response.json();

        if (response.ok && data.success) {
          const shouldStop = await handleSnapshot(data.tasks || []);
          if (shouldStop) {
            return;
          }
        }
      } catch (error) {
        console.error('Failed to poll validation task:', error);
      }

      if (Date.now() - startTime < timeoutMs) {
        validationPollRef.current = setTimeout(poll, 3000);
      } else if (isMountedRef.current) {
        setValidationSyncing(false);
      }
    };

    if (typeof EventSource !== 'undefined') {
      const source = new EventSource('/api/subscribeToTasks?taskType=validate_questions&limit=100');
      validationSourceRef.current = source;

      source.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data || '{}');
          if (data.success) {
            const shouldStop = await handleSnapshot(data.tasks || []);
            if (shouldStop && validationSourceRef.current) {
              validationSourceRef.current.close();
              validationSourceRef.current = null;
              if (validationPollRef.current) {
                clearTimeout(validationPollRef.current);
                validationPollRef.current = null;
              }
            }
          }
        } catch (error) {
          console.error('Failed to parse validation SSE payload:', error);
        }
      };

      source.onerror = () => {
        if (validationSourceRef.current) {
          validationSourceRef.current.close();
          validationSourceRef.current = null;
        }
        if (validationPollRef.current) {
          clearTimeout(validationPollRef.current);
          validationPollRef.current = null;
        }
        poll();
      };

      validationPollRef.current = setTimeout(() => {
        if (validationSourceRef.current) {
          validationSourceRef.current.close();
          validationSourceRef.current = null;
        }
        if (isMountedRef.current) {
          setValidationSyncing(false);
        }
      }, timeoutMs);
    } else {
      poll();
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
  const ageGroupFilterOptions = ['all', ...Array.from(ageGroupSet).sort((a, b) => {
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
    const matchesIdFilter =
      !idFilter || idFilter.has(question.id);

    const rawAi = question.aiValidationResult;
    const structureResult =
      question.structureValidationResult ||
      (rawAi?.validationType === 'structure' ? rawAi : null);
    const aiResult =
      rawAi && rawAi.validationType !== 'structure' ? rawAi : null;
    const aiResultValid = typeof aiResult?.valid === 'boolean'
      ? aiResult.valid
      : typeof aiResult?.isValid === 'boolean'
        ? aiResult.isValid
        : null;

    const hasStructureResult = Boolean(structureResult);
    const structureValid = structureResult?.valid === true;
    const structureInvalid = structureResult?.valid === false;
    const aiValid =
      question.manuallyApproved === true ||
      aiResultValid === true ||
      question.aiValidated === true;
    const aiInvalid =
      question.manuallyRejected === true ||
      aiResultValid === false;

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
    } else if (validationStatusFilter === 'expired') {
      matchesValidationStatus = question.isExpired === true;
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
      matchesIdFilter &&
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
    navigate('/admin/tasks');

    const requestAmount = aiAmount;

    try {
      const { taskId } = await aiService.startAIGeneration({
        amount: requestAmount,
        category: aiCategory || undefined,
        ageGroup: aiAgeGroup || undefined,
        provider: aiProvider,
        userEmail: currentUser?.email || ''
      });

      if (taskId) {
        const providerLabel = aiProvider === 'random'
          ? 'Blandade providers'
          : (formatProviderLabel(aiProvider) || aiProvider.toUpperCase());
        const descriptorParts = [];
        descriptorParts.push(`${aiAmount} frågor`);
        if (aiCategory) descriptorParts.push(aiCategory);
        if (aiAgeGroup) {
          descriptorParts.push(getAgeGroupLabel(aiAgeGroup));
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
      const completedTask = await taskService.waitForCompletion(taskId);
      await questionService.refreshFromServer();
      const generatedQuestionIds = completedTask?.result?.questions
        ?.map((question) => question.id)
        .filter(Boolean);
      if (generatedQuestionIds && generatedQuestionIds.length > 0) {
        waitForValidationCompletion(generatedQuestionIds, completedTask?.result?.provider || aiProvider);
      }

      const generatedCount =
        completedTask?.result?.questionsGenerated ??
        completedTask?.result?.count ??
        completedTask?.result?.totalSaved;

      if (typeof generatedCount === 'number' && generatedCount === 0) {
        if (isMountedRef.current) {
          setDialogConfig({
            isOpen: true,
            title: 'AI-generering klar, men inga frågor sparades',
            message:
              'Bakgrundsjobbet blev klart men inga nya frågor hamnade i databasen.\n\n' +
              'Öppna DevTools → Console för detaljer, eller testa en annan provider.',
            type: 'warning'
          });
        }
      }

    } catch (error) {
      console.error('Kunde inte generera frågor:', error);
      if (isMountedRef.current) {
        setDialogConfig({
          isOpen: true,
          title: 'Fel vid AI-generering',
          message: `Kunde inte generera frågor: ${error.message}`,
          type: 'error'
        });
      }
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
                    <option value="expired">Utgångna (bäst före)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-cyan-200 mb-2">Åldersgrupp</label>
                  <select
                    value={selectedAgeGroup}
                    onChange={(e) => setSelectedAgeGroup(e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
                  >
                    {ageGroupFilterOptions.map((group) => (
                      <option key={group} value={group}>
                        {group === 'all' ? 'Alla åldersgrupper' : getAgeGroupLabel(group)}
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

        {validationSyncing && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
            <span>Validering pågår för nygenererade frågor. Listan uppdateras automatiskt.</span>
          </div>
        )}

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
            {idFilter && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
                <div>
                  Visar endast {filteredQuestions.length} av {idFilter.size} frågor från bakgrundsjobb
                  {idFilterTaskId ? ` ${idFilterTaskId}` : ''}.
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/admin/questions')}
                  className="rounded bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/30"
                >
                  Rensa filter
                </button>
              </div>
            )}
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
                      validationProviders={validationProviders}
                      validationProvidersLoading={validationProvidersLoading}
                      categoryOptions={categoryOptions}
                      ageGroupOptions={ageGroupOptions}
                      targetAudienceOptions={targetAudienceOptions}
                      aiRulesConfig={aiRulesConfig}
                      loadingAiRules={loadingAiRules}
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
                  const providerLabel = formatProviderLabel(provider);
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
                  disabled={loadingCategories}
                >
                  <option value="">Blandad</option>
                  {categoryOptions.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
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
                  disabled={loadingAgeGroups}
                >
                  <option value="">Blandad</option>
                  {ageGroupOptions.map((group) => (
                    <option key={group.id} value={group.id}>
                      {formatAgeGroupLabel(group)}
                    </option>
                  ))}
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
                  disabled={!aiStatus || availableProviders.length === 0}
                >
                  {/* Slumpmässig option - alltid tillgänglig om någon provider finns */}
                  {aiStatus && availableProviders.length > 0 && (
                    <option value="random">🎲 Slumpmässig (rekommenderad)</option>
                  )}
                  {availableProviders.map(([name, info]) => (
                    <option key={name} value={name}>
                      {info.label || formatProviderLabel(name) || name}
                      {info.model ? ` · ${info.model}` : ''}
                    </option>
                  ))}
                  {(!aiStatus || availableProviders.length === 0) && (
                    <option value="">Ingen provider tillgänglig</option>
                  )}
                </select>
              </div>

              {/* Info box - Dynamisk text baserat på vald provider */}
              {aiProvider === 'random' && aiStatus && availableProviders.length > 0 && (
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
              {aiProvider === 'mistral' && aiStatus?.mistral?.available && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
                  <p className="text-xs text-rose-200">
                    💡 Mistral är snabb och kostnadseffektiv, bra för enklare frågor och stora batcher.
                  </p>
                </div>
              )}
              {aiProvider === 'groq' && aiStatus?.groq?.available && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <p className="text-xs text-yellow-200">
                    💡 Groq är extremt snabb inference för Llama-modeller, perfekt för snabba batcher.
                  </p>
                </div>
              )}
              {aiProvider === 'openrouter' && aiStatus?.openrouter?.available && (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
                  <p className="text-xs text-cyan-200">
                    💡 OpenRouter låter dig välja modeller från flera leverantörer med en och samma nyckel.
                  </p>
                </div>
              )}
              {aiProvider === 'together' && aiStatus?.together?.available && (
                <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-3">
                  <p className="text-xs text-indigo-200">
                    💡 Together AI erbjuder open-source modeller med bra pris/prestanda.
                  </p>
                </div>
              )}
              {aiProvider === 'fireworks' && aiStatus?.fireworks?.available && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-xs text-red-200">
                    💡 Fireworks AI levererar snabba open-source modeller och smidiga endpoints.
                  </p>
                </div>
              )}
              {aiProvider !== 'random' &&
                aiStatus?.[aiProvider]?.available &&
                !['gemini', 'anthropic', 'openai', 'mistral', 'groq', 'openrouter', 'together', 'fireworks'].includes(aiProvider) && (
                <div className="bg-slate-800/60 border border-slate-600 rounded-lg p-3">
                  <p className="text-xs text-slate-200">
                    💡 Custom provider: {aiStatus?.[aiProvider]?.label || formatProviderLabel(aiProvider) || aiProvider}
                    {aiStatus?.[aiProvider]?.model ? ` · ${aiStatus[aiProvider].model}` : ''}
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
                  disabled={!aiStatus || (aiProvider !== 'random' && !aiStatus[aiProvider]?.available) || (aiProvider === 'random' && availableProviders.length === 0)}
                  className={`flex-1 rounded-lg px-4 py-2 font-semibold text-white transition-colors ${
                    (aiStatus && ((aiProvider === 'random' && availableProviders.length > 0) || aiStatus[aiProvider]?.available))
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
