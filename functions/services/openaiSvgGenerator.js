const OpenAI = require('openai');

const STOP_WORDS = new Set([
  'och', 'eller', 'men', 'det', 'den', 'detta', 'denna', 'dessa', 'vara', 'var', 'har', 'hade', 'som', 'att',
  'för', 'med', 'utan', 'inom', 'över', 'under', 'efter', 'före', 'upp', 'ned', 'ut', 'in', 'om', 'på', 'av',
  'till', 'från', 'vilken', 'vilket', 'vilka', 'blir', 'blev', 'kunde', 'kan', 'ska', 'skulle',
  'också', 'bara', 'alla', 'någon', 'något', 'några',
  'the', 'and', 'but', 'for', 'with', 'without', 'into', 'onto', 'from', 'that', 'this', 'these', 'those',
  'have', 'had', 'been', 'were', 'was', 'are', 'will', 'would', 'could', 'should', 'about', 'around', 'over',
  'under', 'after', 'before', 'out', 'each', 'every', 'some', 'none', 'very',
  'just', 'also', 'more', 'most', 'many', 'much', 'than', 'then', 'when', 'where', 'what', 'which', 'who'
]);

const extractTokens = (text) => {
  if (!text || typeof text !== 'string') {
    return [];
  }
  return (text.toLowerCase().match(/[a-zåäö0-9]{3,}/g) || [])
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
};

const containsSensitiveText = (svgMarkup, questionText, options, explanation) => {
  const svgLower = svgMarkup.toLowerCase();
  const tokens = new Set();

  extractTokens(questionText).forEach((token) => tokens.add(token));
  options.forEach((option) => extractTokens(option).forEach((token) => tokens.add(token)));
  extractTokens(explanation).forEach((token) => tokens.add(token));

  for (const token of tokens) {
    if (!token) continue;
    if (svgLower.includes(token)) {
      return true;
    }
  }

  return false;
};

async function generateSvgIllustration(questionData, apiKey) {
  if (!apiKey) {
    throw new Error('OpenAI API key is required for SVG generation');
  }

  const { question, options = [], explanation } = questionData;
  const openai = new OpenAI({ apiKey });

  const systemPrompt = `Du är en expert på att skapa tydliga, detaljerade SVG-illustrationer för quizfrågor.

**Viktiga regler:**
- SVG måste vara 400x300 pixlar (viewBox="0 0 400 300")
- Bygg scenen med flera enkla former (bakgrund, marklinje, huvudmotiv, detaljer); använd 3–5 harmoniska färger
- Illustrera FRÅGAN (temat eller scenariot), aldrig svaret – välj objekt/symboler som väcker igenkänning utan att avslöja svaret
- Inga <text>-element, inga bokstäver eller siffror, inga frågetecken eller symboler som visar rätt svar
- All text ska uttryckas som grafiska element, inte bokstäver
- SVG ska vara balanserad med tydlig visuell hierarki och gärna diskreta miljödetaljer (horisont, stödjande objekt)
- Ingen gradient – använd platta färger och eventuellt enkla skuggor/markeringar med extra former`;

  const userPrompt = `Skapa en SVG-illustration för följande quizfråga:

**Fråga:** ${question}

**Svarsalternativ:**
${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

${explanation ? `**Förklaring:** ${explanation}` : ''}

Krav:
- Endast grafiska SVG-element (paths, rects, circles, polygons, etc.)
- Ingen text, inga siffror, inga frågetecken, inga bokstäver
- Använd flera former för att skapa ett tydligt huvudmotiv och minst två stödjande detaljer
- SVG ska vara komplett, syntaktiskt korrekt och utan externa referenser

Svara ENDAST med den färdiga SVG-koden, inget annat. Inga \`\`\`-block eller kommentarer.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.6,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No text response from OpenAI SVG generation');
  }

  let svgCode = content.trim();
  svgCode = svgCode.replace(/```xml\s*/gi, '');
  svgCode = svgCode.replace(/```svg\s*/gi, '');
  svgCode = svgCode.replace(/```\s*/g, '');

  if (!svgCode.includes('<svg') || !svgCode.includes('</svg>')) {
    throw new Error('Generated content is not valid SVG');
  }

  if (svgCode.match(/<\s*text/i) || svgCode.includes('?')) {
    throw new Error('Generated SVG contains disallowed text elements or characters');
  }

  if (!svgCode.includes('viewBox')) {
    svgCode = svgCode.replace('<svg', '<svg viewBox="0 0 400 300"');
  }

  if (containsSensitiveText(svgCode, question, options, explanation)) {
    throw new Error('Generated SVG contains question text or answer options');
  }

  return svgCode;
}

module.exports = {
  generateSvgIllustration
};
