/**
 * VALIDATE QUESTION WITH AI API
 * 
 * Validerar en enskild fråga med AI.
 */

import { corsHeaders, handleCORS } from '../lib/cors.js';
import { ensureDatabase } from '../lib/ensureDatabase.js';
import { geminiQuestionValidator } from '../services/geminiQuestionValidator.js';
import { openaiQuestionValidator } from '../services/openaiQuestionValidator.js';

const handler = {
  async fetch(request, env, ctx) {
    // Handle CORS
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { 
        status: 405, 
        headers: corsHeaders 
      });
    }

    try {
      await ensureDatabase(env);
      
      const { questionId, provider = 'openai' } = await request.json();
      
      if (!questionId) {
        return new Response(JSON.stringify({
          error: 'questionId is required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Välj validator baserat på provider
      let validator;
      switch (provider) {
        case 'gemini':
          validator = geminiQuestionValidator;
          break;
        case 'openai':
        default:
          validator = openaiQuestionValidator;
          break;
      }

      // Förbered frågadata för validering
      const questionText = question.text_sv || question.text;
      const options = question.options ? JSON.parse(question.options) : [];
      const correctAnswer = question.correctAnswer;
      const explanation = question.explanation_sv || question.explanation;

      console.log(`[validateQuestionWithAI] Validating question ${questionId} with ${provider}`);
      
      // Validera frågan
      const validationResult = await validator.validateQuestion(env, {
        text: questionText,
        options: options,
        correctAnswer: correctAnswer,
        explanation: explanation,
        categories: question.categories ? JSON.parse(question.categories) : [],
        difficulty: question.difficulty,
        ageGroup: question.ageGroups ? JSON.parse(question.ageGroups) : []
      });

      // Uppdatera frågan i databasen med valideringsresultat
      const updateQuery = `
        UPDATE questions 
        SET aiValidated = ?,
            aiValidationResult = ?,
            aiValidatedAt = datetime('now'),
            aiValidationProvider = ?
        WHERE id = ?
      `;

      await env.DB.prepare(updateQuery).bind(
        validationResult.valid ? 1 : 0,
        JSON.stringify(validationResult),
        provider,
        questionId
      ).run();

      console.log(`[validateQuestionWithAI] Question ${questionId} validation result: ${validationResult.valid ? 'VALID' : 'INVALID'}`);

      return new Response(JSON.stringify({
        success: true,
        result: validationResult,
        provider: provider,
        questionId: questionId
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[validateQuestionWithAI] Error:', error);
      
      return new Response(JSON.stringify({
        error: 'Failed to validate question',
        details: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

export default handler;