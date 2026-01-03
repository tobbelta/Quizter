/**
 * Mistral Provider for Question Generation
 * Model: mistral-small-latest
 */

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

export class MistralProvider {
  constructor(apiKey, model) {
    if (!apiKey) {
      throw new Error('Mistral API key is required');
    }
    this.apiKey = apiKey;
    this.model = model || 'mistral-small-latest';
    this.name = 'mistral';
  }

  /**
   * Generate questions using Mistral
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
      language = 'sv',
      timeoutMs = null
    } = params;
    const onDebug = typeof params?.onDebug === 'function' ? params.onDebug : null;

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
    const controller = timeoutMs ? new AbortController() : null;
    const timeoutId = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const requestBody = {
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
    };
    onDebug?.({
      stage: 'request',
      payload: {
        model: this.model,
        url: 'https://api.mistral.ai/v1/chat/completions',
        body: requestBody
      }
    });

    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller?.signal
      });
      
      if (!response.ok) {
        const error = await response.text();
        onDebug?.({ stage: 'error', error });
        throw new Error(`Mistral API error (${response.status}): ${error}`);
      }
      
      const data = await response.json();
      onDebug?.({ stage: 'response', payload: data });
      const content = JSON.parse(data.choices[0].message.content);
      
      return this.validateAndFormatQuestions(content.questions || []);
      
    } catch (error) {
      if (error?.name === 'AbortError') {
        const message = `Mistral API timeout efter ${timeoutMs} ms`;
        onDebug?.({ stage: 'error', error: message });
        throw new Error(message);
      }
      console.error('[Mistral] Generation error:', error);
      onDebug?.({ stage: 'error', error: error.message });
      throw new Error(`Mistral generation failed: ${error.message}`);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Validate a question using Mistral
   */
  async validateQuestion(question, validationCriteria) {
    const onDebug = typeof validationCriteria?.onDebug === 'function' ? validationCriteria.onDebug : null;
    const prompt = this.buildValidationPrompt(question, validationCriteria);
    const requestBody = {
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
    };
    onDebug?.({
      stage: 'request',
      payload: {
        model: this.model,
        url: 'https://api.mistral.ai/v1/chat/completions',
        body: requestBody
      }
    });
    
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const error = await response.text();
        onDebug?.({ stage: 'error', error });
        throw new Error(`Mistral validation error (${response.status}): ${error}`);
      }
      
      const data = await response.json();
      onDebug?.({ stage: 'response', payload: data });
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
      console.error('[Mistral] Validation error:', error);
      onDebug?.({ stage: 'error', error: error.message });
      throw new Error(`Mistral validation failed: ${error.message}`);
    }
  }

  async checkAnswerAmbiguity(question, _validationCriteria) {
    const onDebug = typeof _validationCriteria?.onDebug === 'function' ? _validationCriteria.onDebug : null;
    const prompt = this.buildAmbiguityPrompt(question);
    const requestBody = {
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'Du är en expert på att upptäcka tvetydiga quizfrågor.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      response_format: { type: 'json_object' }
    };
    onDebug?.({
      stage: 'request',
      payload: {
        model: this.model,
        url: 'https://api.mistral.ai/v1/chat/completions',
        body: requestBody
      }
    });

    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.text();
        onDebug?.({ stage: 'error', error });
        throw new Error(`Mistral ambiguity error (${response.status}): ${error}`);
      }

      const data = await response.json();
      onDebug?.({ stage: 'response', payload: data });
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
      console.error('[Mistral] Ambiguity check error:', error);
      onDebug?.({ stage: 'error', error: error.message });
      throw new Error(`Mistral ambiguity check failed: ${error.message}`);
    }
  }

  async proposeQuestionEdits(question, criteria = {}, analysis = {}) {
    const onDebug = typeof criteria?.onDebug === 'function' ? criteria.onDebug : null;
    const prompt = this.buildProposedEditsPrompt(question, criteria, analysis);
    const requestBody = {
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'Du är en expert på att förbättra quizfrågor så att de blir entydiga och korrekta.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    };
    onDebug?.({
      stage: 'request',
      payload: {
        model: this.model,
        url: 'https://api.mistral.ai/v1/chat/completions',
        body: requestBody
      }
    });

    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.text();
        onDebug?.({ stage: 'error', error });
        throw new Error(`Mistral proposed edits error (${response.status}): ${error}`);
      }

      const data = await response.json();
      onDebug?.({ stage: 'response', payload: data });
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
      console.error('[Mistral] Proposed edits error:', error);
      onDebug?.({ stage: 'error', error: error.message });
      throw new Error(`Mistral proposed edits failed: ${error.message}`);
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

    const label = ageGroupDetails?.label || ageGroup || 'vuxna';
    const range = formatAgeRange(ageGroupDetails);
    const labelText = range ? `${label} (${range})` : label;

    return `Skapa ${amount} quizfrågor om ${effectiveCategory} för åldersgrupp ${labelText} med svårighetsgrad ${difficultyMap[effectiveDifficulty] || effectiveDifficulty}.

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
- ageGroup: använd ageGroup-id (om vald åldersgrupp är angiven, använd exakt "${ageGroup || 'children'}")
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
7. Är svårighetsgraden lämplig för målgruppen (${ageGroup})?
8. Passar frågan kategorin ${category}?
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
    const ambiguity = analysis.ambiguity || null;
    const ambiguityAlternatives = Array.isArray(ambiguity?.alternativeCorrectOptions)
      ? ambiguity.alternativeCorrectOptions.filter(Boolean)
      : [];
    const ambiguityReason = String(ambiguity?.reason || '').trim();
    const preferOptionFix = analysis.preferOptionFix === true;
    const issuesBlock = issues.length > 0 ? issues.map((issue) => `- ${issue}`).join('\n') : '- (inga)';
    const suggestionsBlock = suggestions.length > 0 ? suggestions.map((item) => `- ${item}`).join('\n') : '- (inga)';
    const rulesBlock = blockingRules.length > 0 ? blockingRules.map((rule) => `- ${rule}`).join('\n') : '- (inga)';
    const answerPrompt = criteria?.answerInQuestionPrompt ? `\n${criteria.answerInQuestionPrompt}\n` : '';
    const ambiguityBlock = (preferOptionFix || ambiguityAlternatives.length > 0 || ambiguityReason)
      ? `\nTVETYDIGHET:\n- Flera svar kan vara korrekta.\n- Alternativa svar: ${ambiguityAlternatives.length > 0 ? ambiguityAlternatives.join(', ') : 'okänt'}.\n- Orsak: ${ambiguityReason || 'okänd'}.\n- Prefererad åtgärd: Ändra svarsalternativen (behåll frågan) så att endast ett alternativ är korrekt.\n- Se till att ALLA alternativ är av samma typ som frågan (t.ex. berg/stad/sjö/person). Byt ut feltypade alternativ.\n`
      : '';

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
${ambiguityBlock}

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
      const backgroundSv = q.background_sv || q.background;
      const backgroundEn = q.background_en || q.background;
      if (!backgroundSv || !backgroundEn) {
        console.warn('[Mistral] Skipping question without bilingual background:', q);
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
