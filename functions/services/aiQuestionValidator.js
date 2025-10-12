/**
 * AI-baserad validering av quizfrågor
 * Kontrollerar att rätt svar verkligen är rätt och att inga andra alternativ också kan vara korrekta
 */
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('firebase-functions/logger');

/**
 * Validerar en fråga med AI
 * @param {Object} questionData - Frågedata
 * @param {string} questionData.question - Frågetexten
 * @param {Array} questionData.options - Svarsalternativen
 * @param {number} questionData.correctOption - Index för korrekt svar (0-3)
 * @param {string} questionData.explanation - Förklaring
 * @param {string} apiKey - Anthropic API-nyckel
 * @returns {Promise<Object>} Valideringsresultat
 */
async function validateQuestion(questionData, apiKey) {
  if (!apiKey) {
    throw new Error('Anthropic API key is required');
  }

  const { question, options, correctOption, explanation } = questionData;

  const anthropic = new Anthropic({ apiKey });

  const systemPrompt = `Du är en expert på quizfrågor och faktakontroll. Din uppgift är att validera att en quizfråga har rätt svar markerat och att endast ett alternativ är korrekt.

Analysera frågan och svarsalternativen noggrant och kontrollera:
1. Är det markerade svaret (alternativ ${correctOption + 1}) faktiskt korrekt?
2. Kan något av de andra alternativen också vara rätt?
3. Är något av alternativen tvetydigt eller felaktigt?
4. Stämmer förklaringen med det korrekta svaret?
5. Har frågan, alternativen och förklaringen perfekt stavning och grammatik? (Detta är KRITISKT)

Svara ENDAST med giltig JSON (ingen markdown, inga kommentarer):
{"valid": true/false, "issues": ["lista med problem om några finns"], "suggestedCorrectOption": 0-3 (om rätt svar är fel), "reasoning": "förklaring av bedömningen"}`;

  const userPrompt = `Validera denna quizfråga:

**Fråga:** ${question}

**Alternativ:**
1. ${options[0]}
2. ${options[1]}
3. ${options[2]}
4. ${options[3]}

**Markerat korrekt svar:** Alternativ ${correctOption + 1} (${options[correctOption]})

**Förklaring:** ${explanation}

Är det markerade svaret korrekt? Kan något annat alternativ också vara rätt?`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt
      }]
    });

    const responseText = message.content[0].text;
    logger.info('AI validation response', { responseText });

    // Rensa bort markdown och hitta JSON
    let jsonText = responseText.trim();

    // Ta bort markdown code blocks om de finns
    jsonText = jsonText.replace(/^```json?\s*/i, '').replace(/```\s*$/, '');

    // Hitta JSON-objektet
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from AI response');
    }

    const result = JSON.parse(jsonMatch[0]);
    return result;

  } catch (error) {
    logger.error('Error validating question with AI', { error: error.message });
    throw error;
  }
}

module.exports = {
  validateQuestion
};
