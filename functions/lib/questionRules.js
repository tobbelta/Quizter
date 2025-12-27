const DEFAULT_CHILD_BLOCKLIST = [
  {
    pattern: '\\bkonstn(?:a|\\u00e4)r(?:er|en|et|erna|s)?\\b',
    issue: 'Frågor om konstnärer är för avancerat för barn.'
  },
  {
    pattern: '\\bm(?:a|\\u00e5)l(?:a|\\u00e4)(?:de|r|re|ri)?\\b',
    issue: 'Frågor om måleri/konst är för avancerat för barn.'
  },
  {
    pattern: '\\b(impressionism|ren(?:a|\\u00e4)ssans|barock|expressionism|surrealism|kubism|realism|modernism)\\b',
    issue: 'Konsthistoria är för avancerat för barn.'
  },
  {
    pattern: '\\b(munch|picasso|da vinci|van gogh|monet|rembrandt|michelangelo|dali)\\b',
    issue: 'Namngivna konstnärer är för avancerat för barn.'
  },
  {
    pattern: '\\b(politik|riksdag|statsminister|regering|parlament|valsystem)\\b',
    issue: 'Politik är för avancerat för barn.'
  },
  {
    pattern: '\\b(v(?:a|\\u00e4)rldskrig|kalla kriget|krig)\\b',
    issue: 'Frågor om krig är för avancerat för barn.'
  },
  {
    pattern: '\\b(inflation|r(?:a|\\u00e4)nta|budget|skatt|ekonomi)\\b',
    issue: 'Ekonomi är för avancerat för barn.'
  },
  {
    pattern: '\\b(molekyl|genetik|dna|kvant|relativitet|atom)\\b',
    issue: 'Avancerad naturvetenskap är för avancerat för barn.'
  },
  {
    pattern: '\\b(opera|symfoni|komposit(?:o|\\u00f6)r|dirigent)\\b',
    issue: 'Avancerad musikhistoria är för avancerat för barn.'
  }
];

export const DEFAULT_RULE_CONFIG = {
  global: {
    enabled: true,
    answerInQuestion: {
      enabled: true,
      minAnswerLength: 4
    },
    autoCorrection: {
      enabled: false
    },
    freshness: {
      enabled: true,
      defaultShelfLifeDays: 365,
      minShelfLifeDays: 30,
      maxShelfLifeDays: 1825,
      guidance: 'Markera frågor som tidskänsliga om de bygger på trender, nyheter, aktuella barnprogram eller tidsbundna händelser. Ange ett rimligt bäst före-datum.',
      autoTimeSensitiveAgeGroups: ['youth']
    },
    maxQuestionLengthByAgeGroup: {
      children: 180
    },
    blocklist: DEFAULT_CHILD_BLOCKLIST.map((rule) => ({
      ...rule,
      ageGroups: ['children']
    }))
  },
  targetAudiences: {}
};

const normalizeText = (value) => (value ? String(value).toLowerCase() : '');

const resolveAgeGroupId = (question, criteria = {}) => {
  if (question?.ageGroup) return String(question.ageGroup).toLowerCase();
  if (Array.isArray(question?.ageGroups) && question.ageGroups.length > 0) {
    return String(question.ageGroups[0]).toLowerCase();
  }
  if (Array.isArray(question?.age_groups) && question.age_groups.length > 0) {
    return String(question.age_groups[0]).toLowerCase();
  }
  if (criteria?.ageGroup) return String(criteria.ageGroup).toLowerCase();
  return '';
};

const resolveAgeGroupIds = (question, criteria = {}) => {
  const values = new Set();
  const addValue = (value) => {
    if (!value) return;
    values.add(String(value).toLowerCase());
  };
  const addList = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach(addValue);
  };

  addList(question?.ageGroups || question?.age_groups);
  addValue(question?.ageGroup || question?.age_group);
  addList(criteria?.ageGroups);
  addValue(criteria?.ageGroup);

  if (values.size === 0) {
    const fallback = resolveAgeGroupId(question, criteria);
    if (fallback) values.add(fallback);
  }

  return Array.from(values);
};

const resolveTargetAudienceId = (question, criteria = {}) => {
  const direct = question?.targetAudience || question?.target_audience;
  if (direct) return String(direct).toLowerCase();
  if (criteria?.targetAudience) return String(criteria.targetAudience).toLowerCase();
  return '';
};

const buildTextBlob = (question) => {
  const parts = [];

  const pushValue = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry) parts.push(String(entry));
      });
      return;
    }
    parts.push(String(value));
  };

  pushValue(question?.question_sv || question?.question);
  pushValue(question?.question_en);
  pushValue(question?.explanation_sv || question?.explanation);
  pushValue(question?.explanation_en);
  pushValue(question?.background_sv || question?.background);
  pushValue(question?.background_en);
  pushValue(question?.options_sv || question?.options);
  pushValue(question?.options_en);

  return normalizeText(parts.join(' '));
};

const getLanguageBlock = (question, language = 'sv') => {
  if (language === 'en') {
    return {
      text: question?.question_en,
      options: question?.options_en
    };
  }
  return {
    text: question?.question_sv || question?.question,
    options: question?.options_sv || question?.options
  };
};

const hasAnswerInQuestion = (question, language = 'sv', minLength = 4) => {
  const correctOption = question?.correctOption ?? question?.correct_option;
  if (!Number.isFinite(correctOption)) return false;
  const { text, options } = getLanguageBlock(question, language);
  if (!text || !Array.isArray(options) || !options[correctOption]) return false;

  const answerText = String(options[correctOption]).trim();
  if (answerText.length < minLength) return false;

  return normalizeText(text).includes(normalizeText(answerText));
};

const hasDefinitionHint = (question) => {
  const svText = String(question?.question_sv || question?.question || '').toLowerCase();
  const enText = String(question?.question_en || '').toLowerCase();
  const svHint = /\b(d\.?\s*v\.?\s*s\.?|dvs|det vill säga|vilket betyder|som betyder|det betyder)\b/i;
  const enHint = /\b(i\.?\s*e\.?|that is|which means|meaning)\b/i;
  return svHint.test(svText) || enHint.test(enText);
};

const normalizeRuleEntry = (entry) => {
  if (!entry || !entry.pattern) return null;
  const ageGroups = Array.isArray(entry.ageGroups)
    ? entry.ageGroups.map((value) => String(value).toLowerCase().trim()).filter(Boolean)
    : [];
  return {
    pattern: String(entry.pattern),
    issue: entry.issue ? String(entry.issue) : 'Regelbrott i frågan.',
    ageGroups,
    enabled: entry.enabled !== false
  };
};

const normalizeFreshness = (config = {}, defaults = {}) => ({
  enabled: config?.enabled !== false,
  defaultShelfLifeDays: Number.isFinite(Number(config?.defaultShelfLifeDays))
    ? Number(config.defaultShelfLifeDays)
    : Number(defaults.defaultShelfLifeDays) || 365,
  minShelfLifeDays: Number.isFinite(Number(config?.minShelfLifeDays))
    ? Number(config.minShelfLifeDays)
    : Number(defaults.minShelfLifeDays) || 0,
  maxShelfLifeDays: Number.isFinite(Number(config?.maxShelfLifeDays))
    ? Number(config.maxShelfLifeDays)
    : Number(defaults.maxShelfLifeDays) || 3650,
  autoTimeSensitiveAgeGroups: Array.isArray(config?.autoTimeSensitiveAgeGroups)
    ? config.autoTimeSensitiveAgeGroups.map((value) => String(value).toLowerCase().trim()).filter(Boolean)
    : Array.isArray(defaults.autoTimeSensitiveAgeGroups)
      ? defaults.autoTimeSensitiveAgeGroups.map((value) => String(value).toLowerCase().trim()).filter(Boolean)
      : [],
  guidance: typeof config?.guidance === 'string'
    ? config.guidance
    : (defaults.guidance || '')
});

const normalizeRuleList = (list) => (
  Array.isArray(list)
    ? list.map(normalizeRuleEntry).filter(Boolean)
    : []
);

const resolveRuleConfig = (config = {}) => {
  const globalDefaults = DEFAULT_RULE_CONFIG.global;
  const globalConfig = config.global || {};
  const answerInQuestion = {
    ...globalDefaults.answerInQuestion,
    ...(globalConfig.answerInQuestion || {})
  };
  const freshness = normalizeFreshness(globalConfig.freshness, globalDefaults.freshness);
  const maxQuestionLengthByAgeGroup = {
    ...globalDefaults.maxQuestionLengthByAgeGroup,
    ...(globalConfig.maxQuestionLengthByAgeGroup || {})
  };
  const blocklist = Array.isArray(globalConfig.blocklist)
    ? normalizeRuleList(globalConfig.blocklist)
    : normalizeRuleList(globalDefaults.blocklist);

  const targetAudiences = {};
  const targetConfig = config.targetAudiences || {};
  Object.entries(targetConfig).forEach(([key, value]) => {
    const normalizedKey = String(key).toLowerCase();
    const entry = value || {};
    targetAudiences[normalizedKey] = {
      enabled: entry.enabled !== false,
      answerInQuestion: entry.answerInQuestion || null,
      maxQuestionLengthByAgeGroup: entry.maxQuestionLengthByAgeGroup || null,
      blocklist: normalizeRuleList(entry.blocklist),
      freshness: entry.freshness || null
    };
  });

  return {
    global: {
      enabled: globalConfig.enabled !== false,
      answerInQuestion,
      freshness,
      maxQuestionLengthByAgeGroup,
      blocklist
    },
    targetAudiences
  };
};

export const resolveFreshnessConfig = (config = {}, targetAudienceId = '') => {
  const resolved = resolveRuleConfig(config);
  const globalFreshness = resolved.global?.freshness || DEFAULT_RULE_CONFIG.global.freshness;
  const targetRules = targetAudienceId
    ? resolved.targetAudiences[String(targetAudienceId).toLowerCase()]
    : null;
  if (!targetRules?.freshness) {
    return globalFreshness;
  }
  return normalizeFreshness(targetRules.freshness, globalFreshness);
};

export const buildFreshnessPrompt = (freshnessConfig = {}, criteria = {}) => {
  if (!freshnessConfig || freshnessConfig.enabled === false) {
    return '';
  }
  const minDays = Number(freshnessConfig.minShelfLifeDays) || 0;
  const maxDays = Number(freshnessConfig.maxShelfLifeDays) || 0;
  const defaultDays = Number(freshnessConfig.defaultShelfLifeDays) || 0;
  const autoAgeGroups = Array.isArray(freshnessConfig.autoTimeSensitiveAgeGroups)
    ? freshnessConfig.autoTimeSensitiveAgeGroups.map((value) => String(value).toLowerCase()).filter(Boolean)
    : [];
  const guidance = String(freshnessConfig.guidance || '').trim();
  const criteriaQuestion = criteria?.question || null;
  const resolvedAgeGroups = resolveAgeGroupIds(criteriaQuestion, criteria);
  const hasAgeGroupFilter = resolvedAgeGroups.length > 0;
  const relevantAutoAgeGroups = hasAgeGroupFilter
    ? autoAgeGroups.filter((value) => resolvedAgeGroups.includes(String(value).toLowerCase()))
    : autoAgeGroups;
  const includeGuidance = guidance && (!hasAgeGroupFilter || relevantAutoAgeGroups.length > 0);
  const includeAutoLine = relevantAutoAgeGroups.length > 0;
  const dayHint = [
    minDays > 0 ? `minst ${minDays} dagar` : null,
    maxDays > 0 ? `max ${maxDays} dagar` : null,
    defaultDays > 0 ? `standard ${defaultDays} dagar om osäker` : null
  ].filter(Boolean).join(', ');

  return [
    'AKTUALITET/BÄST FÖRE:',
    includeGuidance ? `- Riktlinje: ${guidance}` : null,
    dayHint ? `- Bäst före-intervall: ${dayHint}.` : null,
    includeAutoLine
      ? `- För åldersgrupper (${relevantAutoAgeGroups.join(', ')}) ska du oftare markera timeSensitive=true.`
      : null,
    '- Markera timeSensitive=true om frågan är tidskänslig.',
    '- Ange bestBeforeDate (YYYY-MM-DD) om timeSensitive=true, annars null.'
  ].filter(Boolean).join('\n');
};

export const buildAnswerInQuestionPrompt = (answerConfig = {}) => {
  if (!answerConfig || answerConfig.enabled === false) {
    return '';
  }
  const minLength = Number(answerConfig.minAnswerLength) || 4;
  return [
    'SVAR I FRÅGAN:',
    '- Svaret får inte förekomma i frågetexten eller i parentesförklaringar (d.v.s., dvs, det vill säga, vilket betyder).',
    '- Undvik att definiera termen i själva frågan.',
    `- Bedöm matchning på minst ${minLength} tecken när du avgör om svaret syns i frågan.`
  ].join('\n');
};

const shouldApplyRule = (rule, ageGroupId) => {
  if (!rule || rule.enabled === false) return false;
  if (!rule.ageGroups || rule.ageGroups.length === 0) return true;
  return rule.ageGroups.includes(ageGroupId);
};

const matchesRule = (pattern, text) => {
  if (!pattern || !text) return false;
  try {
    const regex = new RegExp(pattern, 'i');
    return regex.test(text);
  } catch (error) {
    return normalizeText(text).includes(normalizeText(pattern));
  }
};

export const evaluateQuestionRules = (question, criteria = {}, config = {}) => {
  const issues = [];
  const resolvedConfig = resolveRuleConfig(config);
  const ageGroupId = resolveAgeGroupId(question, criteria);
  const targetAudienceId = resolveTargetAudienceId(question, criteria);

  const targetRules = targetAudienceId
    ? resolvedConfig.targetAudiences[targetAudienceId]
    : null;

  if (resolvedConfig.global.enabled !== false) {
    const minAnswerLength = Number(resolvedConfig.global.answerInQuestion?.minAnswerLength) || 4;
    if (resolvedConfig.global.answerInQuestion?.enabled !== false) {
      if (hasAnswerInQuestion(question, 'sv', minAnswerLength) || hasAnswerInQuestion(question, 'en', minAnswerLength)) {
        issues.push('Frågan avslöjar svaret i frågetexten.');
      } else if (hasDefinitionHint(question)) {
        issues.push('Frågan innehåller en förklaring i frågetexten.');
      }
    }

    const maxLength = resolvedConfig.global.maxQuestionLengthByAgeGroup?.[ageGroupId];
    if (Number.isFinite(Number(maxLength))) {
      const questionText = String(question?.question_sv || question?.question || '');
      if (questionText.length > Number(maxLength)) {
        issues.push('Frågetexten är för lång för angiven åldersgrupp.');
      }
    }

    const blob = buildTextBlob(question);
    resolvedConfig.global.blocklist.forEach((rule) => {
      if (!shouldApplyRule(rule, ageGroupId)) return;
      if (matchesRule(rule.pattern, blob)) {
        issues.push(rule.issue);
      }
    });
  }

  if (targetRules && targetRules.enabled !== false) {
    const mergedBlocklist = targetRules.blocklist || [];
    const blob = buildTextBlob(question);
    mergedBlocklist.forEach((rule) => {
      if (!shouldApplyRule(rule, ageGroupId)) return;
      if (matchesRule(rule.pattern, blob)) {
        issues.push(rule.issue);
      }
    });

    const maxLength = targetRules.maxQuestionLengthByAgeGroup?.[ageGroupId];
    if (Number.isFinite(Number(maxLength))) {
      const questionText = String(question?.question_sv || question?.question || '');
      if (questionText.length > Number(maxLength)) {
        issues.push('Frågetexten är för lång för angiven åldersgrupp.');
      }
    }
  }

  return {
    isValid: issues.length === 0,
    issues
  };
};

export const filterQuestionsByRules = (questions, criteria = {}, config = {}) => {
  const acceptedQuestions = [];
  const rejectedQuestions = [];

  (questions || []).forEach((question) => {
    const result = evaluateQuestionRules(question, criteria, config);
    if (result.isValid) {
      acceptedQuestions.push(question);
    } else {
      rejectedQuestions.push({ ...question, ruleIssues: result.issues });
    }
  });

  return { acceptedQuestions, rejectedQuestions };
};
