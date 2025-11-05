# Database Migrations

## Hur man kör migrationer

### För produktion (Cloudflare D1):

```bash
# Kör en specifik migration
npx wrangler d1 execute DB --remote --file=migrations/004_update_background_tasks_table.sql

# Verifiera att kolumnerna finns
npx wrangler d1 execute DB --remote --command="PRAGMA table_info(background_tasks);"
```

### För lokal utveckling:

```bash
# Kör en specifik migration lokalt
npx wrangler d1 execute DB --local --file=migrations/004_update_background_tasks_table.sql

# Verifiera
npx wrangler d1 execute DB --local --command="PRAGMA table_info(background_tasks);"
```

## Migration 004 - Background Tasks Schema Update

**Status:** 🔴 **INTE KÖR ÄNNU**

**När köra:** Kör denna migration när du vill ha full funktionalitet för:
- Task payload storage (sparar originalparametrar)
- Error messages (detaljerade felmeddelanden)
- Finished timestamp (exakt tid när task blev klar)

**Vad händer:**
- Lägger till `payload` kolumn (TEXT) - Lagrar JSON med taskens parametrar
- Lägger till `error` kolumn (TEXT) - Lagrar felmeddelanden
- Lägger till `finished_at` kolumn (INTEGER) - Lagrar slutdatum (ersätter completed_at)

**Backward compatibility:**
Koden är just nu bakåtkompatibel och fungerar MED OCH UTAN denna migration:
- ✅ **FÖRE migration:** Använder `description`, `completed_at`, ignorerar `payload`/`error`
- ✅ **EFTER migration:** Använder `payload`, `error`, `finished_at` för rikare data

**Så här kör du:**

1. **Testa lokalt först:**
   ```bash
   npx wrangler d1 execute DB --local --file=migrations/004_update_background_tasks_table.sql
   ```

2. **Kör på produktion:**
   ```bash
   npx wrangler d1 execute DB --remote --file=migrations/004_update_background_tasks_table.sql
   ```

3. **Uppdatera koden för att använda nya kolumner:**
   När migrationen är klar kan vi aktivera full funktionalitet genom att:
   - Använda `payload` istället för `description` i INSERT
   - Använda `finished_at` istället för `completed_at`
   - Spara `error` direkt i egen kolumn

## Rollback

Om något går fel med migration 004:

```sql
-- Ta bort nya kolumner
ALTER TABLE background_tasks DROP COLUMN payload;
ALTER TABLE background_tasks DROP COLUMN error;
ALTER TABLE background_tasks DROP COLUMN finished_at;
```

⚠️ **OBS:** SQLite stödjer inte DROP COLUMN i alla versioner. Om det misslyckas:

```sql
-- Skapa ny tabell utan de nya kolumnerna
CREATE TABLE background_tasks_backup AS 
SELECT id, user_id, task_type, status, label, description, 
       progress, total, result, created_at, updated_at, completed_at
FROM background_tasks;

-- Radera gamla tabellen
DROP TABLE background_tasks;

-- Byt namn på backup
ALTER TABLE background_tasks_backup RENAME TO background_tasks;
```

## Migration History

- **001**: Initial schema (users, questions, etc.)
- **002**: Background tasks table - första versionen
- **003**: Add indexes for performance
- **004**: 🔴 **PENDING** - Add payload, error, finished_at columns

## Nästa migration

När migration 004 är kör och verifierad kan vi:
1. Ta bort backward compatibility-kod
2. Använda `payload` för att visa task-parametrar i UI
3. Visa detaljerade felmeddelanden från `error` kolumnen
4. Använda `finished_at` för exakt timing
