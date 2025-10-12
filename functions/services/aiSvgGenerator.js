/**
 * AI-baserad SVG-generering för att illustrera frågor
 */
const Anthropic = require('@anthropic-ai/sdk');

const STOP_WORDS = new Set([
  // Svenska
  'och', 'eller', 'men', 'det', 'den', 'detta', 'denna', 'dessa', 'vara', 'var', 'har', 'hade', 'som', 'att',
  'för', 'med', 'utan', 'inom', 'över', 'under', 'efter', 'före', 'upp', 'ned', 'ut', 'in', 'om', 'på', 'av',
  'till', 'från', 'vilken', 'vilket', 'vilka', 'vilka', 'blir', 'blev', 'kunde', 'kan', 'ska', 'skulle',
  'också', 'bara', 'alla', 'någon', 'något', 'några',
  // Engelska
  'the', 'and', 'but', 'for', 'with', 'without', 'into', 'onto', 'from', 'that', 'this', 'these', 'those',
  'have', 'had', 'been', 'were', 'was', 'are', 'will', 'would', 'could', 'should', 'about', 'around', 'over',
  'under', 'after', 'before', 'into', 'out', 'in', 'on', 'off', 'each', 'every', 'some', 'none', 'very',
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

/**
 * Genererar en SVG-illustration för en fråga
 * @param {object} questionData - Frågan att illustrera
 * @param {string} apiKey - Anthropic API-nyckel
 * @returns {Promise<string>} SVG-kod
 */
async function generateSvgIllustration(questionData, apiKey) {
  if (!apiKey) {
    throw new Error('Anthropic API key is required for SVG generation');
  }

  const { question, options = [], explanation } = questionData;

  const systemPrompt = `Du är en expert på att skapa tydliga, detaljerade SVG-illustrationer för quizfrågor.

**Viktiga regler:**
- SVG måste vara 400x300 pixlar (viewBox="0 0 400 300")
- Bygg scenen med flera enkla former (ex: bakgrund, marklinje, huvudmotiv, detaljer); använd 3–5 harmoniska färger
- Illustrera FRÅGAN (temat eller scenariot), aldrig svaret – välj objekt/symboler som väcker igenkänning utan att avslöja svaret
- Inga <text>-element, inga bokstäver eller siffror, inga frågetecken eller symboler som visar rätt svar
- All text ska uttryckas som grafiska element, inte bokstäver
- SVG ska vara balanserad, med tydlig visuell hierarki och gärna någon miljödiskret detalj (t.ex. horisontlinje, stödjande objekt)
- Ingen gradient – använd platta färger och eventuellt enkla skuggor/markeringar med extra former

**Exempel på bra lösningar:**
- Geografi: enkel karta med utmärkta regioner, kompass och naturliga element
- Historia: tidslinje bestående av symboliska objekt (kolonner, pergament, siluetter)
- Natur: stiliserade djur/växter i miljö som representerar biotopen
- Teknik: ikoniska prylar, kretskort, abstrakta nätverk
- Matematik: geometriska figurer, linjediagram, mätverktyg – inga siffror`;

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

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 2000,
    temperature: 0.6,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt
      }
    ]
  });

  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || !textContent.text) {
    throw new Error('No text response from AI SVG generation');
  }

  let svgCode = textContent.text.trim();

  // Rensa bort eventuella markdown-markeringar
  svgCode = svgCode.replace(/```xml\s*/gi, '');
  svgCode = svgCode.replace(/```svg\s*/gi, '');
  svgCode = svgCode.replace(/```\s*/g, '');

  // Validera att det faktiskt är SVG
  if (!svgCode.includes('<svg') || !svgCode.includes('</svg>')) {
    throw new Error('Generated content is not valid SVG');
  }

  if (svgCode.match(/<\s*text/i) || svgCode.includes('?')) {
    throw new Error('Generated SVG contains disallowed text elements or characters');
  }

  // Säkerställ att viewBox är satt
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

