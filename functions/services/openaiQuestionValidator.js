/**
 * AI-baserad validering av quizfrågor med OpenAI
 * Kontrollerar att markerat svar är korrekt och unikt
 */
const OpenAI = require('openai');
const logger = require('firebase-functions/logger');

/**
 * Validerar en fråga med OpenAI
 * @param {Object} questionData
 * @param {string} questionData.question
 * @param {string[]} questionData.options
 * @param {number} questionData.correctOption
 * @param {string} questionData.explanation
 * @param {string} apiKey
 * @returns {Promise<{valid: boolean, issues: string[], suggestedCorrectOption?: number, reasoning: string}>}
 */
async function validateQuestion(questionData, apiKey) {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  const { question, options, correctOption, explanation } = questionData;

  if (!question || !Array.isArray(options) || options.length !== 4) {
    throw new Error('Invalid question payload');
  }

  const openai = new OpenAI({ apiKey });

  const systemPrompt = `Du är en expert på quizfrågor och faktagranskning. Du ska validera att en flervalsfråga har rätt markerat svar och att exakt ett alternativ är korrekt.

Du måste:
1. Bekräfta om det markerade svaret (alternativ ${correctOption + 1}) är korrekt.
2. Identifiera om något annat alternativ också skulle kunna vara korrekt.
3. Kontrollera att förklaringen stödjer det korrekta svaret.
4. Verifiera att frågan, alternativen och förklaringen har perfekt stavning och grammatik (Detta är KRITISKT).

Returnera ENDAST giltig JSON med följande format:
{"valid": true/false, "issues": ["lista med problem"], "suggestedCorrectOption": 0-3 (om rätt svar ska ändras), "reasoning": "kort motivering"}`;

  const userPrompt = `Validera denna quizfråga:

Fråga: ${question}

Alternativ:
1. ${options[0]}
2. ${options[1]}
3. ${options[2]}
4. ${options[3]}

Markerat korrekt svar: Alternativ ${correctOption + 1} (${options[correctOption]})

Förklaring: ${explanation}

Är det markerade svaret korrekt?`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI gav inget svar');
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      logger.error('Failed to parse OpenAI validation response', {
        content,
        error: error.message,
      });
      throw new Error('Kunde inte tolka svaret från OpenAI');
    }

    const validated = {
      valid: Boolean(parsed.valid),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggestedCorrectOption: typeof parsed.suggestedCorrectOption === 'number'
        ? parsed.suggestedCorrectOption
        : undefined,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning.trim() : '',
    };

    return validated;
  } catch (error) {
    logger.error('Error validating question with OpenAI', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

module.exports = {
  validateQuestion,
};
