CREATE TABLE IF NOT EXISTS categories (
  name TEXT PRIMARY KEY,
  description TEXT,
  prompt TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

INSERT OR IGNORE INTO categories (
  name, description, prompt, is_active, sort_order, created_at, updated_at
) VALUES
  (
    'Geografi',
    'Platser, länder, kartor och naturgeografi.',
    'Variera mellan Sverige, Norden och världen. Inkludera huvudstäder, landskap, naturgeografi och kartkunskap utan att bli för nischad.',
    1,
    10,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'Historia',
    'Historiska händelser, personer och epoker.',
    'Fokusera på viktiga epoker, händelser och personer. Blanda svensk och global historia och undvik alltför obskyra årtal.',
    1,
    20,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'Naturvetenskap',
    'Fysik, kemi, biologi och rymd.',
    'Håll frågorna vardagsnära och pedagogiska. Blanda fysik, kemi, biologi och rymd utan avancerad matematik.',
    1,
    30,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'Kultur',
    'Film, musik, litteratur, konst och traditioner.',
    'Variera mellan svensk och internationell kultur. Använd både klassiska och samtida exempel inom film, musik, litteratur och konst.',
    1,
    40,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'Sport',
    'Sporter, regler, stjärnor och mästerskap.',
    'Ställ frågor om regler, kända idrottare, klubbar och stora mästerskap. Blanda svenska och internationella sporter.',
    1,
    50,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'Natur',
    'Ekosystem, väder, växter och naturfenomen.',
    'Fokusera på ekosystem, växter, djur, väder och naturfenomen. Använd gärna exempel från nordisk natur.',
    1,
    60,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'Teknik',
    'Teknikhistoria, prylar och digitalt.',
    'Ta upp uppfinningar, vardagsteknik och digitala fenomen. Håll nivån begriplig utan djup teknisk teori.',
    1,
    70,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'Djur',
    'Djurarter, beteenden och livsmiljöer.',
    'Variera mellan husdjur, vilda djur och havsdjur. Fokusera på beteenden, livsmiljöer och fascinerande fakta.',
    1,
    80,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'Gåtor',
    'Logik, kluringar och problemlösning.',
    'Skapa tydliga logikfrågor och kluringar med rimliga svarsalternativ. Undvik dubbeltydigheter.',
    1,
    90,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  );
