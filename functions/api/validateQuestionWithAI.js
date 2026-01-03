/**
 * VALIDATE QUESTION WITH AI API
 * 
 * Validerar en enskild fråga med AI.
 */

import { ensureDatabase } from '../lib/ensureDatabase.js';
import { AIProviderFactory } from '../lib/ai-providers/index.js';
import { getProviderSettingsSnapshot } from '../lib/providerSettings.js';
import {
  evaluateQuestionRules,
  resolveFreshnessConfig,
  buildFreshnessPrompt,
  buildAnswerInQuestionPrompt
} from '../lib/questionRules.js';
import { getAiRulesConfig } from '../lib/aiRules.js';
import { resolveFreshnessFields, isExpiredByBestBefore } from '../lib/freshness.js';
import {
  getFeedbackInsights,
  getProviderFeedbackScores,
  formatValidationLearningPrompt,
  recordQuestionFeedback
} from '../lib/questionFeedback.js';

const summarizeText = (value, limit = 160) => {
  if (!value) return null;
  const text = String(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…`;
};

const buildValidationContext = ({ questionData, criteria, generatorProvider, validationProvider }) => ({
  generatorProvider: generatorProvider || null,
  validationProvider: validationProvider || null,
  criteria: {
    category: criteria?.category || null,
    ageGroup: criteria?.ageGroup || null,
    difficulty: criteria?.difficulty || null
  },
  question: {
    question_sv: summarizeText(questionData?.question_sv),
    question_en: summarizeText(questionData?.question_en),
    background_sv: summarizeText(questionData?.background_sv),
    background_en: summarizeText(questionData?.background_en),
    options_sv: questionData?.options_sv || null,
    options_en: questionData?.options_en || null,
    correctOption: questionData?.correctOption ?? null,
    targetAudience: questionData?.targetAudience || null,
    emoji: questionData?.emoji || null
  }
});

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await ensureDatabase(env.DB);
    
    const { questionId, provider } = await request.json();
    
    if (!questionId) {
      return new Response(JSON.stringify({
        error: 'questionId is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Hämta frågan från databasen
    const question = await env.DB.prepare(
      'SELECT * FROM questions WHERE id = ?'
    ).bind(questionId).first();

    if (!question) {
      return new Response(JSON.stringify({
        error: 'Question not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Skapa AI provider
    const { providerMap } = await getProviderSettingsSnapshot(env, { decryptKeys: true });
    const aiFactory = new AIProviderFactory(env, providerMap);
    const generationProviderRaw = question.ai_generation_provider || question.provider || '';
    const generationProvider = generationProviderRaw ? generationProviderRaw.toLowerCase() : null;
    const availableProviders = aiFactory.getAvailableProviders('validation');
    const candidates = availableProviders.filter(name => name !== generationProvider);
    const requestedProvider = provider ? provider.toLowerCase() : null;

    let validationProviders = candidates;

    if (requestedProvider) {
      if (requestedProvider === generationProvider) {
        console.warn('[validateQuestionWithAI] Requested provider matches generator, ignoring request.');
      } else if (candidates.includes(requestedProvider)) {
        validationProviders = [
          requestedProvider,
          ...candidates.filter(name => name !== requestedProvider)
        ];
      }
    }

    if (validationProviders.length === 0) {
      return new Response(JSON.stringify({
        error: 'No alternative AI providers available for validation'
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Förbered frågan för validering
    const questionForValidation = {
      question_sv: question.question_sv || question.question,
      question_en: question.question_en,
      options_sv: question.options_sv ? JSON.parse(question.options_sv) : JSON.parse(question.options || '[]'),
      options_en: question.options_en ? JSON.parse(question.options_en) : [],
      correctOption: question.correct_option || question.correctOption,
      explanation_sv: question.explanation_sv || question.explanation,
      explanation_en: question.explanation_en,
      background_sv: question.background_sv || '',
      background_en: question.background_en || question.background_sv || '',
      emoji: question.illustration_emoji || question.emoji,
      targetAudience: question.target_audience || question.targetAudience
    };

    // Validera frågan med AI
    const validationCriteria = {
      category: question.categories ? JSON.parse(question.categories)[0] : 'Allmän',
      ageGroup: question.age_groups ? JSON.parse(question.age_groups)[0] : 'adult',
      difficulty: question.difficulty || 'medium'
    };

    const rulesConfig = await getAiRulesConfig(env.DB);
    const freshnessConfig = resolveFreshnessConfig(rulesConfig, questionForValidation.targetAudience);
    const freshnessPrompt = buildFreshnessPrompt(freshnessConfig, { question });
    const answerInQuestionPrompt = buildAnswerInQuestionPrompt(rulesConfig?.global?.answerInQuestion);
    validationCriteria.freshnessPrompt = freshnessPrompt;
    validationCriteria.answerInQuestionPrompt = answerInQuestionPrompt;
    const validationFeedbackInsights = await getFeedbackInsights(env.DB, {
      feedbackType: 'validation',
      category: validationCriteria.category,
      ageGroup: validationCriteria.ageGroup,
      difficulty: validationCriteria.difficulty,
      targetAudience: questionForValidation.targetAudience || null
    });
    validationCriteria.feedbackPrompt = formatValidationLearningPrompt(validationFeedbackInsights);
    const validationProviderScores = await getProviderFeedbackScores(env.DB, {
      feedbackType: 'validation',
      category: validationCriteria.category,
      ageGroup: validationCriteria.ageGroup,
      difficulty: validationCriteria.difficulty,
      targetAudience: questionForValidation.targetAudience || null
    });
    if (validationProviderScores.size > 0) {
      const requested = requestedProvider && validationProviders.includes(requestedProvider)
        ? requestedProvider
        : null;
      const ordered = validationProviders
        .filter((name) => name !== requested)
        .sort((a, b) => (validationProviderScores.get(b)?.avgRating ?? 0) - (validationProviderScores.get(a)?.avgRating ?? 0));
      validationProviders = requested ? [requested, ...ordered] : ordered;
    }

    const validationLog = {
      questionId,
      generatorProvider: generationProvider,
      requestedProvider,
      availableValidationProviders: availableProviders,
      candidateProviders: candidates,
      criteria: validationCriteria,
      question: {
        question_sv: summarizeText(questionForValidation.question_sv),
        question_en: summarizeText(questionForValidation.question_en),
        background_sv: summarizeText(questionForValidation.background_sv),
        background_en: summarizeText(questionForValidation.background_en),
        options_sv: questionForValidation.options_sv,
        options_en: questionForValidation.options_en,
        correctOption: questionForValidation.correctOption,
        emoji: questionForValidation.emoji
      }
    };
    console.log('[validateQuestionWithAI] Validation context:', validationLog);

    let validationResult;
    let selectedProviderName = null;
    let selectedProvider = null;
    let lastError = null;

    for (const providerName of validationProviders) {
      try {
        selectedProviderName = providerName;
        selectedProvider = aiFactory.getProvider(providerName);
        console.log(`[validateQuestionWithAI] Validating question ${questionId} with ${providerName}`);
        validationResult = await selectedProvider.validateQuestion(questionForValidation, validationCriteria);
        break;
      } catch (aiError) {
        lastError = aiError;
        console.warn(`[validateQuestionWithAI] Provider ${providerName} failed:`, aiError.message);
      }
    }

    if (!validationResult) {
      return new Response(JSON.stringify({
        error: 'No AI providers could validate the question',
        details: lastError ? lastError.message : null
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedValid = typeof validationResult.isValid === 'boolean'
      ? validationResult.isValid
      : typeof validationResult.valid === 'boolean'
        ? validationResult.valid
        : false;
    const alternativeCorrectOptions = Array.isArray(validationResult.alternativeCorrectOptions)
      ? validationResult.alternativeCorrectOptions.filter(Boolean)
      : validationResult.alternativeCorrectOptions
        ? [validationResult.alternativeCorrectOptions]
        : [];
    const multipleCorrectFlag = validationResult.multipleCorrectOptions === true
      || validationResult.multipleCorrectOptions === 'true'
      || validationResult.multipleCorrectOptions === 1;
    let ambiguityCheck = null;
    if (normalizedValid && typeof selectedProvider?.checkAnswerAmbiguity === 'function') {
      try {
        ambiguityCheck = await selectedProvider.checkAnswerAmbiguity(questionForValidation, validationCriteria);
      } catch (error) {
        console.warn('[validateQuestionWithAI] Ambiguity check failed:', error.message);
      }
    }
    const ambiguityAlternatives = Array.isArray(ambiguityCheck?.alternativeCorrectOptions)
      ? ambiguityCheck.alternativeCorrectOptions.filter(Boolean)
      : ambiguityCheck?.alternativeCorrectOptions
        ? [ambiguityCheck.alternativeCorrectOptions]
        : [];
    const ambiguitySuggestions = Array.isArray(ambiguityCheck?.suggestions)
      ? ambiguityCheck.suggestions.filter(Boolean)
      : ambiguityCheck?.suggestions
        ? [ambiguityCheck.suggestions]
        : [];
    const ambiguityReason = String(ambiguityCheck?.reason || '').trim();
    const ambiguityFlag = ambiguityCheck?.multipleCorrectOptions === true
      || ambiguityCheck?.multipleCorrectOptions === 'true'
      || ambiguityCheck?.multipleCorrectOptions === 1;
    const mergedAlternativeCorrectOptions = Array.from(new Set([
      ...alternativeCorrectOptions,
      ...ambiguityAlternatives
    ]));
    const baseSuggestions = Array.from(new Set([
      ...(Array.isArray(validationResult.suggestions) ? validationResult.suggestions.filter(Boolean) : []),
      ...ambiguitySuggestions
    ]));
    const hasMultipleCorrectOptions = multipleCorrectFlag
      || alternativeCorrectOptions.length > 0
      || ambiguityFlag
      || ambiguityAlternatives.length > 0;
    const ruleCheck = evaluateQuestionRules(questionForValidation, {
      ...validationCriteria,
      targetAudience: questionForValidation.targetAudience
    }, rulesConfig);
    const blockingRules = ruleCheck?.issues || [];
    const freshnessInput = {
      ...questionForValidation,
      ...validationResult,
      ageGroup: validationCriteria.ageGroup,
      ageGroups: question.age_groups ? JSON.parse(question.age_groups) : null
    };
    const now = Date.now();
    const freshness = resolveFreshnessFields(freshnessInput, freshnessConfig, now);
    const expired = isExpiredByBestBefore(freshness.bestBeforeAt, now);
    const combinedIssues = Array.isArray(validationResult.issues) ? [...validationResult.issues] : [];
    if (!ruleCheck.isValid) {
      combinedIssues.push(...ruleCheck.issues);
    }
    if (hasMultipleCorrectOptions) {
      const alternativesText = mergedAlternativeCorrectOptions.length > 0
        ? ` Möjliga alternativ: ${mergedAlternativeCorrectOptions.join(', ')}.`
        : '';
      const reasonText = ambiguityReason ? ` Orsak: ${ambiguityReason}` : '';
      const ambiguityMessage = `Flera svarsalternativ kan vara korrekta.${alternativesText}${reasonText}`.trim();
      if (!combinedIssues.includes(ambiguityMessage)) {
        combinedIssues.push(ambiguityMessage);
      }
    }
    const feedback = validationResult.feedback || 'Fråga validerad med AI';
    const feedbackWithRules = ruleCheck.isValid
      ? feedback
      : `${feedback}${feedback ? ' ' : ''}Regelkontroll: ${ruleCheck.issues.join(' ')}`;
    const finalValid = ruleCheck.isValid && !hasMultipleCorrectOptions ? normalizedValid : false;
    const resolveProposedEdits = (value) => (
      value && typeof value === 'object' && Object.keys(value).length > 0 ? value : null
    );
    let proposedEdits = resolveProposedEdits(validationResult.proposedEdits);
    let proposedEditsReason = '';
    let proposalSuggestions = [];
    if (!finalValid && !proposedEdits && typeof selectedProvider?.proposeQuestionEdits === 'function') {
      try {
        const proposal = await selectedProvider.proposeQuestionEdits(questionForValidation, validationCriteria, {
          issues: combinedIssues,
          suggestions: baseSuggestions,
          blockingRules
        });
        proposedEdits = resolveProposedEdits(proposal?.proposedEdits);
        proposedEditsReason = String(proposal?.reason || '').trim();
        proposalSuggestions = Array.isArray(proposal?.suggestions)
          ? proposal.suggestions.filter(Boolean)
          : proposal?.suggestions
            ? [proposal.suggestions]
            : [];
      } catch (error) {
        console.warn('[validateQuestionWithAI] Proposed edits failed:', error.message);
      }
    }
    const mergedSuggestions = Array.from(new Set([
      ...baseSuggestions,
      ...proposalSuggestions
    ]));
    const validationFeedbackText = `${validationResult?.feedback || ''} ${(validationResult?.issues || []).join(' ')}`;
    const skipAutoFeedback = /rate limit|timeout|time out/i.test(validationFeedbackText);
    const generationRating = skipAutoFeedback ? null : (finalValid ? 5 : 1);

    const fullResult = {
      ...validationResult,
      provider: selectedProviderName,
      valid: finalValid,
      isValid: finalValid,
      proposedEdits,
      ...(proposedEditsReason ? { proposedEditsReason } : {}),
      multipleCorrectOptions: hasMultipleCorrectOptions,
      alternativeCorrectOptions: mergedAlternativeCorrectOptions,
      ambiguityCheck,
      validationType: validationResult.validationType || 'ai',
      ...(combinedIssues.length > 0 ? { issues: combinedIssues } : {}),
      ...(mergedSuggestions.length > 0 ? { suggestions: mergedSuggestions } : {}),
      feedback: feedbackWithRules,
      ...(skipAutoFeedback ? {} : { generationRating, generationRatingSource: 'validation' }),
      timeSensitive: freshness.timeSensitive,
      bestBeforeDate: freshness.bestBeforeDate,
      bestBeforeAt: freshness.bestBeforeAt,
      ...(ruleCheck.isValid ? {} : { ruleValidation: ruleCheck, blockingRules }),
      validationContext: buildValidationContext({
        questionData: questionForValidation,
        criteria: validationCriteria,
        generatorProvider: generationProvider,
        validationProvider: selectedProviderName
      }),
      validatedAt: new Date().toISOString()
    };
    
    console.log(`[validateQuestionWithAI] Question ${questionId} validated as: ${finalValid ? 'VALID' : 'INVALID'}`);
    console.log(`[validateQuestionWithAI] AI Feedback: ${feedbackWithRules}`);

    // Uppdatera frågan i databasen
    await env.DB.prepare(`
      UPDATE questions 
      SET ai_validation_result = ?, 
          ai_validated = ?,
          ai_validated_at = ?,
          time_sensitive = ?,
          best_before_at = ?,
          quarantined = ?,
          quarantined_at = ?,
          quarantine_reason = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      JSON.stringify(fullResult),
      finalValid ? 1 : 0,
      now,
      freshness.timeSensitive ? 1 : 0,
      freshness.bestBeforeAt || null,
      expired ? 1 : 0,
      expired ? now : null,
      expired ? 'expired' : null,
      questionId
    ).run();

    console.log(`[validateQuestionWithAI] Successfully validated question ${questionId}`);

    if (generationProvider && !skipAutoFeedback) {
      try {
        await recordQuestionFeedback(env, {
          questionId,
          feedbackType: 'question',
          rating: generationRating,
          verdict: finalValid ? 'approve' : 'reject',
          issues: Array.isArray(fullResult.issues) ? fullResult.issues : [],
          userRole: 'system',
          category: validationCriteria.category,
          ageGroup: validationCriteria.ageGroup,
          difficulty: validationCriteria.difficulty,
          targetAudience: questionForValidation.targetAudience || null,
          generationProvider,
          generationModel: question.ai_generation_model || null,
          validationProvider: selectedProviderName || null
        });
      } catch (feedbackError) {
        console.warn('[validateQuestionWithAI] Kunde inte logga valideringsbetyg:', feedbackError.message);
      }
    } else if (skipAutoFeedback) {
      console.warn('[validateQuestionWithAI] Skippade valideringsbetyg pga rate limit/timeout.');
    }

    return new Response(JSON.stringify({
      success: true,
      result: {
        isValid: finalValid,
        feedback: feedbackWithRules,
        provider: selectedProviderName,
        details: fullResult
      },
      questionId: questionId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[validateQuestionWithAI] Error:', error);
    
    return new Response(JSON.stringify({
      error: 'Failed to validate question',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
