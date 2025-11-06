/**
 * REGENERATE QUESTION EMOJI API
 * 
 * Regenererar emoji för en enskild fråga med AI.
 */

import { ensureDatabase } from '../lib/ensureDatabase.js';
import { AIProviderFactory } from '../lib/ai-providers/index.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await ensureDatabase(env.DB);
    
    const { questionId, provider = 'openai' } = await request.json();
    
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
    const aiFactory = new AIProviderFactory(env);
    const aiProvider = aiFactory.getProvider(provider);

    // Generera ny emoji med AI
    const questionText = question.question_sv || question.question;
    const categories = question.categories ? JSON.parse(question.categories) : [];
    
    console.log(`[regenerateQuestionEmoji] Generating emoji for question ${questionId} with ${provider}`);
    
    // Skapa en prompt för emoji-generering
    const emojiPrompt = `Generera en passande emoji för denna quizfråga:

Fråga: "${questionText}"
Kategori: ${categories.join(', ')}
Svårighetsgrad: ${question.difficulty || 'medium'}

Returnera endast en enda emoji som bäst representerar frågan eller dess kategori.`;

    const response = await aiProvider.generateQuestions(emojiPrompt, {
      amount: 1,
      format: 'emoji_only'
    });

    // Enkla emoji-fallbacks baserat på kategori
    let emoji = '❓';
    if (categories.includes('Geografi')) emoji = '🌍';
    else if (categories.includes('Historia')) emoji = '📚';
    else if (categories.includes('Sport')) emoji = '⚽';
    else if (categories.includes('Mat')) emoji = '🍕';
    else if (categories.includes('Djur')) emoji = '🐾';
    else if (categories.includes('Vetenskap')) emoji = '🔬';
    else if (categories.includes('Musik')) emoji = '🎵';
    else if (categories.includes('Film')) emoji = '🎬';
    
    // Uppdatera frågan i databasen
    await env.DB.prepare(`
      UPDATE questions 
      SET illustration_emoji = ?, 
          updated_at = datetime('now'),
          illustration_generated_at = ?,
          illustration_provider = ?
      WHERE id = ?
    `).bind(emoji, Date.now(), provider, questionId).run();

    console.log(`[regenerateQuestionEmoji] Successfully regenerated emoji for question ${questionId}`);

    return new Response(JSON.stringify({
      success: true,
      emoji: emoji,
      provider: provider,
      questionId: questionId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[regenerateQuestionEmoji] Error:', error);
    
    return new Response(JSON.stringify({
      error: 'Failed to regenerate emoji',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}