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

**Åldersgrupper (VAR MYCKET STRIKT):**
- children (barn 6-12 år): ENDAST mycket enkla frågor med konkreta, vardagliga ämnen som barn känner till. Enkla ord, tydliga svar. Svensk kontext. Exempel: "Vilken färg har himlen?" eller "Hur många ben har en hund?". ABSOLUT INTE: abstrakta koncept, komplexa fakta, kulturella referenser som barn inte känner till.
- youth (ungdomar 13-25 år): MÅSTE ha INTERNATIONELL inriktning. Moderna frågor om sociala medier, global populärkultur, internationell idrott och globala trender. ABSOLUT INTE svensk kontext eller svenska förhållanden. KRÄVER: kunskap om globala fenomen, internationell teknologi, eller världsomspännande popkultur. Exempel: "Vilket år lanserades TikTok?" eller "Vem vann fotbolls-VM 2022?"
- adults (vuxna 25+ år): Utmanande frågor som kräver allmänbildning, historisk kunskap, eller samhällskunskap. Svensk kontext med svenska förhållanden. KRÄVER: vuxen kunskapsnivå, abstrakt tänkande. Exempel: "När infördes allmän rösträtt i Sverige?" eller "Vad är BNP?"

**VIKTIGT:** Välj ENDAST EN åldersgrupp per fråga baserat på den svårighetsgrad och kunskap som krävs. Multi-age tagging ska vara EXTREMT SÄLLSYNT (< 5% av frågor) - använd endast om frågan genuint passar exakt samma kunskapsnivå för båda grupperna.

**Kategorier:**
${CATEGORIES.map(cat => `- ${cat}`).join('\n')}

En fråga kan tillhöra FLERA kategorier! Till exempel kan en fråga om "Vilken svensk fotbollsspelare är mest följd på Instagram?" tillhöra både Sport, Instagram och Idrott.

**Viktigt:**
- Kategorier som YouTube, TikTok, Instagram etc används när frågan handlar OM dessa plattformar (t.ex. "Vad heter YouTubers kanal?")
- Idrott används för sportfrågor generellt
- Sport används också för sportfrågor
- Om en fråga handlar om något svenskt (svensk historia, svensk geografi, svenska kändisar), passa för children eller adults - ALDRIG youth
- Youth-frågor MÅSTE ha internationell inriktning: globala fenomen, sociala medier, modern teknik, internationell populärkultur, internationell sport. ALDRIG svensk kontext för youth.`;

  const userPrompt = `Analysera följande quizfråga och bestäm:
1. Vilken åldersgrupp passar frågan för? (children, youth, ELLER adults - välj EN!)
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

**VIKTIGA REGLER FÖR ÅLDERSINDELNING:**
- Välj NÄSTAN ALLTID endast EN åldersgrupp
- Barnfrågor (children): Endast mycket enkla frågor som 6-åringar kan svara på. Svensk kontext.
- Ungdomsfrågor (youth): Kräver kunskap om modern kultur, sociala medier, internationell sport. MÅSTE ha internationell inriktning. ALDRIG svensk kontext.
- Vuxenfrågor (adults): Kräver allmänbildning, historisk kunskap, eller vuxen erfarenhet. Svensk kontext.
- Multi-age ska vara extremt sällsynt (< 5%)

Exempel (rätt):
{
  "ageGroups": ["children"],
  "categories": ["Djur", "Natur"],
  "reasoning": "Enkel fråga om husdjur som 6-åringar känner till"
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
