# Cloudflare D1 Database Setup

## Databaser

Vi har två D1-databaser:

1. **Production** (`quizter-db`): `8b90c5aa-c172-469f-b852-3662b7a717bf`
   - Används av: `main` branch (https://quizter.pages.dev)
   
2. **Preview** (`quizter-db-preview`): `f0c0f1b9-9955-4f99-bd49-965249967fec`
   - Används av: alla andra branches (feature/staging branches)

## Konfiguration i Cloudflare Dashboard

För att preview-branches ska använda sin egen databas:

1. Gå till [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Välj **Workers & Pages**
3. Välj **quizter** project
4. Gå till **Settings** > **Functions**
5. Under **D1 database bindings**:
   - **Production environment**: 
     - Variable name: `DB`
     - D1 Database: `quizter-db`
   - **Preview environment**:
     - Variable name: `DB`
     - D1 Database: `quizter-db-preview`

## Database Schema

Båda databaserna använder samma schema. Kör detta SQL för att skapa tabeller:

```sql
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  question_sv TEXT NOT NULL,
  options_sv TEXT NOT NULL,
  options_en TEXT,
  correct_option INTEGER NOT NULL,
  explanation_sv TEXT,
  explanation_en TEXT,
  age_groups TEXT,
  categories TEXT,
  difficulty TEXT,
  audience TEXT,
  target_audience TEXT,
  illustration_emoji TEXT,
  ai_generation_provider TEXT,
  illustration_generated_at INTEGER,
  validated BOOLEAN DEFAULT FALSE,
  ai_validation_result TEXT,
  validation_generated_at INTEGER,
  manually_approved BOOLEAN DEFAULT FALSE,
  manually_rejected BOOLEAN DEFAULT FALSE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  created_by TEXT
);
```

### Köra migrations

**Production:**
```bash
npx wrangler d1 execute quizter-db --remote --file=migrations/001_create_questions_table.sql
```

**Preview:**
```bash
npx wrangler d1 execute quizter-db-preview --remote --file=migrations/001_create_questions_table.sql
```

## Nuvarande Status

✅ Production databas (`quizter-db`): Tabell skapad
✅ Preview databas (`quizter-db-preview`): Tabell skapad
⚠️ Dashboard bindings: Behöver konfigureras manuellt (se steg ovan)

## Viktigt

- **wrangler.toml** konfigurerar endast production-databasen
- **Preview bindings** måste sättas via Cloudflare Dashboard
- Detta beror på att Cloudflare Pages inte stödjer environment-specifika bindings i wrangler.toml
