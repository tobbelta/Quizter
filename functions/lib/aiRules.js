import { DEFAULT_RULE_CONFIG } from './questionRules.js';

const normalizeRuleEntry = (entry) => {
  if (!entry || !entry.pattern) return null;
  return {
    pattern: String(entry.pattern),
    issue: entry.issue ? String(entry.issue) : 'Regelbrott i frågan.',
    ageGroups: Array.isArray(entry.ageGroups)
      ? entry.ageGroups.map((value) => String(value).toLowerCase().trim()).filter(Boolean)
      : [],
    enabled: entry.enabled !== false
  };
};

const normalizeRuleList = (list) => (
  Array.isArray(list) ? list.map(normalizeRuleEntry).filter(Boolean) : []
);

const normalizeRuleSet = (config, defaults = {}) => ({
  enabled: config?.enabled !== false,
  answerInQuestion: config?.answerInQuestion || defaults.answerInQuestion || null,
  autoCorrection: config?.autoCorrection || defaults.autoCorrection || { enabled: false },
  freshness: config?.freshness || defaults.freshness || null,
  maxQuestionLengthByAgeGroup: config?.maxQuestionLengthByAgeGroup || defaults.maxQuestionLengthByAgeGroup || {},
  blocklist: normalizeRuleList(Array.isArray(config?.blocklist) ? config.blocklist : defaults.blocklist || [])
});

export const ensureAiRulesTable = async (db) => {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ai_rule_sets (
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      config TEXT NOT NULL,
      updated_at INTEGER,
      PRIMARY KEY (scope_type, scope_id)
    )
  `).run();
};

export const getAiRulesConfig = async (db) => {
  await ensureAiRulesTable(db);
  const rows = await db.prepare('SELECT * FROM ai_rule_sets').all();
  const config = { global: null, targetAudiences: {} };

  (rows.results || []).forEach((row) => {
    let parsed = null;
    try {
      parsed = JSON.parse(row.config);
    } catch (error) {
      parsed = null;
    }
    if (!parsed) return;
    if (row.scope_type === 'global') {
      config.global = parsed;
    } else if (row.scope_type === 'target_audience') {
      config.targetAudiences[row.scope_id] = parsed;
    }
  });

  const normalizedGlobal = normalizeRuleSet(config.global, DEFAULT_RULE_CONFIG.global);
  const targetAudiences = {};
  Object.entries(config.targetAudiences || {}).forEach(([key, value]) => {
    targetAudiences[String(key).toLowerCase()] = normalizeRuleSet(value);
  });

  return {
    global: normalizedGlobal,
    targetAudiences
  };
};

export const saveAiRulesConfig = async (db, config = {}) => {
  await ensureAiRulesTable(db);
  const now = Date.now();

  const globalConfig = normalizeRuleSet(config.global, DEFAULT_RULE_CONFIG.global);
  await db.prepare(`
    INSERT INTO ai_rule_sets (scope_type, scope_id, config, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(scope_type, scope_id) DO UPDATE SET config = ?, updated_at = ?
  `).bind(
    'global',
    'global',
    JSON.stringify(globalConfig),
    now,
    JSON.stringify(globalConfig),
    now
  ).run();

  const targetAudiences = config.targetAudiences || {};
  const targetIds = Object.keys(targetAudiences).map((id) => String(id).toLowerCase());
  for (const targetId of targetIds) {
    const normalized = normalizeRuleSet(targetAudiences[targetId]);
    await db.prepare(`
      INSERT INTO ai_rule_sets (scope_type, scope_id, config, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(scope_type, scope_id) DO UPDATE SET config = ?, updated_at = ?
    `).bind(
      'target_audience',
      targetId,
      JSON.stringify(normalized),
      now,
      JSON.stringify(normalized),
      now
    ).run();
  }

  const existingTargets = await db.prepare(
    'SELECT scope_id FROM ai_rule_sets WHERE scope_type = ?'
  ).bind('target_audience').all();
  const existingIds = new Set((existingTargets.results || []).map((row) => row.scope_id));
  for (const existingId of existingIds) {
    if (!targetIds.includes(existingId)) {
      await db.prepare('DELETE FROM ai_rule_sets WHERE scope_type = ? AND scope_id = ?')
        .bind('target_audience', existingId)
        .run();
    }
  }

  return { success: true };
};
