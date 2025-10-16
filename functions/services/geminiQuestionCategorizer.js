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

**Åldersgrupper:**
- children (barn 6-12 år): Enkla frågor om vardagliga saker, grundläggande fakta, kända figurer från barnprogram
- youth (ungdomar 13-25 år): Frågor om sociala medier, moderna trender, populärkultur, teknik, musik, sport
- adults (vuxna 25+ år): Mer komplexa frågor om historia, samhälle, vetenskap, politik, kultur, ekonomi

En fråga kan passa FLERA åldersgrupper! Till exempel kan en fråga om Harry Potter passa både children och youth.

**Kategorier:**
${CATEGORIES.map((cat) => `- ${cat}`).join('\n')}

En fråga kan tillhöra FLERA kategorier! Till exempel kan en fråga om "Vilken svensk fotbollsspelare är mest följd på Instagram?" tillhöra både Sport, Instagram och Idrott.

**Viktigt:**
- Kategorier som YouTube, TikTok, Instagram etc används när frågan handlar OM dessa plattformar (t.ex. "Vad heter YouTubers kanal?")
- Idrott används för sportfrågor generellt
- Sport används också för sportfrågor
- Om en fråga handlar om något svenskt (svensk historia, svensk geografi, svenska kändisar), passa gärna för children eller adults
- Youth-frågor handlar ofta om globala fenomen, sociala medier, modern teknik och populärkultur

Analysera följande quizfråga och bestäm:
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
