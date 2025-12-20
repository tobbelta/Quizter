const DEFAULT_CATEGORIES = [
  {
    name: 'Geografi',
    description: 'Platser, länder, kartor och naturgeografi.',
    prompt: 'Variera mellan Sverige, Norden och världen. Inkludera huvudstäder, landskap, naturgeografi och kartkunskap utan att bli för nischad.',
    sortOrder: 10
  },
  {
    name: 'Historia',
    description: 'Historiska händelser, personer och epoker.',
    prompt: 'Fokusera på viktiga epoker, händelser och personer. Blanda svensk och global historia och undvik alltför obskyra årtal.',
    sortOrder: 20
  },
  {
    name: 'Naturvetenskap',
    description: 'Fysik, kemi, biologi och rymd.',
    prompt: 'Håll frågorna vardagsnära och pedagogiska. Blanda fysik, kemi, biologi och rymd utan avancerad matematik.',
    sortOrder: 30
  },
  {
    name: 'Kultur',
    description: 'Film, musik, litteratur, konst och traditioner.',
    prompt: 'Variera mellan svensk och internationell kultur. Använd både klassiska och samtida exempel inom film, musik, litteratur och konst.',
    sortOrder: 40
  },
  {
    name: 'Sport',
    description: 'Sporter, regler, stjärnor och mästerskap.',
    prompt: 'Ställ frågor om regler, kända idrottare, klubbar och stora mästerskap. Blanda svenska och internationella sporter.',
    sortOrder: 50
  },
  {
    name: 'Natur',
    description: 'Ekosystem, väder, växter och naturfenomen.',
    prompt: 'Fokusera på ekosystem, växter, djur, väder och naturfenomen. Använd gärna exempel från nordisk natur.',
    sortOrder: 60
  },
  {
    name: 'Teknik',
    description: 'Teknikhistoria, prylar och digitalt.',
    prompt: 'Ta upp uppfinningar, vardagsteknik och digitala fenomen. Håll nivån begriplig utan djup teknisk teori.',
    sortOrder: 70
  },
  {
    name: 'Djur',
    description: 'Djurarter, beteenden och livsmiljöer.',
    prompt: 'Variera mellan husdjur, vilda djur och havsdjur. Fokusera på beteenden, livsmiljöer och fascinerande fakta.',
    sortOrder: 80
  },
  {
    name: 'Gåtor',
    description: 'Logik, kluringar och problemlösning.',
    prompt: 'Skapa tydliga logikfrågor och kluringar med rimliga svarsalternativ. Undvik dubbeltydigheter.',
    sortOrder: 90
  }
];

const normalizeCategoryRow = (row) => {
  const parsedSortOrder = Number(row.sort_order);
  return {
    name: row.name,
    description: row.description || '',
    prompt: row.prompt || '',
    isActive: row.is_active === 1 || row.is_active === true || row.is_active === '1',
    sortOrder: Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0,
    updatedAt: row.updated_at || null
  };
};

export const ensureCategoriesTable = async (db) => {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS categories (
      name TEXT PRIMARY KEY,
      description TEXT,
      prompt TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    )
  `).run();

  await seedDefaultCategories(db);
};

export const seedDefaultCategories = async (db) => {
  const now = Date.now();
  for (const category of DEFAULT_CATEGORIES) {
    await db.prepare(`
      INSERT OR IGNORE INTO categories (
        name, description, prompt, is_active, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      category.name,
      category.description,
      category.prompt,
      1,
      category.sortOrder || 0,
      now,
      now
    ).run();
  }
};

export const listCategories = async (db, { includeInactive = false } = {}) => {
  await ensureCategoriesTable(db);
  const statement = includeInactive
    ? db.prepare(`
        SELECT name, description, prompt, is_active, sort_order, updated_at
        FROM categories
        ORDER BY sort_order ASC, name COLLATE NOCASE ASC
      `)
    : db.prepare(`
        SELECT name, description, prompt, is_active, sort_order, updated_at
        FROM categories
        WHERE is_active = 1
        ORDER BY sort_order ASC, name COLLATE NOCASE ASC
      `);

  const result = await statement.all();
  return (result.results || []).map(normalizeCategoryRow);
};

export const getCategoryByName = async (db, name) => {
  if (!name) return null;
  await ensureCategoriesTable(db);
  const row = await db.prepare(`
    SELECT name, description, prompt, is_active, sort_order, updated_at
    FROM categories
    WHERE lower(name) = lower(?)
  `).bind(name).first();

  if (!row) return null;
  return normalizeCategoryRow(row);
};

export const renameCategoryInQuestions = async (db, oldName, newName) => {
  if (!oldName || !newName || oldName === newName) return;

  const likePattern = `%\"${oldName.replace(/\"/g, '""')}\"%`;
  const rows = await db.prepare(`
    SELECT id, categories
    FROM questions
    WHERE categories LIKE ?
  `).bind(likePattern).all();

  const now = Date.now();
  for (const row of rows.results || []) {
    if (!row.categories) continue;
    let categories;
    try {
      categories = JSON.parse(row.categories);
    } catch (error) {
      continue;
    }
    if (!Array.isArray(categories)) continue;
    if (!categories.includes(oldName)) continue;

    const updated = categories.map((category) => (category === oldName ? newName : category));
    await db.prepare(`
      UPDATE questions
      SET categories = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      JSON.stringify(updated),
      now,
      row.id
    ).run();
  }
};

export { DEFAULT_CATEGORIES };
