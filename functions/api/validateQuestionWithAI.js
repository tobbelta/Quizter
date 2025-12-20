/**
 * VALIDATE QUESTION WITH AI API
 * 
 * Validerar en enskild fråga med AI.
 */

import { ensureDatabase } from '../lib/ensureDatabase.js';
import { AIProviderFactory } from '../lib/ai-providers/index.js';
import { getProviderSettingsSnapshot } from '../lib/providerSettings.js';

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
    let lastError = null;

    for (const providerName of validationProviders) {
      try {
        selectedProviderName = providerName;
        const selectedProvider = aiFactory.getProvider(providerName);
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
    const feedback = validationResult.feedback || 'Fråga validerad med AI';
    const fullResult = {
      ...validationResult,
      provider: selectedProviderName,
      valid: normalizedValid,
      isValid: normalizedValid,
      validationType: validationResult.validationType || 'ai',
      validationContext: buildValidationContext({
        questionData: questionForValidation,
        criteria: validationCriteria,
        generatorProvider: generationProvider,
        validationProvider: selectedProviderName
      }),
      validatedAt: new Date().toISOString()
    };
    
    console.log(`[validateQuestionWithAI] Question ${questionId} validated as: ${normalizedValid ? 'VALID' : 'INVALID'}`);
    console.log(`[validateQuestionWithAI] AI Feedback: ${feedback}`);

    // Uppdatera frågan i databasen
    await env.DB.prepare(`
      UPDATE questions 
      SET ai_validation_result = ?, 
          ai_validated = ?,
          ai_validated_at = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(JSON.stringify(fullResult), normalizedValid ? 1 : 0, Date.now(), questionId).run();

    console.log(`[validateQuestionWithAI] Successfully validated question ${questionId}`);

    return new Response(JSON.stringify({
      success: true,
      result: {
        isValid: normalizedValid,
        feedback,
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
