/**
 * Mistral Provider for Question Generation
 * Model: mistral-small-latest
 */

export class MistralProvider {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Mistral API key is required');
    }
    this.apiKey = apiKey;
    this.model = 'mistral-small-latest';
    this.name = 'mistral';
  }

  /**
   * Generate questions using Mistral
   */
  async generateQuestions(params) {
    const { amount, category, ageGroup, difficulty, targetAudience, language = 'sv' } = params;
    
    const prompt = this.buildPrompt(category, ageGroup, difficulty, targetAudience, amount, language);
    
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
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
        throw new Error(`Mistral API error (${response.status}): ${error}`);
      }
      
      const data = await response.json();
      const content = JSON.parse(data.choices[0].message.content);
      
      return this.validateAndFormatQuestions(content.questions || []);
      
    } catch (error) {
      console.error('[Mistral] Generation error:', error);
      throw new Error(`Mistral generation failed: ${error.message}`);
    }
  }

  /**
   * Validate a question using Mistral
   */
  async validateQuestion(question, validationCriteria) {
    const prompt = this.buildValidationPrompt(question, validationCriteria);
    
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
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
        throw new Error(`Mistral validation error (${response.status}): ${error}`);
      }
      
      const data = await response.json();
      const validation = JSON.parse(data.choices[0].message.content);
      
      return {
        provider: this.name,
        model: this.model,
        isValid: validation.isValid || false,
        confidence: validation.confidence || 0,
        issues: validation.issues || [],
        suggestions: validation.suggestions || [],
        feedback: validation.feedback || 'No feedback provided'
      };
      
    } catch (error) {
      console.error('[Mistral] Validation error:', error);
      throw new Error(`Mistral validation failed: ${error.message}`);
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

    // Default values for optional parameters
    const effectiveCategory = category || 'Allmän kunskap';
    const effectiveAgeGroup = ageGroup || 'adults';
    const effectiveDifficulty = difficulty || 'medium';
    const effectiveTargetAudience = targetAudience || 'swedish';

    const audienceContext = effectiveTargetAudience === 'swedish' 
      ? 'Fokusera på svensk kultur, historia och geografi där det är relevant.'
      : 'Fokusera på global kunskap och internationella perspektiv.';

    return `Skapa ${amount} quizfrågor om ${effectiveCategory} för åldersgrupp ${ageGroupInfo[effectiveAgeGroup] || effectiveAgeGroup} med svårighetsgrad ${difficultyMap[effectiveDifficulty] || effectiveDifficulty}.

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
- Target audience: "${effectiveTargetAudience}"

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
      "targetAudience": "${effectiveTargetAudience}"
    }
  ]
}`;
  }

  /**
   * Build validation prompt
   */
  buildValidationPrompt(question, criteria) {
    const { category, ageGroup, difficulty } = criteria;
    
    // Default values for optional parameters
    const effectiveCategory = category || 'Allmän kunskap';
    const effectiveAgeGroup = ageGroup || 'adults';
    const effectiveDifficulty = difficulty || 'medium';
    
    return `Validera följande quizfråga enligt dessa kriterier:

FRÅGA:
${JSON.stringify(question, null, 2)}

KONTEXT:
- Kategori: ${effectiveCategory}
- Åldersgrupp: ${effectiveAgeGroup}
- Svårighetsgrad: ${effectiveDifficulty}

Kontrollera:
1. Är frågan faktiskt korrekt?
2. Är svarsalternativen rimliga och inte vilseledande?
3. Är det markerade svaret verkligen korrekt?
4. Är förklaringen pedagogisk och korrekt?
5. Finns både svenska och engelska versioner?
6. Är översättningarna korrekta?
7. Är svårighetsgraden lämplig för målgruppen (${ageGroup})?
8. Passar frågan kategorin ${category}?

Returnera JSON med följande format (all text MÅSTE vara på SVENSKA):
{
  "isValid": true/false,
  "confidence": 0-100,
  "issues": ["eventuella problem på svenska"],
  "suggestions": ["eventuella förbättringsförslag på svenska"],
  "feedback": "Kort sammanfattning av valideringen på svenska"
}

VIKTIGT: All feedback, issues och suggestions MÅSTE vara på SVENSKA.`;
  }

  /**
   * Validate and format questions from AI response
   */
  validateAndFormatQuestions(questions) {
    return questions.filter(q => {
      // Basic validation
      if (!q.question_sv || !q.question_en) {
        console.warn('[Mistral] Skipping question without bilingual content:', q);
        return false;
      }
      if (!Array.isArray(q.options_sv) || q.options_sv.length !== 4) {
        console.warn('[Mistral] Skipping question with invalid Swedish options:', q);
        return false;
      }
      if (!Array.isArray(q.options_en) || q.options_en.length !== 4) {
        console.warn('[Mistral] Skipping question with invalid English options:', q);
        return false;
      }
      if (typeof q.correctOption !== 'number' || q.correctOption < 0 || q.correctOption > 3) {
        console.warn('[Mistral] Skipping question with invalid correctOption:', q);
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
   * Check if provider has credits/tokens available
   * Makes a minimal API call to verify access
   */
  async checkCredits() {
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        // Check for quota/rate limit issues
        if (error.includes('quota') || error.includes('insufficient')) {
          return { 
            available: false, 
            error: 'insufficient_credits',
            message: 'Insufficient quota or credits'
          };
        }
        if (error.includes('rate_limit')) {
          return { 
            available: false, 
            error: 'rate_limit',
            message: 'Rate limit exceeded'
          };
        }
        return { 
          available: false, 
          error: 'api_error',
          message: `API error: ${response.status}`
        };
      }
      
      return { available: true };
      
    } catch (error) {
      console.error('[Mistral] Credit check error:', error);
      return { 
        available: false, 
        error: 'connection_error',
        message: error.message 
      };
    }
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
