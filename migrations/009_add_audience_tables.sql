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
);

CREATE TABLE IF NOT EXISTS target_audiences (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS age_group_targets (
  age_group_id TEXT NOT NULL,
  target_audience_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (age_group_id, target_audience_id)
);

INSERT OR IGNORE INTO age_groups (
  id, label, description, prompt, min_age, max_age, is_active, sort_order, created_at, updated_at
) VALUES
  (
    'children',
    'Barn',
    '6-12 år',
    'Kortare frågor, tydliga ledtrådar och vardagsnära exempel.',
    6,
    12,
    1,
    10,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'youth',
    'Ungdom',
    '13-17 år',
    'Lite mer utmanande frågor, men undvik alltför nischade fakta.',
    13,
    17,
    1,
    20,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'adults',
    'Vuxen',
    '18+ år',
    'Djupare resonemang och mer variation i svårighetsgrad.',
    18,
    NULL,
    1,
    30,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  );

INSERT OR IGNORE INTO target_audiences (
  id, label, description, prompt, is_active, sort_order, created_at, updated_at
) VALUES
  (
    'swedish',
    'Svensk',
    'Svensk kontext och referenser.',
    'Fokusera på svensk kultur, historia och geografi när det är relevant.',
    1,
    10,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'english',
    'Engelsk',
    'Engelskspråkig målgrupp.',
    'Håll frågorna neutrala och internationellt begripliga.',
    1,
    20,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'international',
    'Internationell',
    'Global målgrupp.',
    'Fokusera på global kunskap och internationella perspektiv.',
    1,
    30,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'global',
    'Global',
    'Global målgrupp (synonym till internationell).',
    'Fokusera på global kunskap och internationella perspektiv.',
    1,
    40,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'german',
    'Tysk',
    'Tysk målgrupp.',
    'Anpassa exempel till tyskt sammanhang när relevant.',
    1,
    50,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'norwegian',
    'Norsk',
    'Norsk målgrupp.',
    'Anpassa exempel till norsk kontext när relevant.',
    1,
    60,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'danish',
    'Dansk',
    'Dansk målgrupp.',
    'Anpassa exempel till dansk kontext när relevant.',
    1,
    70,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  );

INSERT OR IGNORE INTO age_group_targets (
  age_group_id, target_audience_id, created_at
) VALUES
  ('children', 'swedish', strftime('%s','now') * 1000),
  ('youth', 'swedish', strftime('%s','now') * 1000),
  ('adults', 'swedish', strftime('%s','now') * 1000);
