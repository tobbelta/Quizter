const DEFAULT_AGE_GROUPS = [
  {
    id: 'children',
    label: 'Barn',
    description: '6-12 år',
    prompt: 'Kortare frågor, tydliga ledtrådar och vardagsnära exempel. Ta gärna upp aktuella barnprogram och kända figurer för barn. Undvik konsthistoria, politik, krig, ekonomi och avancerad vetenskap. Håll frågorna konkreta och enkla.',
    minAge: 6,
    maxAge: 12,
    sortOrder: 10
  },
  {
    id: 'youth',
    label: 'Ungdom',
    description: '13-17 år',
    prompt: 'Lite mer utmanande frågor, men undvik alltför nischade fakta.',
    minAge: 13,
    maxAge: 17,
    sortOrder: 20
  },
  {
    id: 'adults',
    label: 'Vuxen',
    description: '18+ år',
    prompt: 'Djupare resonemang och mer variation i svårighetsgrad.',
    minAge: 18,
    maxAge: null,
    sortOrder: 30
  }
];

const DEFAULT_TARGET_AUDIENCES = [
  {
    id: 'swedish',
    label: 'Svensk',
    description: 'Svensk kontext och referenser.',
    prompt: 'Fokusera på svensk kultur, historia och geografi när det är relevant.',
    sortOrder: 10
  },
  {
    id: 'english',
    label: 'Engelsk',
    description: 'Engelskspråkig målgrupp.',
    prompt: 'Håll frågorna neutrala och internationellt begripliga.',
    sortOrder: 20
  },
  {
    id: 'international',
    label: 'Internationell',
    description: 'Global målgrupp.',
    prompt: 'Fokusera på global kunskap och internationella perspektiv.',
    sortOrder: 30
  },
  {
    id: 'global',
    label: 'Global',
    description: 'Global målgrupp (synonym till internationell).',
    prompt: 'Fokusera på global kunskap och internationella perspektiv.',
    sortOrder: 40
  },
  {
    id: 'german',
    label: 'Tysk',
    description: 'Tysk målgrupp.',
    prompt: 'Anpassa exempel till tyskt sammanhang när relevant.',
    sortOrder: 50
  },
  {
    id: 'norwegian',
    label: 'Norsk',
    description: 'Norsk målgrupp.',
    prompt: 'Anpassa exempel till norsk kontext när relevant.',
    sortOrder: 60
  },
  {
    id: 'danish',
    label: 'Dansk',
    description: 'Dansk målgrupp.',
    prompt: 'Anpassa exempel till dansk kontext när relevant.',
    sortOrder: 70
  }
];

const DEFAULT_AGE_GROUP_TARGETS = [
  { ageGroupId: 'children', targetAudienceId: 'swedish' },
  { ageGroupId: 'youth', targetAudienceId: 'global' },
  { ageGroupId: 'adults', targetAudienceId: 'swedish' }
];

const normalizeAgeGroupRow = (row) => {
  const sortOrder = Number(row.sort_order);
  const minAge = row.min_age === null || row.min_age === undefined ? null : Number(row.min_age);
  const maxAge = row.max_age === null || row.max_age === undefined ? null : Number(row.max_age);
  return {
    id: row.id,
    label: row.label,
    description: row.description || '',
    prompt: row.prompt || '',
    minAge: Number.isFinite(minAge) ? minAge : null,
    maxAge: Number.isFinite(maxAge) ? maxAge : null,
    isActive: row.is_active === 1 || row.is_active === true || row.is_active === '1',
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    updatedAt: row.updated_at || null
  };
};

const normalizeTargetAudienceRow = (row) => {
  const sortOrder = Number(row.sort_order);
  return {
    id: row.id,
    label: row.label,
    description: row.description || '',
    prompt: row.prompt || '',
    isActive: row.is_active === 1 || row.is_active === true || row.is_active === '1',
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    updatedAt: row.updated_at || null
  };
};

export const ensureAudienceTables = async (db) => {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS age_groups (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT,
      prompt TEXT,
      min_age INTEGER,
      max_age INTEGER,
      is_active BOOLEAN DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS target_audiences (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT,
      prompt TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS age_group_targets (
      age_group_id TEXT NOT NULL,
      target_audience_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (age_group_id, target_audience_id)
    )
  `).run();

  await seedDefaultAudiences(db);
};

export const seedDefaultAudiences = async (db) => {
  const now = Date.now();
  const getCount = async (tableName) => {
    const result = await db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).first();
    return Number(result?.count || 0);
  };

  if (await getCount('age_groups') === 0) {
    for (const group of DEFAULT_AGE_GROUPS) {
      await db.prepare(`
        INSERT INTO age_groups (
          id, label, description, prompt, min_age, max_age, is_active, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        group.id,
        group.label,
        group.description,
        group.prompt,
        group.minAge,
        group.maxAge,
        1,
        group.sortOrder || 0,
        now,
        now
      ).run();
    }
  }

  if (await getCount('target_audiences') === 0) {
    for (const audience of DEFAULT_TARGET_AUDIENCES) {
      await db.prepare(`
        INSERT INTO target_audiences (
          id, label, description, prompt, is_active, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        audience.id,
        audience.label,
        audience.description,
        audience.prompt,
        1,
        audience.sortOrder || 0,
        now,
        now
      ).run();
    }
  }

  if (await getCount('age_group_targets') === 0) {
    for (const mapping of DEFAULT_AGE_GROUP_TARGETS) {
      await db.prepare(`
        INSERT INTO age_group_targets (
          age_group_id, target_audience_id, created_at
        ) VALUES (?, ?, ?)
      `).bind(
        mapping.ageGroupId,
        mapping.targetAudienceId,
        now
      ).run();
    }
  }
};

export const listAgeGroups = async (db, { includeInactive = false } = {}) => {
  await ensureAudienceTables(db);
  const statement = includeInactive
    ? db.prepare(`
        SELECT id, label, description, prompt, min_age, max_age, is_active, sort_order, updated_at
        FROM age_groups
        ORDER BY sort_order ASC, label COLLATE NOCASE ASC
      `)
    : db.prepare(`
        SELECT id, label, description, prompt, min_age, max_age, is_active, sort_order, updated_at
        FROM age_groups
        WHERE is_active = 1
        ORDER BY sort_order ASC, label COLLATE NOCASE ASC
      `);
  const result = await statement.all();
  return (result.results || []).map(normalizeAgeGroupRow);
};

export const listTargetAudiences = async (db, { includeInactive = false } = {}) => {
  await ensureAudienceTables(db);
  const statement = includeInactive
    ? db.prepare(`
        SELECT id, label, description, prompt, is_active, sort_order, updated_at
        FROM target_audiences
        ORDER BY sort_order ASC, label COLLATE NOCASE ASC
      `)
    : db.prepare(`
        SELECT id, label, description, prompt, is_active, sort_order, updated_at
        FROM target_audiences
        WHERE is_active = 1
        ORDER BY sort_order ASC, label COLLATE NOCASE ASC
      `);
  const result = await statement.all();
  return (result.results || []).map(normalizeTargetAudienceRow);
};

export const listAgeGroupTargets = async (db, { includeInactive = false } = {}) => {
  await ensureAudienceTables(db);

  const statement = includeInactive
    ? db.prepare(`
        SELECT age_group_id, target_audience_id
        FROM age_group_targets
      `)
    : db.prepare(`
        SELECT age_group_id, target_audience_id
        FROM age_group_targets
        WHERE age_group_id IN (SELECT id FROM age_groups WHERE is_active = 1)
          AND target_audience_id IN (SELECT id FROM target_audiences WHERE is_active = 1)
      `);

  const result = await statement.all();
  return (result.results || []).map((row) => ({
    ageGroupId: row.age_group_id,
    targetAudienceId: row.target_audience_id
  }));
};

export const getAgeGroupById = async (db, id) => {
  if (!id) return null;
  await ensureAudienceTables(db);
  const row = await db.prepare(`
    SELECT id, label, description, prompt, min_age, max_age, is_active, sort_order, updated_at
    FROM age_groups
    WHERE lower(id) = lower(?)
  `).bind(id).first();
  if (!row) return null;
  return normalizeAgeGroupRow(row);
};

export const getTargetAudiencesForAgeGroup = async (db, ageGroupId) => {
  if (!ageGroupId) return [];
  await ensureAudienceTables(db);
  const result = await db.prepare(`
    SELECT ta.id
    FROM age_group_targets agt
    JOIN age_groups ag ON ag.id = agt.age_group_id
    JOIN target_audiences ta ON ta.id = agt.target_audience_id
    WHERE lower(agt.age_group_id) = lower(?)
      AND ag.is_active = 1
      AND ta.is_active = 1
    ORDER BY ta.sort_order ASC, ta.label COLLATE NOCASE ASC
  `).bind(ageGroupId).all();
  return (result.results || []).map((row) => row.id);
};

export const getTargetAudienceDetailsForAgeGroup = async (db, ageGroupId) => {
  if (!ageGroupId) return [];
  await ensureAudienceTables(db);
  const result = await db.prepare(`
    SELECT ta.id, ta.label, ta.description, ta.prompt, ta.is_active, ta.sort_order, ta.updated_at
    FROM age_group_targets agt
    JOIN age_groups ag ON ag.id = agt.age_group_id
    JOIN target_audiences ta ON ta.id = agt.target_audience_id
    WHERE lower(agt.age_group_id) = lower(?)
      AND ag.is_active = 1
      AND ta.is_active = 1
    ORDER BY ta.sort_order ASC, ta.label COLLATE NOCASE ASC
  `).bind(ageGroupId).all();
  return (result.results || []).map(normalizeTargetAudienceRow);
};

export const renameAgeGroupInQuestions = async (db, oldId, newId) => {
  if (!oldId || !newId || oldId === newId) return;
  const likePattern = `%\"${oldId.replace(/\"/g, '""')}\"%`;
  const rows = await db.prepare(`
    SELECT id, age_groups
    FROM questions
    WHERE age_groups LIKE ?
  `).bind(likePattern).all();

  const now = Date.now();
  for (const row of rows.results || []) {
    if (!row.age_groups) continue;
    let groups;
    try {
      groups = JSON.parse(row.age_groups);
    } catch (error) {
      continue;
    }
    if (!Array.isArray(groups)) continue;
    if (!groups.includes(oldId)) continue;

    const updated = groups.map((value) => (value === oldId ? newId : value));
    await db.prepare(`
      UPDATE questions
      SET age_groups = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      JSON.stringify(updated),
      now,
      row.id
    ).run();
  }
};

export const renameTargetAudienceInQuestions = async (db, oldId, newId) => {
  if (!oldId || !newId || oldId === newId) return;
  await db.prepare(`
    UPDATE questions
    SET target_audience = ?, updated_at = ?
    WHERE lower(target_audience) = lower(?)
  `).bind(
    newId,
    Date.now(),
    oldId
  ).run();
};

export { DEFAULT_AGE_GROUPS, DEFAULT_TARGET_AUDIENCES };
