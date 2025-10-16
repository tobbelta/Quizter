/**
 * AI-baserad kategorisering av frågor för att identifiera ageGroups och categories
 */

const Anthropic = require('@anthropic-ai/sdk');

const AGE_GROUPS = ['children', 'youth', 'adults'];
const CATEGORIES = [
  'Geografi', 'Historia', 'Naturvetenskap', 'Kultur', 'Sport', 'Natur',
  'Teknik', 'Djur', 'Gåtor', 'YouTube', 'TikTok', 'Instagram', 'Snapchat',
  'Threads', 'Bluesky', 'Facebook', 'Idrott'
];

/**
 * Använder AI för att kategorisera en fråga
 * @param {object} questionData - Frågan att kategorisera
 * @param {string} apiKey - Anthropic API-nyckel
 * @returns {Promise<{ageGroups: string[], categories: string[]}>}
 */
async function categorizeQuestion(questionData, apiKey) {
  const { question, options, explanation } = questionData;

  const systemPrompt = `Du är en expert på att analysera quizfrågor och bestämma vilka åldersgrupper och kategorier de passar för.

**Åldersgrupper:**
- children (barn 6-12 år): Enkla frågor om vardagliga saker, grundläggande fakta, kända figurer från barnprogram
- youth (ungdomar 13-25 år): Frågor om sociala medier, moderna trender, populärkultur, teknik, musik, sport
- adults (vuxna 25+ år): Mer komplexa frågor om historia, samhälle, vetenskap, politik, kultur, ekonomi

En fråga kan passa FLERA åldersgrupper! Till exempel kan en fråga om Harry Potter passa både children och youth.

**Kategorier:**
${CATEGORIES.map(cat => `- ${cat}`).join('\n')}

En fråga kan tillhöra FLERA kategorier! Till exempel kan en fråga om "Vilken svensk fotbollsspelare är mest följd på Instagram?" tillhöra både Sport, Instagram och Idrott.

**Viktigt:**
- Kategorier som YouTube, TikTok, Instagram etc används när frågan handlar OM dessa plattformar (t.ex. "Vad heter YouTubers kanal?")
- Idrott används för sportfrågor generellt
- Sport används också för sportfrågor
- Om en fråga handlar om något svenskt (svensk historia, svensk geografi, svenska kändisar), passa gärna för children eller adults
- Youth-frågor handlar ofta om globala fenomen, sociala medier, modern teknik och populärkultur`;

  const userPrompt = `Analysera följande quizfråga och bestäm:
1. Vilka åldersgrupper passar frågan för? (children, youth, adults - kan vara flera!)
2. Vilka kategorier passar frågan in i? (kan vara flera!)

**Fråga:** ${question}

**Svarsalternativ:**
${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

${explanation ? `**Förklaring:** ${explanation}` : ''}

Svara ENDAST med valid JSON i detta exakta format:
{
  "ageGroups": ["array", "of", "ageGroups"],
  "categories": ["array", "of", "categories"],
  "reasoning": "Kort förklaring av ditt val"
}

Exempel:
{
  "ageGroups": ["children", "youth"],
  "categories": ["Djur", "Natur"],
  "reasoning": "Frågan om husdjur är enkel nog för barn men intressant även för ungdomar"
}`;

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 500,
    temperature: 0.3,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt
      }
    ]
  });

  const textContent = response.content.find(block => block.type === 'text');
  if (!textContent || !textContent.text) {
    throw new Error('No text response from AI categorization');
  }

  // Parse JSON response - hantera både ren JSON och JSON inbäddad i markdown
  let jsonText = textContent.text.trim();

  // Ta bort markdown code blocks om de finns
  jsonText = jsonText.replace(/```json\n?/g, '');
  jsonText = jsonText.replace(/```\n?/g, '');
  jsonText = jsonText.trim();

  // Försök matcha JSON-objekt
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('Could not find JSON in response:', textContent.text);
    throw new Error('Could not parse JSON from AI response');
  }

  const result = JSON.parse(jsonMatch[0]);

  // Validera och filtrera resultatet
  const validAgeGroups = (result.ageGroups || []).filter(ag => AGE_GROUPS.includes(ag));
  const validCategories = (result.categories || []).filter(cat => CATEGORIES.includes(cat));

  // Om inga giltiga ålders grupper, använd adults som fallback
  if (validAgeGroups.length === 0) {
    validAgeGroups.push('adults');
  }

  // Om inga giltiga kategorier, använd Gåtor som fallback
  if (validCategories.length === 0) {
    validCategories.push('Gåtor');
  }

  return {
    ageGroups: validAgeGroups,
    categories: validCategories,
    reasoning: result.reasoning || ''
  };
}

module.exports = {
  categorizeQuestion
};
