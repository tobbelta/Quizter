/**
 * REGENERATE QUESTION EMOJI API
 * 
 * Regenererar emoji för en enskild fråga med AI.
 */

import { corsHeaders, handleCORS } from '../lib/cors.js';
import { ensureDatabase } from '../lib/ensureDatabase.js';
import { geminiEmojiGenerator } from '../services/geminiEmojiGenerator.js';
import { openaiEmojiGenerator } from '../services/openaiEmojiGenerator.js';

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

      // Välj emoji-generator baserat på provider
      let emojiGenerator;
      switch (provider) {
        case 'gemini':
          emojiGenerator = geminiEmojiGenerator;
          break;
        case 'openai':
        default:
          emojiGenerator = openaiEmojiGenerator;
          break;
      }

      // Generera ny emoji
      const questionText = question.text_sv || question.text;
      const categories = question.categories ? JSON.parse(question.categories) : [];
      
      console.log(`[regenerateQuestionEmoji] Generating emoji for question ${questionId} with ${provider}`);
      
      const emoji = await emojiGenerator.generateEmoji(env, {
        text: questionText,
        categories: categories,
        difficulty: question.difficulty,
        ageGroup: question.ageGroups ? JSON.parse(question.ageGroups) : []
      });

      // Uppdatera frågan i databasen
      await env.DB.prepare(`
        UPDATE questions 
        SET illustration_emoji = ?, 
            emojiGeneratedAt = datetime('now'),
            emojiProvider = ?
        WHERE id = ?
      `).bind(emoji, provider, questionId).run();

      console.log(`[regenerateQuestionEmoji] Successfully regenerated emoji for question ${questionId}`);

      return new Response(JSON.stringify({
        success: true,
        emoji: emoji,
        provider: provider,
        questionId: questionId
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[regenerateQuestionEmoji] Error:', error);
      
      return new Response(JSON.stringify({
        error: 'Failed to regenerate emoji',
        details: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

export default handler;
