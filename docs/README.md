# Quizter Documentation

Komplett dokumentation för Quizter-projektet.

## 📚 Tillgänglig Dokumentation

### System Architecture

#### [BACKGROUND_TASK_SYSTEM.md](BACKGROUND_TASK_SYSTEM.md) ⭐
**Status**: ✅ Aktuell och komplett

Omfattande dokumentation av det event-drivna background task systemet.

**Innehåll:**
- Arkitektur med Cloudflare D1 och Server-Sent Events (SSE)
- API endpoints (`/api/generateAIQuestions`, `/api/subscribeToTask`, etc.)
- Frontend services (`backgroundTaskService.js`, `taskService.js`)
- React Context (`BackgroundTaskContext.js`)
- Komplett task flow (5 steg från user initiering till completion)
- Event types (update, complete, error, timeout)
- Best practices för backend och frontend
- Troubleshooting guide
- Future improvements

**Läs denna när du:**
- Behöver förstå hur background tasks fungerar
- Implementerar nya AI-operationer
- Debuggar task-relaterade problem
- Vill förbättra eller utöka task-systemet

---

#### [D1_DATABASE_SETUP.md](D1_DATABASE_SETUP.md) ⭐
**Status**: ✅ Aktuell

Guide för att konfigurera Cloudflare D1 databaser.

**Innehåll:**
- Production database (`quizter-db`)
- Preview database (`quizter-db-preview`)
- Cloudflare Dashboard konfiguration
- D1 bindings (Production vs Preview)
- Database schema
- Migration commands

**Läs denna när du:**
- Sätter upp projektet första gången
- Behöver köra migrations
- Debuggar databas-relaterade problem
- Lägger till nya databas-bindings

---

#### [AI_QUESTION_GENERATION.md](AI_QUESTION_GENERATION.md) ⭐
**Status**: ✅ Aktuell och komplett

Komplett guide för AI-driven frågegenerering och kategorisering.

**Innehåll:**
- 4 AI-providers (OpenAI, Gemini, Anthropic, Mistral)
- Åldersgrupper: children (6-12), youth (13-25), adults (25+)
- Kategorier: Geografi, Historia, Sport, Sociala Medier, etc.
- Frågeformat och schema
- AI-kategorisering och resonemang
- API request/response examples
- Progress tracking & background tasks
- Best practices & troubleshooting

**Läs denna när du:**
- Behöver förstå hur frågor genereras
- Vill veta hur åldersgrupper och kategorier fungerar
- Implementerar ny frågegenerering
- Debuggar AI-relaterade problem
- Lägger till nya kategorier eller providers

---

### Scripts

#### [scripts/README.md](../scripts/README.md)
**Status**: ⚠️ Partiellt relevant

Dokumentation av utility scripts.

**Innehåll:**
- `bump-version.js` - Versionshantering (SemVer)

**Notera:** 
- Versionshantering med GitHub Actions är inte implementerad för Cloudflare-projektet
- `bump-version.js` är från Firebase-eran och kan behöva uppdateras

---

## 🗑️ Raderade Dokument

Följande dokument har raderats eftersom de refererade till den gamla Firebase/RouteQuest-arkitekturen:

### Arkitektur & Planering
- ❌ `ACTION_PLAN.md` - RouteQuest Firebase implementation plan
- ❌ `AGENT.md` - RouteQuest agent guide (Firebase)
- ❌ `TECHNICAL_ANALYSIS.md` - RouteQuest teknisk analys (Firebase)
- ❌ `TIPSPROMENAD_ARCHITECTURE.md` - RouteQuest arkitektur (Firebase)
- ❌ `codex_agent.md` - Codex AI-genererad Firebase sammanfattning

### Backend & Deployment
- ❌ `docs/BACKEND_STRATEGI.md` - Firebase/Firestore strategi
- ❌ `docs/RELEASE_CHECKLIST.md` - Firebase deployment checklist
- ❌ `GUIDE-AUTOMATISK-DEPLOY.md` - Firebase deployment guide
- ❌ `docs/VERSIONSHANTERING.md` - Firebase versionshantering

### Features
- ❌ `docs/AI-QUESTION-SYSTEM.md` - Firebase Cloud Functions AI-system
- ❌ `docs/BACKGROUND_LOCATION_TRACKING.md` - GPS tracking för tipspromenader
- ❌ `docs/NATIVE_BUILD_GUIDE.md` - Capacitor native builds

### Refactoring
- ❌ `REFACTORING_SUMMARY.md` - functions/index.js refactoring (Firebase)

**Varför raderade?**
- Alla referenser till Firebase/Google Cloud (som projektet migrerat bort från)
- RouteQuest-specifik funktionalitet (GPS tipspromenader)
- Föråldrade deployment-strategier
- Inte relevant för nuvarande Cloudflare-arkitektur

---

## 📖 Hur man Använder Dokumentationen

### För Nya Utvecklare

1. **Börja med huvuddokumentationen**
   - Läs [README.md](../README.md) i projektets rot för översikt

2. **Förstå arkitekturen**
   - Läs [BACKGROUND_TASK_SYSTEM.md](BACKGROUND_TASK_SYSTEM.md) för background tasks
   - Läs [D1_DATABASE_SETUP.md](D1_DATABASE_SETUP.md) för database setup

3. **Sätt upp utvecklingsmiljö**
   - Följ instruktionerna i [README.md](../README.md)
   - Kör migrations från [D1_DATABASE_SETUP.md](D1_DATABASE_SETUP.md)

### För Befintliga Utvecklare

**När du behöver:**
- Implementera ny AI-funktion → [BACKGROUND_TASK_SYSTEM.md](BACKGROUND_TASK_SYSTEM.md)
- Lägga till ny tabell → [D1_DATABASE_SETUP.md](D1_DATABASE_SETUP.md)
- Debugga task-problem → [BACKGROUND_TASK_SYSTEM.md](BACKGROUND_TASK_SYSTEM.md) Troubleshooting
- Konfigurera ny environment → [D1_DATABASE_SETUP.md](D1_DATABASE_SETUP.md)

---

## 🔄 Uppdatera Dokumentationen

**Principer:**
- ✅ Håll dokumentationen uppdaterad när du gör ändringar
- ✅ Radera föråldrad dokumentation direkt
- ✅ Markera status (✅ Aktuell, ⚠️ Partiellt relevant, ❌ Föråldrad)
- ✅ Lägg till nya dokument i detta index

**Format:**
```markdown
#### [DOKUMENT_NAMN.md](DOKUMENT_NAMN.md) ⭐
**Status**: ✅ Aktuell

Kort beskrivning.

**Innehåll:**
- Punkt 1
- Punkt 2

**Läs denna när du:**
- Use case 1
- Use case 2
```

---

## 📝 Contributing

När du lägger till ny dokumentation:

1. Skapa filen i `/docs/`
2. Uppdatera detta index med länk och beskrivning
3. Lägg till relevant status-emoji (⭐ för viktig dokumentation)
4. Inkludera "Läs denna när du:"-sektion

---

**Senast uppdaterad:** 2025-01-XX
**Dokumenterade system:** Cloudflare Pages + D1 + SSE Architecture
