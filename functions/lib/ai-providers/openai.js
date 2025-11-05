/**
 * OpenAI Provider for Question Generation
 * Model: gpt-4o-mini
 */

export class OpenAIProvider {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.apiKey = apiKey;
    this.model = 'gpt-4o-mini';
    this.name = 'openai';
  }

  /**
   * Generate questions using OpenAI
   */
  async generateQuestions(params) {
    const { amount, category, ageGroup, difficulty, targetAudience, language = 'sv' } = params;
    
    const prompt = this.buildPrompt(category, ageGroup, difficulty, targetAudience, amount, language);
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { 
              role: 'system', 
              content: 'Du är en expert på att skapa pedagogiska quizfrågor. Du skapar frågor på både svenska och engelska med hög kvalitet och pedagogiskt värde.' 
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' }
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${error}`);
      }
      
      const data = await response.json();
      const content = JSON.parse(data.choices[0].message.content);
      
      console.log('[OpenAI] Raw response:', JSON.stringify(content, null, 2));
      console.log('[OpenAI] Questions received:', content.questions?.length || 0);
      
      // DEBUG: If no questions, return raw content
      if (!content.questions || content.questions.length === 0) {
        console.warn('[OpenAI] No questions in response! Returning raw content for debugging');
        return [{
          __DEBUG_RAW_RESPONSE__: content,
          __DEBUG_KEYS__: Object.keys(content),
          provider: this.name,
          model: this.model
        }];
      }
      
      const validated = this.validateAndFormatQuestions(content.questions || []);
      
      // If validation filtered everything, return unvalidated for debugging
      if (validated.length === 0 && content.questions && content.questions.length > 0) {
        console.warn('[OpenAI] WARNING: All questions filtered! Returning unvalidated for inspection');
        return content.questions.map(q => ({
          ...q,
          provider: this.name,
          model: this.model,
          __DEBUG__: 'UNVALIDATED - Returned for inspection',
          __ORIGINAL_KEYS__: Object.keys(q)
        }));
      }
      
      return validated;
      
    } catch (error) {
      console.error('[OpenAI] Generation error:', error);
      throw new Error(`OpenAI generation failed: ${error.message}`);
    }
  }

  /**
   * Validate a question using OpenAI
   */
  async validateQuestion(question, validationCriteria) {
    const prompt = this.buildValidationPrompt(question, validationCriteria);
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { 
              role: 'system', 
              content: 'Du är en expert på att validera quizfrågor för kvalitet, korrekthet och pedagogiskt värde.' 
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' }
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI validation error (${response.status}): ${error}`);
      }
      
      const data = await response.json();
      const validation = JSON.parse(data.choices[0].message.content);
      
      return {
        provider: this.name,
        model: this.model,
        isValid: validation.isValid || false,
        confidence: validation.confidence || 0,
        issues: validation.issues || [],
        suggestions: validation.suggestions || []
      };
      
    } catch (error) {
      console.error('[OpenAI] Validation error:', error);
      throw new Error(`OpenAI validation failed: ${error.message}`);
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
    console.log('[OpenAI] Validating', questions.length, 'questions');
    console.log('[OpenAI] First question keys:', questions[0] ? Object.keys(questions[0]) : 'no questions');
    
    const validated = questions.filter(q => {
      // Log full question structure
      console.log('[OpenAI] Checking question:', JSON.stringify(q, null, 2));
      
      // Basic validation - check both new format (question_sv/en) and potential old format
      const hasQuestion = (q.question_sv && q.question_en) || q.question;
      if (!hasQuestion) {
        console.warn('[OpenAI] Skipping question without question field');
        return false;
      }
      
      const hasOptions = (Array.isArray(q.options_sv) && q.options_sv.length === 4 && 
                         Array.isArray(q.options_en) && q.options_en.length === 4) ||
                        (Array.isArray(q.options) && q.options.length === 4);
      if (!hasOptions) {
        console.warn('[OpenAI] Skipping question with invalid options');
        return false;
      }
      
      if (typeof q.correctOption !== 'number' || q.correctOption < 0 || q.correctOption > 3) {
        console.warn('[OpenAI] Skipping question with invalid correctOption');
        return false;
      }
      return true;
    }).map(q => ({
      ...q,
      provider: this.name,
      model: this.model
    }));
    
    console.log('[OpenAI] Validated', validated.length, 'of', questions.length, 'questions');
    return validated;
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
