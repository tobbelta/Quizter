// VIKTIGT: Emojin som genereras får aldrig avslöja svaret på frågan.
// Den ska endast representera frågans övergripande tema eller kategori.

const OpenAI = require('openai');

async function generateEmoji(questionData, apiKey) {
  if (!apiKey) {
    throw new Error('OpenAI API key is required for emoji generation');
  }

  const { question, options = [], explanation } = questionData;
  const openai = new OpenAI({ apiKey });

  const systemPrompt = `Du är en expert på att välja DEN PERFEKTA emojin för att illustrera quizfrågor.

**KRITISKT VIKTIGT - AVSLÖJA ALDRIG SVARET:**
- Emojin får ENDAST representera ÄMNET/KATEGORIN för frågan
- Emojin får ALDRIG ge en ledtråd till vilket svarsalternativ som är rätt
- Om frågan är "Vilket djur kan simma?" - använd INTE 🐋 (avslöjar svaret), använd ❓ eller 🐾
- Om frågan är "I vilket land ligger Paris?" - använd 🗺️ (INTE 🇫🇷 som avslöjar svaret)
- Välj emoji som visar KATEGORIN (geografi, historia, sport, vetenskap etc), inte det specifika svaret

**Rätt vs Fel exempel:**
- Fråga: "Vilket år började första världskriget?"
  ✅ RÄTT: 📜 (historia) eller ⚔️ (krig/strid)
  ❌ FEL: Något som pekar på årtalet 1914

- Fråga: "Vilken färg har bananer när de är mogna?"
  ✅ RÄTT: 🍌 (frukt/mat-kategori är OK)
  ⚠️ KANSKE: 🎨 (färger allmänt)
  ❌ FEL: Någon gul emoji

- Fråga: "Vem målade Mona Lisa?"
  ✅ RÄTT: 🎨 (konst)
  ❌ FEL: Något som pekar på Da Vinci

**Val av emoji:**
- Välj EXAKT 1 emoji som representerar ÄMNET/KATEGORIN
- Emojin ska vara bred och generell, inte specifik mot svaret
- Tänk: "Om jag ser denna emoji, förstår jag vilket ÄMNE frågan handlar om, men inte svaret"

**Regler:**
- Använd ENDAST riktiga Unicode-emojis
- EXAKT 1 emoji, inte mer, inte mindre
- Inga ord, inga förklaringar, bara emojin
- ALDRIG avslöja svaret - endast visa kategori/ämne`;

  const userPrompt = `Välj DEN BÄSTA emojin för följande quizfråga:

**Fråga:** ${question}

**Svarsalternativ:**
${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

${explanation ? `**Förklaring:** ${explanation}` : ''}

Svara med EXAKT 1 emoji, inget annat. Inga ord, inga förklaringar, bara den bästa emojin.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.5,
    max_tokens: 10,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No text response from OpenAI emoji generation');
  }

  let emojis = content.trim();

  // Rensa bort eventuella markdown-markeringar eller extra text
  emojis = emojis.replace(/```/g, '');
  emojis = emojis.replace(/\s+/g, ''); // Ta bort alla mellanslag

  // Validera att vi har minst en emoji (kontrollera Unicode-intervall)
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
  const foundEmojis = emojis.match(emojiRegex);

  if (!foundEmojis || foundEmojis.length === 0) {
    throw new Error('No valid emojis were generated');
  }

  // Ta endast första emojin
  const finalEmoji = foundEmojis[0];

  return finalEmoji;
}

module.exports = {
  generateEmoji
};
