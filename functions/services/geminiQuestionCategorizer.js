const { GoogleGenerativeAI } = require('@google/generative-ai');

const AGE_GROUPS = ['children', 'youth', 'adults'];
const CATEGORIES = [
  'Geografi', 'Historia', 'Naturvetenskap', 'Kultur', 'Sport', 'Natur',
  'Teknik', 'Djur', 'Gåtor', 'YouTube', 'TikTok', 'Instagram', 'Snapchat',
  'Threads', 'Bluesky', 'Facebook', 'Idrott'
];

const MODEL_NAME = 'gemini-1.5-flash-002';

async function categorizeQuestion(questionData, apiKey) {
  if (!apiKey) {
    throw new Error('Gemini API key is required for categorization');
  }

  const { question, options = [], explanation } = questionData;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `Du är en expert på att analysera quizfrågor och bestämma vilka åldersgrupper och kategorier de passar för.

**Åldersgrupper (VAR MYCKET STRIKT):**
- children (barn 6-12 år): ENDAST mycket enkla frågor med konkreta, vardagliga ämnen som barn känner till. Enkla ord, tydliga svar. Svensk kontext. Exempel: "Vilken färg har himlen?" eller "Hur många ben har en hund?". ABSOLUT INTE: abstrakta koncept, komplexa fakta, kulturella referenser som barn inte känner till.
- youth (ungdomar 13-25 år): MÅSTE ha INTERNATIONELL inriktning. Moderna frågor om sociala medier, global populärkultur, internationell idrott och globala trender. ABSOLUT INTE svensk kontext eller svenska förhållanden. KRÄVER: kunskap om globala fenomen, internationell teknologi, eller världsomspännande popkultur. Exempel: "Vilket år lanserades TikTok?" eller "Vem vann fotbolls-VM 2022?"
- adults (vuxna 25+ år): Utmanande frågor som kräver allmänbildning, historisk kunskap, eller samhällskunskap. Svensk kontext med svenska förhållanden. KRÄVER: vuxen kunskapsnivå, abstrakt tänkande. Exempel: "När infördes allmän rösträtt i Sverige?" eller "Vad är BNP?"

**VIKTIGT:** Välj ENDAST EN åldersgrupp per fråga baserat på den svårighetsgrad och kunskap som krävs. Multi-age tagging ska vara EXTREMT SÄLLSYNT (< 5% av frågor) - använd endast om frågan genuint passar exakt samma kunskapsnivå för båda grupperna.

**Kategorier:**
${CATEGORIES.map((cat) => `- ${cat}`).join('\n')}

En fråga kan tillhöra FLERA kategorier! Till exempel kan en fråga om "Vilken svensk fotbollsspelare är mest följd på Instagram?" tillhöra både Sport, Instagram och Idrott.

**Viktigt:**
- Kategorier som YouTube, TikTok, Instagram etc används när frågan handlar OM dessa plattformar (t.ex. "Vad heter YouTubers kanal?")
- Idrott används för sportfrågor generellt
- Sport används också för sportfrågor
- Om en fråga handlar om något svenskt (svensk historia, svensk geografi, svenska kändisar), passa för children eller adults - ALDRIG youth
- Youth-frågor MÅSTE ha internationell inriktning: globala fenomen, sociala medier, modern teknik, internationell populärkultur, internationell sport. ALDRIG svensk kontext för youth.

Analysera följande quizfråga och bestäm:
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

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response && typeof response.text === 'function' ? response.text() : null;

  if (!text) {
    throw new Error('No text response from Gemini categorization');
  }

  let jsonText = text.trim();
  jsonText = jsonText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const match = jsonText.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('Could not parse JSON from Gemini response');
  }

  let resultData;
  try {
    resultData = JSON.parse(match[0]);
  } catch (error) {
    throw new Error('Gemini returned invalid JSON');
  }

  const ageGroups = Array.isArray(resultData.ageGroups) ? resultData.ageGroups : [];
  const categories = Array.isArray(resultData.categories) ? resultData.categories : [];

  const validAgeGroups = ageGroups.filter((ag) => AGE_GROUPS.includes(ag));
  const validCategories = categories.filter((cat) => CATEGORIES.includes(cat));

  if (validAgeGroups.length === 0) {
    validAgeGroups.push('adults');
  }

  if (validCategories.length === 0) {
    validCategories.push('Gåtor');
  }

  return {
    ageGroups: Array.from(new Set(validAgeGroups)),
    categories: Array.from(new Set(validCategories)),
    reasoning: resultData.reasoning || ''
  };
}

module.exports = {
  categorizeQuestion
};
