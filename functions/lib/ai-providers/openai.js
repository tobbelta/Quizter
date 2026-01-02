/**
 * OpenAI-compatible Provider for Question Generation
 * Model: gpt-4o-mini
 */

const PROVIDER_LABELS = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  together: 'Together AI',
  fireworks: 'Fireworks AI',
};

const formatProviderLabel = (name) => (
  PROVIDER_LABELS[name] || `${name.charAt(0).toUpperCase()}${name.slice(1)}`
);

const buildCategoryContext = (categoryDetails) => {
  if (!categoryDetails) return '';
  const lines = [];
  if (categoryDetails.description) {
    lines.push(`- Kort beskrivning: ${categoryDetails.description}`);
  }
  if (categoryDetails.prompt) {
    lines.push(`- Instruktioner: ${categoryDetails.prompt}`);
  }
  if (lines.length === 0) return '';
  return `\nKATEGORIINSTRUKTIONER:\n${lines.join('\n')}\n`;
};

const TARGET_AUDIENCE_HINTS = {
  swedish: 'Fokusera på svensk kultur, historia och geografi där det är relevant.',
  english: 'Håll frågorna neutrala och internationellt begripliga.',
  international: 'Fokusera på global kunskap och internationella perspektiv.',
  global: 'Fokusera på global kunskap och internationella perspektiv.',
  german: 'Anpassa exempel till tyskt sammanhang när relevant.',
  norwegian: 'Anpassa exempel till norsk kontext när relevant.',
  danish: 'Anpassa exempel till dansk kontext när relevant.'
};

const buildAudienceContext = (targetAudiences = [], targetAudienceDetails = []) => {
  const effectiveTargets = Array.isArray(targetAudiences) && targetAudiences.length > 0
    ? targetAudiences
    : ['swedish'];
  const detailMap = new Map(
    (targetAudienceDetails || []).map((detail) => [detail.id, detail])
  );
  const detailPrompts = effectiveTargets
    .map((id) => detailMap.get(id)?.prompt)
    .filter(Boolean);
  const fallbackHints = effectiveTargets
    .map((id) => TARGET_AUDIENCE_HINTS[id])
    .filter(Boolean);
  const hints = Array.from(new Set(detailPrompts.length > 0 ? detailPrompts : fallbackHints));
  const listText = effectiveTargets.join(', ');
  let context = '';

  if (effectiveTargets.length === 1) {
    context = hints[0] || '';
  } else {
    context = `Variera mellan målgrupperna: ${listText}.`;
    if (hints.length > 0) {
      context += ` ${hints.join(' ')}`;
    }
  }

  return {
    effectiveTargets,
    listText,
    context,
    example: effectiveTargets[0]
  };
};

const formatAgeRange = (ageGroupDetails) => {
  if (!ageGroupDetails) return '';
  const { minAge, maxAge } = ageGroupDetails;
  if (Number.isFinite(minAge) && Number.isFinite(maxAge)) {
    return `${minAge}-${maxAge} år`;
  }
  if (Number.isFinite(minAge) && !Number.isFinite(maxAge)) {
    return `${minAge}+ år`;
  }
  return '';
};

const isChildrenAgeGroup = (ageGroup, ageGroupDetails = null) => {
  const id = (ageGroupDetails?.id || ageGroup || '').toLowerCase();
  if (id === 'children' || id === 'barn' || id === 'kids') {
    return true;
  }
  const maxAge = ageGroupDetails?.maxAge;
  return Number.isFinite(maxAge) && maxAge > 0 && maxAge <= 12;
};

const buildChildGuardrails = (ageGroup, ageGroupDetails) => {
  if (!isChildrenAgeGroup(ageGroup, ageGroupDetails)) {
    return '';
  }
  return `
EXTRA BARNREGLER:
- Håll frågorna konkreta, vardagsnära och på lågstadienivå.
- Undvik konsthistoria, politik, krig, ekonomi och avancerad naturvetenskap.
- Undvik konstnärer, historiska epoker och annan nischad kulturkunskap.
- Om frågan nämner nationalitet (svensk/norsk osv) måste det vara korrekt, annars underkänn.
- Om du är osäker, välj ett enklare ämne eller markera frågan som ogiltig.`;
};

export class OpenAIProvider {
  constructor(apiKey, model, options = {}) {
    const providerName = options.name || 'openai';
    const providerLabel = options.label || formatProviderLabel(providerName);

    if (!apiKey) {
      throw new Error(`${providerLabel} API key is required`);
    }
    this.apiKey = apiKey;
    this.model = model || 'gpt-4o-mini';
    this.name = providerName;
    this.label = providerLabel;
    this.logPrefix = `[${providerLabel}]`;
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1/chat/completions';
    this.extraHeaders = options.extraHeaders || {};
    this.supportsResponseFormat = options.supportsResponseFormat !== false;
    this.maxQuestionsPerRequest = options.maxQuestionsPerRequest || 50;
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      ...this.extraHeaders,
    };
  }

  buildRequestBody(messages, temperature, extra = {}, { useResponseFormat } = {}) {
    const body = {
      model: this.model,
      messages,
      temperature,
      ...extra,
    };

    const allowResponseFormat = typeof useResponseFormat === 'boolean'
      ? useResponseFormat
      : this.supportsResponseFormat;

    if (allowResponseFormat) {
      body.response_format = { type: 'json_object' };
    }

    return body;
  }

  async requestChatCompletion(
    messages,
    temperature,
    extra = {},
    allowResponseFormat = this.supportsResponseFormat,
    timeoutMs = null
  ) {
    const controller = timeoutMs ? new AbortController() : null;
    const timeoutId = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let response;
    try {
      response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(this.buildRequestBody(
          messages,
          temperature,
          extra,
          { useResponseFormat: allowResponseFormat }
        )),
        signal: controller?.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(`${this.label} API timeout efter ${timeoutMs} ms`);
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      if (allowResponseFormat && errorText.toLowerCase().includes('response_format')) {
        return this.requestChatCompletion(messages, temperature, extra, false, timeoutMs);
      }
      throw new Error(`${this.label} API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Generate questions using provider
   */
  async generateQuestions(params) {
    const {
      amount,
      category,
      categoryDetails,
      ageGroup,
      ageGroupDetails,
      difficulty,
      targetAudience,
      targetAudiences,
      targetAudienceDetails,
      freshnessPrompt,
      answerInQuestionPrompt,
      language = 'sv'
    } = params;
    
    const prompt = this.buildPrompt(
      category,
      categoryDetails,
      ageGroup,
      ageGroupDetails,
      difficulty,
      targetAudience,
      targetAudiences,
      targetAudienceDetails,
      amount,
      language,
      freshnessPrompt,
      answerInQuestionPrompt
    );
    
    try {
      const data = await this.requestChatCompletion(
        [
          { 
            role: 'system', 
            content: 'Du är en expert på att skapa pedagogiska quizfrågor. Du skapar frågor på både svenska och engelska med hög kvalitet och pedagogiskt värde.' 
          },
          { role: 'user', content: prompt }
        ],
        0.7,
        {},
        this.supportsResponseFormat,
        params?.timeoutMs || null
      );
      const content = JSON.parse(data.choices[0].message.content);
      
      console.log(`${this.logPrefix} Successfully parsed response`);
      console.log(`${this.logPrefix} Questions received:`, content.questions?.length || 0);
      
      // Return questions with provider/model info (skip strict validation for now)
      if (content.questions && content.questions.length > 0) {
        return content.questions.map(q => ({
          ...q,
          provider: this.name,
          model: this.model
        }));
      }
      
      console.warn(`${this.logPrefix} No questions in response`);
      return [];
      
    } catch (error) {
      console.error(`${this.logPrefix} Generation error:`, error);
      throw new Error(`${this.label} generation failed: ${error.message}`);
    }
  }

  /**
   * Validate a question using provider
   */
  async validateQuestion(question, validationCriteria) {
    const prompt = this.buildValidationPrompt(question, validationCriteria);
    
    try {
      const data = await this.requestChatCompletion(
        [
          { 
            role: 'system', 
            content: 'Du är en expert på att validera quizfrågor för kvalitet, korrekthet och pedagogiskt värde.' 
          },
          { role: 'user', content: prompt }
        ],
        0.3
      );
      const validation = JSON.parse(data.choices[0].message.content);
      
      return {
        provider: this.name,
        model: this.model,
        isValid: validation.isValid || false,
        confidence: validation.confidence || 0,
        issues: validation.issues || [],
        suggestions: validation.suggestions || [],
        feedback: validation.feedback || 'No feedback provided',
        proposedEdits: validation.proposedEdits && typeof validation.proposedEdits === 'object'
          ? validation.proposedEdits
          : null,
        multipleCorrectOptions: validation.multipleCorrectOptions === true
          || validation.multipleCorrectOptions === 'true'
          || validation.multipleCorrectOptions === 1,
        alternativeCorrectOptions: Array.isArray(validation.alternativeCorrectOptions)
          ? validation.alternativeCorrectOptions.filter(Boolean)
          : validation.alternativeCorrectOptions
            ? [validation.alternativeCorrectOptions]
            : [],
        timeSensitive: validation.timeSensitive === true,
        bestBeforeDate: validation.bestBeforeDate || null
      };
      
    } catch (error) {
      console.error(`${this.logPrefix} Validation error:`, error);
      throw new Error(`${this.label} validation failed: ${error.message}`);
    }
  }

  async checkAnswerAmbiguity(question, _validationCriteria) {
    const prompt = this.buildAmbiguityPrompt(question);

    try {
      const data = await this.requestChatCompletion(
        [
          {
            role: 'system',
            content: 'Du är en expert på att upptäcka tvetydiga quizfrågor.'
          },
          { role: 'user', content: prompt }
        ],
        0
      );
      const result = JSON.parse(data.choices[0].message.content);
      const alternatives = Array.isArray(result.alternativeCorrectOptions)
        ? result.alternativeCorrectOptions.filter(Boolean)
        : result.alternativeCorrectOptions
          ? [result.alternativeCorrectOptions]
          : [];
      const suggestions = Array.isArray(result.suggestions)
        ? result.suggestions.filter(Boolean)
        : result.suggestions
          ? [result.suggestions]
          : [];

      return {
        multipleCorrectOptions: result.multipleCorrectOptions === true
          || result.multipleCorrectOptions === 'true'
          || result.multipleCorrectOptions === 1,
        alternativeCorrectOptions: alternatives,
        reason: result.reason || '',
        suggestions
      };
    } catch (error) {
      console.error(`${this.logPrefix} Ambiguity check error:`, error);
      throw new Error(`${this.label} ambiguity check failed: ${error.message}`);
    }
  }

  async proposeQuestionEdits(question, criteria = {}, analysis = {}) {
    const prompt = this.buildProposedEditsPrompt(question, criteria, analysis);

    try {
      const data = await this.requestChatCompletion(
        [
          {
            role: 'system',
            content: 'Du är en expert på att förbättra quizfrågor så att de blir entydiga och korrekta.'
          },
          { role: 'user', content: prompt }
        ],
        0.2
      );
      const result = JSON.parse(data.choices[0].message.content);
      const proposedEdits = result?.proposedEdits && typeof result.proposedEdits === 'object'
        ? result.proposedEdits
        : null;
      const suggestions = Array.isArray(result?.suggestions)
        ? result.suggestions.filter(Boolean)
        : result?.suggestions
          ? [result.suggestions]
          : [];

      return {
        proposedEdits,
        suggestions,
        reason: result?.reason || ''
      };
    } catch (error) {
      console.error(`${this.logPrefix} Proposed edits error:`, error);
      throw new Error(`${this.label} proposed edits failed: ${error.message}`);
    }
  }

  /**
   * Build prompt for question generation
   */
  buildPrompt(
    category,
    categoryDetails,
    ageGroup,
    ageGroupDetails,
    difficulty,
    targetAudience,
    targetAudiences,
    targetAudienceDetails,
    amount,
    language,
    freshnessPrompt,
    answerInQuestionPrompt
  ) {
    const difficultyMap = {
      'easy': 'lätt',
      'medium': 'medel',
      'hard': 'svår'
    };

    // Default values for optional parameters
    const effectiveCategory = category || 'Allmän kunskap';
    const effectiveDifficulty = difficulty || 'medium';
    const audienceInfo = buildAudienceContext(
      targetAudiences && targetAudiences.length > 0 ? targetAudiences : [targetAudience].filter(Boolean),
      targetAudienceDetails
    );

    const categoryContext = buildCategoryContext(categoryDetails);
    const ageGroupContext = ageGroupDetails?.prompt
      ? `\nÅLDERSGRUPPSINSTRUKTIONER:\n- ${ageGroupDetails.prompt}\n`
      : '';
    const childGuardrails = buildChildGuardrails(ageGroup, ageGroupDetails);
    const answerPrompt = answerInQuestionPrompt ? `\n${answerInQuestionPrompt}\n` : '';

    // Handle mixed age groups
    let ageGroupInstruction;
    if (!ageGroup || ageGroup === '') {
      ageGroupInstruction = 'Variera svårighetsgraden och rikta olika frågor till olika åldersgrupper: barn (6-12 år), ungdomar (13-17 år) och vuxna (18+). Fördela frågorna jämnt mellan åldersgrupperna.';
    } else {
      const label = ageGroupDetails?.label || ageGroup;
      const range = formatAgeRange(ageGroupDetails);
      const labelText = range ? `${label} (${range})` : label;
      ageGroupInstruction = `Alla frågor ska vara riktade till åldersgrupp ${labelText}.`;
    }

    return `Skapa ${amount} quizfrågor om ${effectiveCategory} med svårighetsgrad ${difficultyMap[effectiveDifficulty] || effectiveDifficulty}.

${ageGroupInstruction}

${audienceInfo.context}
${categoryContext}
${ageGroupContext}
${childGuardrails}
${answerPrompt}
${freshnessPrompt ? `\n${freshnessPrompt}\n` : ''}

VIKTIGT - Alla frågor MÅSTE ha BÅDE svenska OCH engelska versioner:
- question_sv: Frågan på svenska
- question_en: Frågan på engelska
- options_sv: 4 svarsalternativ på svenska
- options_en: 4 svarsalternativ på engelska
- explanation_sv: Förklaring på svenska
- explanation_en: Förklaring på engelska
- background_sv: Kort bakgrund/fördjupning på svenska (2-4 meningar)
- background_en: Kort bakgrund/fördjupning på engelska (2-4 meningar)
- ageGroup: Vilken åldersgrupp frågan riktar sig till (använd ageGroup-id)
- timeSensitive: true om frågan är tidskänslig, annars false
- bestBeforeDate: "YYYY-MM-DD" om timeSensitive=true, annars null

Varje fråga ska ha:
- Tydlig frågeställning på både svenska och engelska
- 4 svarsalternativ per språk (varav ETT är korrekt)
- Exakt ett alternativ får vara korrekt; övriga får inte kunna tolkas som rätt
- Korrekt svar angivet som index (0-3)
- Pedagogisk förklaring på båda språken
- Kort bakgrund/fördjupning på båda språken (2-4 meningar)
- En passande emoji som visuell illustration
- Target audience: en av (${audienceInfo.listText || 'swedish'})
- Age group: använd ageGroup-id (om vald åldersgrupp är angiven, använd exakt "${ageGroup || 'children'}")

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
      "background_sv": "Kort bakgrund på svenska.",
      "background_en": "Short background in English.",
      "emoji": "🎯",
      "targetAudience": "${audienceInfo.example || 'swedish'}",
      "ageGroup": "${ageGroup || 'children'}",
      "timeSensitive": false,
      "bestBeforeDate": null
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
    const childGuardrails = isChildrenAgeGroup(effectiveAgeGroup)
      ? `
EXTRA BARNREGLER:
- Underkänn om ämnet är för avancerat (konsthistoria, politik, krig, ekonomi, avancerad naturvetenskap).
- Underkänn om frågan handlar om konstnärer eller historiska epoker.
- Om fråga nämner nationalitet (svensk/norsk osv) måste rätt svar verkligen stämma.
- Om du är osäker: markera som ogiltig.`
      : '';
    const answerPrompt = criteria?.answerInQuestionPrompt ? `\n${criteria.answerInQuestionPrompt}\n` : '';
    const freshnessPrompt = criteria?.freshnessPrompt ? `\n${criteria.freshnessPrompt}\n` : '';
    
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
7. Är svårighetsgraden lämplig för målgruppen (${effectiveAgeGroup})?
8. Passar frågan kategorin ${effectiveCategory}?
9. Är frågan tidskänslig? Sätt timeSensitive och bestBeforeDate.
10. Finns det fler än ett svarsalternativ som kan vara korrekt? Om ja, underkänn.
${childGuardrails}
${answerPrompt}
${freshnessPrompt}

Om du underkänner (isValid=false) MÅSTE suggestions innehålla 1-3 konkreta förbättringsförslag.
Om frågan kan rättas med konkreta ändringar: fyll proposedEdits med korrigerade fält (sv/en). Annars sätt proposedEdits till null.

Returnera JSON med följande format (all text MÅSTE vara på SVENSKA):
{
  "isValid": true/false,
  "confidence": 0-100,
  "issues": ["eventuella problem på svenska"],
  "suggestions": ["eventuella förbättringsförslag på svenska"],
  "feedback": "Kort sammanfattning av valideringen på svenska",
  "background": "2-4 meningar fördjupning/kontext om ämnet som hjälper spelaren att förstå svaret",
  "factSummary": ["2-4 korta faktapunkter som styrker svaret eller rättar till felaktigheter"],
  "multipleCorrectOptions": true/false,
  "alternativeCorrectOptions": ["valfritt: andra alternativ som kan vara korrekta"],
  "proposedEdits": {
    "question_sv": "valfritt",
    "question_en": "valfritt",
    "options_sv": ["valfritt", "valfritt", "valfritt", "valfritt"],
    "options_en": ["valfritt", "valfritt", "valfritt", "valfritt"],
    "correctOption": 0,
    "explanation_sv": "valfritt",
    "explanation_en": "valfritt",
    "background_sv": "valfritt",
    "background_en": "valfritt"
  },
  "timeSensitive": true/false,
  "bestBeforeDate": "YYYY-MM-DD eller null"
}

VIKTIGT: All feedback, issues, suggestions, background och factSummary MÅSTE vara på SVENSKA.`;
  }

  /**
   * Validate and format questions from AI response
   */
  validateAndFormatQuestions(questions) {
    console.log(`${this.logPrefix} Validating`, questions.length, 'questions');
    console.log(`${this.logPrefix} First question keys:`, questions[0] ? Object.keys(questions[0]) : 'no questions');
    
    const validated = questions.filter(q => {
      // Log full question structure
      console.log(`${this.logPrefix} Checking question:`, JSON.stringify(q, null, 2));
      
      // Basic validation - check both new format (question_sv/en) and potential old format
      const hasQuestion = (q.question_sv && q.question_en) || q.question;
      if (!hasQuestion) {
        console.warn(`${this.logPrefix} Skipping question without question field`);
        return false;
      }
      
      const hasOptions = (Array.isArray(q.options_sv) && q.options_sv.length === 4 && 
                         Array.isArray(q.options_en) && q.options_en.length === 4) ||
                        (Array.isArray(q.options) && q.options.length === 4);
      if (!hasOptions) {
        console.warn(`${this.logPrefix} Skipping question with invalid options`);
        return false;
      }
      
      if (typeof q.correctOption !== 'number' || q.correctOption < 0 || q.correctOption > 3) {
        console.warn(`${this.logPrefix} Skipping question with invalid correctOption`);
        return false;
      }
      const backgroundSv = q.background_sv || q.background;
      const backgroundEn = q.background_en || q.background;
      if (!backgroundSv || !backgroundEn) {
        console.warn(`${this.logPrefix} Skipping question without bilingual background`);
        return false;
      }
      return true;
    }).map(q => ({
      ...q,
      background_sv: q.background_sv || q.background || '',
      background_en: q.background_en || q.background || '',
      timeSensitive: q.timeSensitive === true,
      bestBeforeDate: q.bestBeforeDate || null,
      provider: this.name,
      model: this.model
    }));
    
    console.log(`${this.logPrefix} Validated`, validated.length, 'of', questions.length, 'questions');
    return validated;
  }

  /**
   * Check if provider has credits/tokens available
   * Makes a minimal API call to verify access
   */
  async checkCredits() {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        // Parse error to check for specific issues
        if (error.includes('insufficient_quota') || error.includes('rate_limit')) {
          return { 
            available: false, 
            error: 'insufficient_credits',
            message: 'Insufficient quota or rate limit exceeded'
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
      console.error(`${this.logPrefix} Credit check error:`, error);
      return { 
        available: false, 
        error: 'connection_error',
        message: error.message 
      };
    }
  }

  buildAmbiguityPrompt(question) {
    const questionText = question?.question_sv || question?.question || '';
    const options = question?.options_sv || question?.options || [];
    const correctIndex = Number.isFinite(question?.correctOption) ? question.correctOption : null;
    const correctText = Number.isFinite(correctIndex) && options[correctIndex] ? options[correctIndex] : null;

    return `Bedöm om fler än ett svarsalternativ kan vara korrekt för frågan nedan.

FRÅGA (SV):
${questionText}

SVARSALTERNATIV (SV):
${JSON.stringify(options)}

Markerat rätt svar (index): ${Number.isFinite(correctIndex) ? correctIndex : 'okänt'}
Markerat rätt svar (text): ${correctText || 'okänt'}

Regler:
- Om två eller fler alternativ kan vara korrekta, sätt multipleCorrectOptions=true.
- Lista då ALLA alternativ som kan vara korrekta (exakt som de står i listan).
- Om frågan är vag ("känd för", "populär", "vackra", "välkänd") och flera alternativ passar, markera true.
- Om du är osäker, markera true.

Returnera ENDAST JSON:
{
  "multipleCorrectOptions": true/false,
  "alternativeCorrectOptions": ["exakt alternativtext", "..."],
  "reason": "kort förklaring på svenska",
  "suggestions": ["1-3 korta förbättringsförslag för att göra frågan entydig"]
}`;
  }

  buildProposedEditsPrompt(question, criteria = {}, analysis = {}) {
    const { category, ageGroup, difficulty } = criteria;
    const issues = Array.isArray(analysis.issues) ? analysis.issues : [];
    const suggestions = Array.isArray(analysis.suggestions) ? analysis.suggestions : [];
    const blockingRules = Array.isArray(analysis.blockingRules) ? analysis.blockingRules : [];
    const issuesBlock = issues.length > 0 ? issues.map((issue) => `- ${issue}`).join('\n') : '- (inga)';
    const suggestionsBlock = suggestions.length > 0 ? suggestions.map((item) => `- ${item}`).join('\n') : '- (inga)';
    const rulesBlock = blockingRules.length > 0 ? blockingRules.map((rule) => `- ${rule}`).join('\n') : '- (inga)';
    const answerPrompt = criteria?.answerInQuestionPrompt ? `\n${criteria.answerInQuestionPrompt}\n` : '';

    return `Du ska föreslå konkreta ändringar så att frågan blir entydig och godkänd.

KONTEXT:
- Kategori: ${category || 'Allmän'}
- Åldersgrupp: ${ageGroup || 'adults'}
- Svårighetsgrad: ${difficulty || 'medium'}

PROBLEM:
${issuesBlock}

FÖRSLAG:
${suggestionsBlock}
${answerPrompt}

BLOCKERANDE REGLER:
${rulesBlock}

FRÅGA (JSON):
${JSON.stringify(question, null, 2)}

Regler:
- Ändra så lite som möjligt.
- Behåll 4 svarsalternativ per språk.
- Om du ändrar svarsalternativ måste correctOption uppdateras.
- Returnera bara fält som ska ändras; utelämna fält som inte behöver ändras.
- Om du inte kan ge säkra ändringar, sätt proposedEdits till null.

Returnera ENDAST JSON:
{
  "proposedEdits": {
    "question_sv": "valfritt",
    "question_en": "valfritt",
    "options_sv": ["valfritt", "valfritt", "valfritt", "valfritt"],
    "options_en": ["valfritt", "valfritt", "valfritt", "valfritt"],
    "correctOption": 0,
    "explanation_sv": "valfritt",
    "explanation_en": "valfritt",
    "background_sv": "valfritt",
    "background_en": "valfritt"
  },
  "reason": "kort förklaring på svenska",
  "suggestions": ["1-3 korta förbättringsförslag (valfritt)"]
}`;
  }

  /**
   * Get provider info
   */
  getInfo() {
    return {
      name: this.name,
      label: this.label,
      model: this.model,
      capabilities: ['generation', 'validation'],
      supportsLanguages: ['sv', 'en'],
      maxQuestionsPerRequest: this.maxQuestionsPerRequest
    };
  }
}
