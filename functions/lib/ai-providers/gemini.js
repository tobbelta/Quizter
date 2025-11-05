/**
 * Google Gemini Provider for Question Generation
 * Model: gemini-1.5-flash-002
 */

export class GeminiProvider {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.apiKey = apiKey;
    this.model = 'gemini-1.5-flash-002';
    this.name = 'gemini';
  }

  /**
   * Generate questions using Gemini
   */
  async generateQuestions(params) {
    const { amount, category, ageGroup, difficulty, targetAudience, language = 'sv' } = params;
    
    const prompt = this.buildPrompt(category, ageGroup, difficulty, targetAudience, amount, language);
    
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Du är en expert på att skapa pedagogiska quizfrågor. Du skapar frågor på både svenska och engelska med hög kvalitet och pedagogiskt värde.\n\n${prompt}\n\nSvara med JSON-format.`
              }]
            }],
            generationConfig: {
              temperature: 0.7,
              responseMimeType: 'application/json'
            }
          })
        }
      );
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${error}`);
      }
      
      const data = await response.json();
      
      if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid response structure from Gemini');
      }
      
      const content = JSON.parse(data.candidates[0].content.parts[0].text);
      
      return this.validateAndFormatQuestions(content.questions || []);
      
    } catch (error) {
      console.error('[Gemini] Generation error:', error);
      throw new Error(`Gemini generation failed: ${error.message}`);
    }
  }

  /**
   * Validate a question using Gemini
   */
  async validateQuestion(question, validationCriteria) {
    const prompt = this.buildValidationPrompt(question, validationCriteria);
    
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Du är en expert på att validera quizfrågor för kvalitet, korrekthet och pedagogiskt värde.\n\n${prompt}\n\nSvara med JSON-format.`
              }]
            }],
            generationConfig: {
              temperature: 0.3,
              responseMimeType: 'application/json'
            }
          })
        }
      );
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini validation error (${response.status}): ${error}`);
      }
      
      const data = await response.json();
      const validation = JSON.parse(data.candidates[0].content.parts[0].text);
      
      return {
        provider: this.name,
        model: this.model,
        isValid: validation.isValid || false,
        confidence: validation.confidence || 0,
        issues: validation.issues || [],
        suggestions: validation.suggestions || []
      };
      
    } catch (error) {
      console.error('[Gemini] Validation error:', error);
      throw new Error(`Gemini validation failed: ${error.message}`);
    }
  }

  /**
   * Build prompt for question generation
   */
  buildPrompt(category, ageGroup, difficulty, targetAudience, amount, language) {
    const difficultyMap = {
      'easy': 'lätt',
      'medium': 'medel',
      'hard': 'svår'
    };

    const ageGroupInfo = {
      'children': '6-12 år (barn)',
      'youth': '13-25 år (ungdomar)',
      'adults': '25+ år (vuxna)'
    };

    const audienceContext = targetAudience === 'swedish' 
      ? 'Fokusera på svensk kultur, historia och geografi där det är relevant.'
      : 'Fokusera på global kunskap och internationella perspektiv.';

    return `Skapa ${amount} quizfrågor om ${category} för åldersgrupp ${ageGroupInfo[ageGroup] || ageGroup} med svårighetsgrad ${difficultyMap[difficulty] || difficulty}.

${audienceContext}

VIKTIGT - Alla frågor MÅSTE ha BÅDE svenska OCH engelska versioner:
- question_sv: Frågan på svenska
- question_en: Frågan på engelska
- options_sv: 4 svarsalternativ på svenska
- options_en: 4 svarsalternativ på engelska
- explanation_sv: Förklaring på svenska
- explanation_en: Förklaring på engelska

Varje fråga ska ha:
- Tydlig frågeställning på både svenska och engelska
- 4 svarsalternativ per språk (varav ETT är korrekt)
- Korrekt svar angivet som index (0-3)
- Pedagogisk förklaring på båda språken
- En passande emoji som visuell illustration
- Target audience: "${targetAudience}"

Returnera JSON i exakt följande format:
{
  "questions": [
    {
      "question_sv": "Frågan på svenska?",
      "question_en": "The question in English?",
      "options_sv": ["Alt 1", "Alt 2", "Alt 3", "Alt 4"],
      "options_en": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correctOption": 0,
      "explanation_sv": "Förklaring på svenska",
      "explanation_en": "Explanation in English",
      "emoji": "🎯",
      "targetAudience": "${targetAudience}"
    }
  ]
}`;
  }

  /**
   * Build validation prompt
   */
  buildValidationPrompt(question, criteria) {
    return `Validera följande quizfråga enligt dessa kriterier:

FRÅGA:
${JSON.stringify(question, null, 2)}

VALIDERINGSKRITERIER:
${criteria.map(c => `- ${c}`).join('\n')}

Kontrollera:
1. Är frågan faktiskt korrekt?
2. Är svarsalternativen rimliga och inte vilseledande?
3. Är det markerade svaret verkligen korrekt?
4. Är förklaringen pedagogisk och korrekt?
5. Finns både svenska och engelska versioner?
6. Är översättningarna korrekta?
7. Är svårighetsgraden lämplig för målgruppen?

Returnera JSON:
{
  "isValid": true/false,
  "confidence": 0-100,
  "issues": ["eventuella problem"],
  "suggestions": ["eventuella förbättringsförslag"]
}`;
  }

  /**
   * Validate and format questions from AI response
   */
  validateAndFormatQuestions(questions) {
    return questions.filter(q => {
      // Basic validation
      if (!q.question_sv || !q.question_en) {
        console.warn('[Gemini] Skipping question without bilingual content:', q);
        return false;
      }
      if (!Array.isArray(q.options_sv) || q.options_sv.length !== 4) {
        console.warn('[Gemini] Skipping question with invalid Swedish options:', q);
        return false;
      }
      if (!Array.isArray(q.options_en) || q.options_en.length !== 4) {
        console.warn('[Gemini] Skipping question with invalid English options:', q);
        return false;
      }
      if (typeof q.correctOption !== 'number' || q.correctOption < 0 || q.correctOption > 3) {
        console.warn('[Gemini] Skipping question with invalid correctOption:', q);
        return false;
      }
      return true;
    }).map(q => ({
      ...q,
      provider: this.name,
      model: this.model
    }));
  }

  /**
   * Get provider info
   */
  getInfo() {
    return {
      name: this.name,
      model: this.model,
      capabilities: ['generation', 'validation'],
      supportsLanguages: ['sv', 'en'],
      maxQuestionsPerRequest: 50
    };
  }
}
