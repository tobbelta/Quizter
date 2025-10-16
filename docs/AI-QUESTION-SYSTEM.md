# AI-Powered Question Generation & Validation System

Detta dokument beskriver GeoQuests AI-drivna system för frågegenerering, validering och kvalitetskontroll.

## Översikt

Systemet består av tre huvudkomponenter:
1. **AI-generering** - Automatisk generering av quizfrågor med flera AI-providers
2. **AI-validering** - Kvalitetskontroll av frågor med flera AI-providers
3. **Dublettkontroll** - Automatisk detektering av duplicerade frågor

## Innehållsförteckning

- [AI-Providers](#ai-providers)
- [Frågegenerering](#frågegenerering)
- [Frågevalidering](#frågevalidering)
- [Dublettkontroll](#dublettkontroll)
- [Bakgrundsjobb & Progress](#bakgrundsjobb--progress)
- [Frågekategorisering](#frågekategorisering)
- [Migration & Schema](#migration--schema)
- [API-endpoints](#api-endpoints)
- [Filstruktur](#filstruktur)

---

## AI-Providers

Systemet stödjer tre AI-providers med fallback-logik:

### 1. Anthropic Claude (Primär)
- **Modell**: `claude-3-5-haiku-20241022`
- **Användning**: Generering och validering
- **Fördelar**: Snabb, kostnadseffektiv, hög kvalitet
- **Fil**: `functions/services/aiQuestionGenerator.js`

### 2. OpenAI GPT-4 (Fallback)
- **Modell**: `gpt-4o-mini`
- **Användning**: Generering och validering
- **Fördelar**: Pålitlig, vältestad
- **Fil**: `functions/services/openaiQuestionGenerator.js`

### 3. Google Gemini (Fallback)
- **Modell**: `gemini-1.5-flash-002` (eller tillgänglig modell)
- **Användning**: Generering och validering
- **Fördelar**: Gratis tier tillgänglig
- **Fil**: `functions/services/geminiQuestionGenerator.js`

### Provider-prioritering

Vid generering:
```
1. Anthropic Claude (om tillgänglig)
2. OpenAI GPT-4 (om Claude inte tillgänglig)
3. Google Gemini (om varken Claude eller OpenAI tillgänglig)
```

Vid validering används **ALLA** tillgängliga providers parallellt för bättre kvalitetskontroll.

### Konfiguration & tillgänglighet

- Superuser kan aktivera/inaktivera varje provider per ändamål via vyn `/superuser/ai-providers`. Inställningarna sparas i `aiProviderSettings/config`.
- Systemet gör en snabb hälsokoll mot varje API och cache:ar resultatet (60 sekunder) för att undvika onödigt många externa anrop.
- Bakgrundsjobb för migrering använder endast providers som både är aktiverade för migration och passerar hälsokollen (dvs. rapporteras som `available`).

### Kontrollera AI-status

```javascript
GET https://europe-west1-geoquest2-7e45c.cloudfunctions.net/getAIStatus
```

Returnerar:
```json
{
  "available": true,
  "primaryProvider": "anthropic",
  "providers": {
    "anthropic": {
      "configured": true,
      "available": true,
      "model": "claude-3-5-haiku-20241022"
    },
    "openai": { ... },
    "gemini": { ... }
  },
  "message": "AI-generering tillgänglig (Anthropic Claude)"
}
```

---

## Frågegenerering

### Manuell generering

Användare kan generera frågor via Admin UI med följande parametrar:

- **Amount**: 1-50 frågor
- **Category**: Valfri kategori (Geografi, Historia, etc.)
- **Age Group**: children, youth, adults eller blandad
- **Provider**: anthropic, openai, gemini eller random

### Automatisk generering

Schemalagd funktion (`questionImport`) körs var 6:e timme och genererar 20 nya frågor:

```javascript
// functions/index.js (sök efter "exports.questionImport")
exports.questionImport = onSchedule({
  schedule: "every 6 hours",
  region: "europe-west1",
  secrets: [anthropicApiKey, openaiApiKey, geminiApiKey]
}, async (event) => {
  // Genererar 20 frågor i batchar om 5 med olika providers
  // Blandar providers för variation
  // Sparar frågor efter dublettkontroll
});
```

### Genererings-flöde

```
1. [API Call] generateAIQuestions
   ↓
2. [Enqueue] Background task skapas
   ↓
3. [Processing] runaigeneration körs
   ↓
4. [AI Generation] Provider genererar frågor
   ↓
5. [Validation] Dublettkontroll körs
   ↓
6. [Import] Frågor sparas till Firestore
   ↓
7. [Complete] Resultat och statistik returneras (`result.svg.generated|failed|skipped`, `validation`, m.m.)
```

> **Illustrationer:** Standardflödet skapar SVG:er via Anthropic Claude (Haiku). Motiven måste bestå av flera grafiska element (ingen text, inga siffror, inga frågetecken) och vi sanerar resultatet så att varken frågetext eller svarsalternativ förekommer i SVG-koden. Om API-nyckeln saknas hoppar systemet över illustreringssteget men redovisar det som `svg.skipped` i resultatet.
> **Emoji:** Emoji-generering ska aldrig avslöja eller peka ut det korrekta svaret. Välj neutrala symboler som stödjer frågans tema utan att ge bort lösningen.

### Progress-rapportering

Genereringsjobbet rapporterar progress i realtid:

**Faser:**
1. **Initierar** - Förbereder AI-generering
2. **Genererar frågor** - Använder [provider]...
3. **Validerar frågor** - Kontrollerar dubletter
4. **Sparar frågor** - X frågor till databasen (Y dubletter blockerade)
5. **Klar** - X frågor importerade (Y dubletter blockerade)

**Progress-objekt:**
```javascript
{
  phase: "Sparar frågor",
  completed: 8,
  total: 10,
  details: "Sparar 8 frågor till databasen (2 dubletter blockerade)...",
  updatedAt: Timestamp
}
```

### Frågeformat

Genererade frågor följer detta schema:

```javascript
{
  id: "auto-generated-uuid",
  question: {
    sv: "Frågetext på svenska"
  },
  options: {
    sv: ["Alternativ 1", "Alternativ 2", "Alternativ 3", "Alternativ 4"]
  },
  correctOption: 0, // Index 0-3
  explanation: {
    sv: "Förklaring av svaret"
  },
  ageGroups: ["children", "youth", "adults"], // Kan vara flera
  categories: ["Geografi", "Historia"], // Kan vara flera
  targetAudience: "swedish",
  source: "ai-generated",
  createdAt: Timestamp
}
```

---

## Frågevalidering

### Single Question Validation

Validerar en enskild fråga med alla tillgängliga AI-providers:

```javascript
// Via questionService (rekommenderat för AdminQuestionsPage)
await questionService.validateSingleQuestion(questionId);

// Direkt via aiService
POST https://europe-west1-geoquest2-7e45c.cloudfunctions.net/validateQuestionWithAI

Body:
{
  "question": "Frågetext",
  "options": ["Alt 1", "Alt 2", "Alt 3", "Alt 4"],
  "correctOption": 0,
  "explanation": "Förklaring"
}
```

### Batch Validation

Validerar flera frågor parallellt:

```javascript
// Via questionService (rekommenderat för AdminQuestionsPage)
await questionService.batchValidateQuestions(questionIds);

// Direkt via aiService
POST https://europe-west1-geoquest2-7e45c.cloudfunctions.net/batchValidateQuestions

Body:
{
  "questions": [
    {
      "id": "question-id-1",
      "question": "...",
      "options": [...],
      "correctOption": 0,
      "explanation": "..."
    },
    // ... fler frågor
  ]
}
```

### Validerings-kriterier

AI-validatorer kontrollerar:

1. ✅ **Faktakontroll** - Är svaret korrekt?
2. ✅ **Svårighetsgrad** - Passar frågan målgruppen?
3. ✅ **Svenska språket** - Är grammatiken korrekt?
4. ✅ **Alternativ** - Är alla alternativ rimliga?
5. ✅ **Förklaring** - Är förklaringen tydlig och korrekt?
6. ✅ **Målgrupp** - Passar innehållet åldersgruppen?

**Strukturvalidering:** Under importen måste varje fråga ange `ageGroups` (children/youth/adults), minst en kategori samt en `targetAudience` (t.ex. `swedish`). Frågan måste ha **minst ett komplett språk** (antingen `languages.sv` eller `languages.en`) med text, fyra svarsalternativ och en förklaring. Båda språk krävs inte längre. Detta ersätter den tidigare kontrollen av `difficulty` och `audience`.

### Validerings-resultat

```javascript
{
  valid: true, // eller false (baserat på majoritet)
  consensus: {
    valid: 2,        // Antal providers som godkänner
    invalid: 1,      // Antal providers som underkänner
    total: 3,        // Totalt antal providers
    method: 'majority'
  },
  issues: [], // Lista med problem från providers som underkänner
  reasoning: "**Anthropic:** Frågan är korrekt...\n\n**Gemini:** Bra fråga...",
  providerResults: {
    anthropic: { valid: true, reasoning: "..." },
    openai: { valid: true, reasoning: "..." },
    gemini: { valid: false, reasoning: "...", issues: ["..."] }
  },
  providersChecked: 3,
  suggestedCorrectOption: 2 // Om AI hittar fel i correctOption (valfritt)
}
```

### Multi-Provider Consensus

Validering använder alla tillgängliga providers med **majoritetsbased konsensus**:

- Om **majoriteten godkänner** → Frågan är giltig ✅
- Om **majoriteten underkänner** → Frågan är ogiltig ❌
- Vid **lika röstfördelning** → Frågan underkänns (säkerhetsprincip) ⚠️

Exempel:
- **2 godkänner, 1 underkänner** → Giltig ✅ (2/3 majoritet)
- **1 godkänner, 2 underkänner** → Ogiltig ❌ (2/3 majoritet)
- **1 godkänner, 1 underkänner** → Ogiltig ❌ (lika, säkerhetsprincip)

### Admin-flikar för validering

- **Frågebank → Validering:** kör strukturvalideringen lokalt i webbläsaren. Panelen visar nu en progressindikator och markerar varje ogiltig fråga igen (även om den redan tidigare har kontrollerats).
- **Frågebank → AI-Validering:** skapar ett batchjobb via Cloud Tasks. En ny växlare låter superuser välja om även redan AI-validerade frågor ska skickas om ("Validera om alla"). Jobbet följer samma bakgrundsflöde som tidigare och resultaten sparas tillbaka på frågorna.
- **Frågebankens frågekort:** har återigen en knapp för enskild AI-validering (`AI-validera`). Den köar `validateQuestionWithAI`, registrerar bakgrundsjobbet och skriver resultatet via `questionService.markAsValidated/markAsInvalid`.
- Frågelistans filter stödjer nu de migrerade fälten (`categories`, `ageGroups`, `targetAudience`) och sökningen matchar även ID, kategorier och målgrupper.

### Visuell validering-status

**Implementerat 2025-10-16:**
- ✅ **Enskild validering tracking** - Varje frågekort visar "⏳ AI-validering pågår..." när enskild validering körs
- ✅ **Batch validering status** - Batch-validering markerar alla berörda frågor som "under validering" med gul ram och pulse-animation
- ✅ **Realtime progress** - Lyssnar på Firestore background tasks för att visa aktuell status
- ✅ **Loading states** - Knappar inaktiveras och visar loading-text under validering
- ✅ **Visuell feedback** - Frågekortet får gul ram, pulse-animation och status-indikator

**Funktionalitet:**
```javascript
// State för att spåra validering
const [validatingQuestions, setValidatingQuestions] = useState(new Set());
const [batchValidatingAll, setBatchValidatingAll] = useState(false);

// Enskild validering
const handleValidationStart = (questionId) => {
  setValidatingQuestions(prev => new Set([...prev, questionId]));
};

// Batch validering med Firestore listener
useEffect(() => {
  const unsubscribe = onSnapshot(
    query(collection(db, 'backgroundTasks'), where('type', '==', 'batchvalidation')),
    (snapshot) => {
      // Uppdatera validating questions baserat på task progress
    }
  );
  return unsubscribe;
}, []);
```

**UI-förbättringar:**
- 🔄 Frågekortet visar "AI-validering pågår..." med spinner
- 🔄 Gul ram och pulse-animation under validering
- 🔄 Batch-status panel visar "X frågor kvar att validera"
- 🔄 Knappar inaktiveras automatiskt under validering

### Statusuppdatering

**Implementerat**
- ✅ Enskild AI-validering direkt på frågekortet i `AdminQuestionsPage.js`
- ✅ Använder Cloud Functions (`validateQuestionWithAI`) och markerar resultat via `questionService.markAsValidated/markAsInvalid`
- ✅ Batchvalidering via Cloud Tasks med progressrapportering
- ✅ Strukturvalidering i webbläsaren innan AI-validering
- ✅ Dublettkontroll vid import med Levenshtein-distans
- ✅ **Majoritetsbased konsensus** - Frågor godkänns om majoriteten av providers säger ja
- ✅ **Flexibel språkvalidering** - Frågor kan ha antingen svenska eller engelska (eller båda)

**Förbättringar (2025-01-13)**
- 🔧 Multi-provider-konsensus använder nu majoritet istället för unanimitet
- 🔧 Strukturvalidering kräver endast ett komplett språk (inte båda)
- 🔧 Validerings-resultat inkluderar nu `consensus`-objekt med röstfördelning

---

## Dublettkontroll

Systemet använder Levenshtein-distans för att hitta dubletter.

### Algoritm

```javascript
// functions/services/questionImportService.js:63-77

const duplicates = findDuplicates(allQuestions, "sv", 0.85);

// 0.85 = 85% likhet krävs för att räknas som dublett
// Jämför både frågetext och svarsalternativ
```

### När körs dublettkontroll?

1. **Vid AI-generering** - Automatiskt innan import
2. **Vid manuell import** - Kontrollerar mot befintliga frågor
3. **Vid batch-validering** - Hittar dubletter inom batch:en

### Dublett-hantering

```javascript
{
  totalIncoming: 10,      // Antal genererade frågor
  duplicatesBlocked: 2,   // Antal blockerade dubletter
  invalidCount: 0,        // Antal ogiltiga frågor
  imported: 8             // Antal importerade frågor
}
```

Dubletter sparas **ALDRIG** - de filtreras bort innan import.

### Exempel på progress med dubletter

```
Progress-detaljer: "Sparar 8 frågor till databasen (2 dubletter blockerade)..."
Slutstatus: "8 frågor importerade (2 dubletter blockerade)"
```

---

## Bakgrundsjobb & Progress

Alla AI-operationer körs som bakgrundsjobb för att inte blockera UI.

### Task-typer

1. **generation** - AI-generering av frågor
2. **validation** - Validering av en fråga
3. **batchvalidation** - Validering av flera frågor
4. **batchregenerateemojis** - Mass-generering av emojis för valda frågor

### Task-status

```
pending → queued → processing → completed/failed/cancelled
```

### Progress-tracking

#### Generation Progress
```javascript
{
  phase: "Genererar frågor",
  completed: 5,
  total: 10,
  details: "Använder anthropic...",
  updatedAt: Timestamp
}
```

#### Batch Validation Progress
```javascript
{
  total: 50,
  completed: 25,
  validated: 20,
  failed: 5,
  updatedAt: Timestamp
}
```

### Realtids-uppdatering

Frontend lyssnar på Firestore-ändringar:

```javascript
// src/views/SuperUserTasksPage.js
useEffect(() => {
  const unsubscribe = onSnapshot(
    query(collection(db, 'backgroundTasks'), orderBy('createdAt', 'desc')),
    (snapshot) => {
      const tasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTasks(tasks);
    }
  );
  return unsubscribe;
}, []);
```

### UI Progress-visning

```jsx
{/* Progress bar för generering */}
{task.progress?.phase && (
  <div className="mt-2 space-y-1">
    <div className="font-semibold text-cyan-200">
      {task.progress.phase}
    </div>
    {task.progress.total > 0 && (
      <div className="w-full bg-slate-700 rounded-full h-2">
        <div
          className="bg-cyan-500 h-full transition-all duration-300"
          style={{ width: `${(task.progress.completed / task.progress.total) * 100}%` }}
        />
      </div>
    )}
    <div className="text-xs text-slate-400">
      {task.progress.details}
    </div>
  </div>
)}
```

---

## Frågekategorisering

### AI-driven kategorisering

Systemet använder AI för att automatiskt kategorisera frågor.

#### Åldersgrupper (Age Groups)

- **children** (6-12 år) - Enkla frågor om vardagliga saker
- **youth** (13-25 år) - Sociala medier, modern teknik, populärkultur
- **adults** (25+ år) - Komplexa frågor om historia, samhälle, vetenskap

En fråga kan tillhöra **flera** åldersgrupper!

#### Kategorier

```javascript
[
  'Geografi', 'Historia', 'Naturvetenskap', 'Kultur', 'Sport', 'Natur',
  'Teknik', 'Djur', 'Gåtor', 'YouTube', 'TikTok', 'Instagram', 'Snapchat',
  'Threads', 'Bluesky', 'Facebook', 'Idrott'
]
```

En fråga kan tillhöra **flera** kategorier!

#### Kategoriserings-tjänst

```javascript
// functions/services/aiQuestionCategorizer.js

const { categorizeQuestion } = require('./services/aiQuestionCategorizer');

const result = await categorizeQuestion({
  question: "Vilken svensk fotbollsspelare är mest följd på Instagram?",
  options: ["Zlatan Ibrahimović", "Victor Lindelöf", "Emil Forsberg", "Alexander Isak"],
  explanation: "Zlatan har över 60 miljoner följare på Instagram."
}, anthropicApiKey);

// Result:
{
  ageGroups: ["youth", "adults"],
  categories: ["Sport", "Instagram", "Idrott"],
  reasoning: "Frågan handlar om fotboll och sociala medier, passar ungdomar och vuxna"
}
```

---

## Migration & Schema

### Schema-migration (Old → New)

Gamla frågor använde ett enklare schema som migrerats med AI.

#### Gammalt schema
```javascript
{
  difficulty: "family",  // Singel-värde
  category: "Sport",     // Singel-värde
  audience: "family"     // Singel-värde
}
```

#### Nytt schema
```javascript
{
  ageGroups: ["children", "youth", "adults"],  // Array, AI-bestämd
  categories: ["Sport", "Instagram"],          // Array, AI-bestämd
  targetAudience: "swedish",                   // Alltid "swedish"
  migrated: true,                              // Migration-flagga
  migratedAt: Timestamp,                       // Migration-tidsstämpel
  migrationReasoning: "AI:s resonemang..."     // AI:s förklaring
}
```

### Köra migration

```bash
# Migrera alla frågor med AI-kategorisering
curl https://europe-west1-geoquest2-7e45c.cloudfunctions.net/migrateQuestionsToNewSchema
```

### Migration-process

1. Hämtar alla frågor från Firestore
2. Skippar redan migrerade frågor
3. Använder AI för att kategorisera varje fråga
4. Sparar nya fält och tar bort gamla
5. Markerar frågor som `migrated: true`
6. Sparar AI:s resonemang i `migrationReasoning`

### Visa migrerade frågor

Migrerade frågor visas med en badge i Admin UI:

```jsx
{question.migrated === true && (
  <span className="bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 text-xs">
    🔄 Migrerad
  </span>
)}
```

---

## API-endpoints

### Generering

#### POST /generateAIQuestions
Köar en AI-genereringsjobb.

**Request:**
```json
{
  "amount": 10,
  "category": "Geografi",
  "ageGroup": "youth",
  "provider": "anthropic"
}
```

**Response:**
```json
{
  "success": true,
  "taskId": "task-id-123",
  "message": "Question generation has been queued."
}
```

#### GET /getAIStatus
Kontrollerar AI-providers status.

**Response:**
```json
{
  "available": true,
  "primaryProvider": "anthropic",
  "providers": { ... }
}
```

### Validering

#### POST /validateQuestionWithAI
Validerar en enskild fråga.

#### POST /batchValidateQuestions
Validerar flera frågor.

### Background Tasks

#### POST /stopTask
Stoppar ett pågående jobb.

```json
{
  "taskId": "task-id-123"
}
```

#### POST /deleteTask
Raderar ett jobb.

#### POST /bulkStopTasks
Stoppar flera jobb samtidigt.

#### POST /bulkDeleteTasks
Raderar flera jobb samtidigt.

### Underhåll

#### GET /cleanupStuckTasks
Rensar upp fastnade jobb (>30 min gamla).

#### GET /deleteOldTasks?hours=24
Raderar gamla completed/failed jobb.

### Migration

#### GET /migrateQuestionsToNewSchema
Migrerar alla frågor till nytt schema med AI.

---

## Filstruktur

```
functions/
├── index.js                          # Huvudfil med alla Cloud Functions
├── services/
│   ├── aiQuestionGenerator.js        # Anthropic generering
│   ├── openaiQuestionGenerator.js    # OpenAI generering
│   ├── geminiQuestionGenerator.js    # Gemini generering
│   ├── aiQuestionValidator.js        # Anthropic validering
│   ├── openaiQuestionValidator.js    # OpenAI validering
│   ├── geminiQuestionValidator.js    # Gemini validering
│   ├── aiQuestionCategorizer.js      # AI-kategorisering (Anthropic)
│   ├── openaiQuestionCategorizer.js  # AI-kategorisering (OpenAI)
│   ├── geminiQuestionCategorizer.js  # AI-kategorisering (Gemini)
│   ├── aiSvgGenerator.js             # SVG-illustrationer (Anthropic)
│   ├── openaiSvgGenerator.js         # SVG-illustrationer (OpenAI)
│   ├── geminiSvgGenerator.js         # SVG-illustrationer (Gemini)
│   ├── questionImportService.js      # Dublettkontroll & import
│   └── questionValidation.js         # Strukturvalidering

src/
├── views/
│   ├── AdminQuestionsPage.js         # Frågehantering UI (uppdaterad med validering-tracking)
│   ├── SuperUserTasksPage.js         # Bakgrundsjobb UI
│   └── CreateRunPage.js              # Skapa tipspromenad
├── services/
│   ├── questionService.js            # Frontend question service (utökad med validateSingleQuestion)
│   ├── questionValidationService.js  # Validering & dublettkontroll
│   └── aiService.js                  # AI-kommunikation
├── components/
│   └── admin/
│       └── AIValidationPanel.js      # AI-validering UI
└── context/
    └── BackgroundTaskContext.js      # Background task state management

docs/
└── AI-QUESTION-SYSTEM.md             # Detta dokument
```

---

## Sammanfattning

### Styrkor
- ✅ Multi-provider fallback (hög tillgänglighet)
- ✅ Automatisk dublettkontroll (ingen duplicering)
- ✅ AI-driven kvalitetskontroll (hög kvalitet)
- ✅ Realtids progress-rapportering (bra UX)
- ✅ Flexibel kategorisering (flera åldersgrupper & kategorier)
- ✅ Automatisk schemalagd import (kontinuerlig tillförsel)

### Förbättringsmöjligheter
- 🔄 Lägg till fler AI-providers (ex. Mistral, Cohere)
- 🔄 Implementera question rating system
- 🔄 Lägg till A/B-testning av frågor
- 🔄 Implementera användarfeedback-loop
- 🔄 Cache AI-svar för kostnadsoptimering

---

## Förslag på fler Question Providers

### 1. **Mistral AI** ⭐ (Rekommenderad)
**Varför:**
- Europeiskt företag (bra för GDPR)
- Snabba och kostnadseffektiva modeller
- Gratis tier tillgänglig
- Bra på flerspråkighet (perfekt för svenska)

**Implementation:**
```javascript
// functions/services/mistralQuestionGenerator.js
const Mistral = require('@mistralai/mistralai');

async function generateQuestions(params, apiKey) {
  const client = new Mistral({ apiKey });

  const response = await client.chat({
    model: 'mistral-small-latest', // eller 'open-mistral-7b' för gratis tier
    messages: [{
      role: 'user',
      content: systemPrompt + userPrompt
    }]
  });

  return parseQuestions(response.choices[0].message.content);
}
```

**API-nyckel:** https://console.mistral.ai/

---

### 2. **Cohere** ⭐
**Varför:**
- Specialiserad på text-generering
- Bra gratis tier (100 API-anrop/månad)
- Lättanvänd API
- Bra multi-språk-support

**Implementation:**
```javascript
// functions/services/cohereQuestionGenerator.js
const { CohereClient } = require('cohere-ai');

async function generateQuestions(params, apiKey) {
  const cohere = new CohereClient({ token: apiKey });

  const response = await cohere.chat({
    model: 'command-r', // eller 'command-r-plus' för bättre kvalitet
    message: userPrompt,
    preamble: systemPrompt
  });

  return parseQuestions(response.text);
}
```

**API-nyckel:** https://dashboard.cohere.com/

---

### 3. **Together AI** (Budget-alternativ)
**Varför:**
- Kör open-source modeller (Llama 3, Mixtral, etc.)
- Mycket billigare än stora providers
- Flexibilitet att välja olika modeller
- Bra för experiment

**Implementation:**
```javascript
// functions/services/togetherQuestionGenerator.js
const Together = require('together-ai');

async function generateQuestions(params, apiKey) {
  const together = new Together({ apiKey });

  const response = await together.chat.completions.create({
    model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    messages: [{
      role: 'system',
      content: systemPrompt
    }, {
      role: 'user',
      content: userPrompt
    }]
  });

  return parseQuestions(response.choices[0].message.content);
}
```

**API-nyckel:** https://together.ai/

---

### 4. **Azure OpenAI** (Enterprise-alternativ)
**Varför:**
- Samma modeller som OpenAI men via Azure
- Bättre för företag (SLA, support, säkerhet)
- EU-baserade datacenters (GDPR)
- Bättre rate limits

**Implementation:**
```javascript
// functions/services/azureQuestionGenerator.js
const { AzureOpenAI } = require('@azure/openai');

async function generateQuestions(params, apiKey) {
  const client = new AzureOpenAI({
    apiKey: apiKey,
    endpoint: 'https://your-resource.openai.azure.com',
    apiVersion: '2024-02-15-preview',
    deployment: 'gpt-4o-mini'
  });

  const response = await client.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });

  return parseQuestions(response.choices[0].message.content);
}
```

**Setup:** https://portal.azure.com/

---

### 5. **Perplexity AI** (Faktakontroll)
**Varför:**
- Specialiserad på fakta och källhänvisningar
- Kan verifiera svar automatiskt
- Bra för frågor som kräver aktuell information
- Har tillgång till internetsökning

**Implementation:**
```javascript
// functions/services/perplexityQuestionValidator.js
const fetch = require('node-fetch');

async function validateQuestion(questionData, apiKey) {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-sonar-small-128k-online',
      messages: [{
        role: 'user',
        content: validationPrompt
      }]
    })
  });

  const data = await response.json();
  return parseValidation(data.choices[0].message.content);
}
```

**API-nyckel:** https://www.perplexity.ai/settings/api

---

### Provider-jämförelse

| Provider | Kostnad | Hastighet | Kvalitet | Svenska | Specialitet |
|----------|---------|-----------|----------|---------|-------------|
| **Anthropic** | $$$ | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Generering |
| **OpenAI** | $$$$ | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Allround |
| **Gemini** | $ | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ | ⭐⭐⭐ | Gratis tier |
| **Mistral** | $$ | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Europa/GDPR |
| **Cohere** | $$ | ⚡⚡⚡ | ⭐⭐⭐⭐ | ⭐⭐⭐ | Text-gen |
| **Together** | $ | ⚡⚡⚡ | ⭐⭐⭐ | ⭐⭐⭐ | Budget |
| **Azure** | $$$ | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Enterprise |
| **Perplexity** | $$ | ⚡⚡ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Faktakontroll |

### Rekommendation

För GeoQuest rekommenderas att lägga till:

1. **Mistral AI** - Som ny primär provider för svenska frågor
2. **Perplexity** - För extra faktakontroll vid validering
3. **Together AI** - Som budget-alternativ för experiment

Detta ger:
- ✅ Bättre svenska-support (Mistral)
- ✅ Automatisk faktakontroll (Perplexity)
- ✅ Lägre kostnader (Together)
- ✅ Högre tillgänglighet (fler providers)

---

## Köra runonce-funktioner

### Migration till nytt schema

**URL:**
```
https://europe-west1-geoquest2-7e45c.cloudfunctions.net/migrateQuestionsToNewSchema
```

**Beskrivning:** Migrerar (eller migrerar om) alla befintliga frågor med AI-kategorisering och illustration. Funktionens version 2 (`migrationVersion: "v2-reprocess"`) rensar legacy-fälten (`difficulty`, `category`, `audience`), sätter `ageGroups`, `categories`, `targetAudience` och genererar en ny SVG för varje fråga. Systemet väljer slumpmässigt bland de providers som är aktiverade under *Migration* i Superuser/AI-provider-inställningen (Anthropic, OpenAI, Gemini) och försöker nästa provider om den första misslyckas. Säker att köra flera gånger – befintliga frågor uppdateras med senaste metadata och en färsk illustration.

**Hur du kör:**
```bash
# I webbläsaren eller via curl
curl https://europe-west1-geoquest2-7e45c.cloudfunctions.net/migrateQuestionsToNewSchema

# Eller öppna direkt i webbläsaren
start https://europe-west1-geoquest2-7e45c.cloudfunctions.net/migrateQuestionsToNewSchema
```

**Resultat:**
```json
{
  "message": "Questions migrated successfully with AI categorization",
  "migrated": 152,
  "svgGenerated": 145,
  "svgFailed": 7,
  "previouslyMigrated": 48,
  "failed": 3,
  "total": 203,
  "details": {
    "method": "AI-powered categorization and illustration using configured providers",
    "ageGroupsIdentified": "AI analyzed each question to determine suitable age groups",
    "categoriesIdentified": "AI analyzed each question to determine relevant categories",
    "svgIllustrations": "AI generated SVG illustrations for each question (failed handled gracefully)",
    "targetAudience": "Set to swedish for all questions",
    "removedFields": "difficulty, category, audience",
    "providers": ["anthropic", "openai", "gemini"]
  }
}
```

Efter körning visas de nya fälten (ageGroups, kategorier, targetAudience) samt en nedskalad SVG-förhandsvisning direkt i Admin-frågebanken så att redaktörer enkelt kan kvalitetssäkra resultatet.

---

### Uppdatera createdAt-fält

**URL:**
```
https://europe-west1-geoquest2-7e45c.cloudfunctions.net/updateQuestionsCreatedAt
```

**Beskrivning:** Lägger till `createdAt`-fält på alla frågor som saknar det. Använder `generatedAt` om det finns, annars nuvarande tidsstämpel.

**Hur du kör:**
```bash
# I webbläsaren eller via curl
curl https://europe-west1-geoquest2-7e45c.cloudfunctions.net/updateQuestionsCreatedAt

# Eller öppna direkt i webbläsaren
start https://europe-west1-geoquest2-7e45c.cloudfunctions.net/updateQuestionsCreatedAt
```

**Resultat:**
```json
{
  "message": "Questions updated successfully",
  "updated": 180,
  "alreadyHad": 22,
  "total": 202
}
```

---

### Rensa fastnade bakgrundsjobb

**URL:**
```
https://europe-west1-geoquest2-7e45c.cloudfunctions.net/cleanupStuckTasks
```

**Beskrivning:** Hittar och markerar jobb som fastnat som `failed`. Batch-jobb får 3 timmar, övriga jobb får 30 minuter.

**Hur du kör:**
```bash
curl https://europe-west1-geoquest2-7e45c.cloudfunctions.net/cleanupStuckTasks

# Eller i webbläsaren
start https://europe-west1-geoquest2-7e45c.cloudfunctions.net/cleanupStuckTasks
```

**Resultat:**
```json
{
  "message": "Cleanup completed successfully",
  "cleaned": 5,
  "processingChecked": 10,
  "queuedChecked": 3
}
```

---

### Radera gamla bakgrundsjobb

**URL:**
```
https://europe-west1-geoquest2-7e45c.cloudfunctions.net/deleteOldTasks?hours=24
```

**Beskrivning:** Raderar completed och failed jobb äldre än X timmar (default: 24 timmar).

**Hur du kör:**
```bash
# Radera jobb äldre än 24 timmar
curl https://europe-west1-geoquest2-7e45c.cloudfunctions.net/deleteOldTasks

# Radera jobb äldre än 48 timmar
curl https://europe-west1-geoquest2-7e45c.cloudfunctions.net/deleteOldTasks?hours=48

# Eller i webbläsaren
start "https://europe-west1-geoquest2-7e45c.cloudfunctions.net/deleteOldTasks?hours=24"
```

**Resultat:**
```json
{
  "message": "Old tasks deleted successfully",
  "deleted": 45,
  "completedDeleted": 40,
  "failedDeleted": 5,
  "hoursOld": 24
}
```

---

### Samtliga runonce-funktioner

| Funktion | URL | Beskrivning |
|----------|-----|-------------|
| **migrateQuestionsToNewSchema** | `/migrateQuestionsToNewSchema` | Migrera frågor till nytt schema med AI |
| **updateQuestionsCreatedAt** | `/updateQuestionsCreatedAt` | Lägg till createdAt-fält på frågor |
| **cleanupStuckTasks** | `/cleanupStuckTasks` | Rensa fastnade bakgrundsjobb |
| **deleteOldTasks** | `/deleteOldTasks?hours=24` | Radera gamla completed/failed jobb |

**Fullständiga URL:er:**
```
https://europe-west1-geoquest2-7e45c.cloudfunctions.net/[funktionsnamn]
```

**Tips:**
- Kör dessa funktioner vid behov, inte regelbundet
- `cleanupStuckTasks` kan köras automatiskt via Cloud Scheduler om du vill
- `deleteOldTasks` är bra att köra manuellt för att städa databasen
- `migrateQuestionsToNewSchema` kan köras vid varje större schema- eller illustrationsändring – v2 kör om alla frågor och uppdaterar både metadata och SVG
- `updateQuestionsCreatedAt` behövde bara köras en gång (redan klart)

---

## Kända fel och åtgärdade problem

### Åtgärdade fel (2025-01-13)

Följande fel från QA-listan är nu åtgärdade:
- Schemalagd import kör numera både dublettkontroll och AI-validering innan frågor sparas.
- Superuser kan välja vilka AI-providers som används för SVG-generering direkt i samma panel som övriga ändamål.
- SVG-genereringen har fått uppdaterade promptar och krav så att illustrationerna blir tydligare och mer relevanta.
- Valideringsdatumet i frågebanken läses nu från rätt fält och visas alltid med svensk datumformattering.
- Frågebanken visar även när illustrationerna genererades och vilken provider som användes.

#### ✅ Kritiskt fel: Batchvalidering visar 0 godkända frågor
**Problem:** Efter batchvalidering visades 0 godkända frågor trots att valideringen rapporterade framgång.

**Orsak:** Frågor sparades inte omedelbart under valideringsloopen – endast i minnet. När frontend-komponenten hämtade frågor fanns inga uppdaterade resultat.

**Lösning:** Lagt till `await questionService.markAsValidated(questionId, validationData)` direkt i valideringsloopen i `batchValidateQuestions` (functions/index.js). Varje fråga sparas nu synkront till Firestore innan nästa validering startar.

**Status:** ✅ Löst 2025-01-13

---

#### ✅ Fel 1: Schemalagd import kör inte AI-validering
**Problem:** Den schemalagda importen (`questionImport` som körs var 6:e timme) körde endast dublettkontroll men ingen AI-validering på de importerade frågorna.

**Orsak:** Import-funktionen saknade logik för att köa AI-validering efter lyckad import.

**Lösning:** Lagt till automatisk AI-validering efter import är klar. När `questionImport` har sparat frågor till Firestore köas nu ett batch-valideringsjobb via Cloud Tasks med taskId-spårning. Detta säkerställer att schemalagda frågor får samma kvalitetskontroll som manuellt genererade frågor.

**Status:** ✅ Löst 2025-01-13

---

#### ✅ Fel 2: SVG-providers kan inte väljas i superuser-läge
**Problem:** Superuser-inställningarna saknade möjlighet att konfigurera vilka AI-providers som ska användas för SVG-illustration-generering. Systemet använde hårdkodade providers eller migration-providers.

**Orsak:** Provider-konfigurationen hade endast tre ändamål definierade: `generation`, `validation` och `migration`. Illustration-generering delade providers med migration vilket inte var optimalt.

**Lösning:**
- Lagt till nytt ändamål `illustration` i provider-inställningar (både frontend och backend)
- Uppdaterat `AIProviderSettingsPage.js` med nytt avsnitt för illustration-providers (🎨)
- Uppdaterat `getProvidersForPurpose()` i functions/index.js för att returnera illustration-providers
- Uppdaterat alla SVG-genererings-anrop att använda `getProvidersForPurpose('illustration')` istället för hårdkodade eller migration-providers
- Detta gäller: AI-generering (aiGenerateQuestions), migration (migrateQuestionsToNewSchema) och regenerering (regenerateQuestionIllustration)

**Filer som ändrades:**
- `functions/index.js` (line 493-514, 781-796, 1250-1300, 2324-2337, 2795-2807, 681-691)
- `src/views/AIProviderSettingsPage.js` (line 34-38, 143-148)

**Status:** ✅ Löst 2025-01-13

---

#### ✅ Fel 3: SVG-generering behöver förbättras (mer illustrativ)
**Problem:** Genererade SVG-illustrationer var svåra att koppla till frågorna. Illustrationerna var för abstrakta och inte tillräckligt specifika för frågeinnehållet.

**Orsak:** AI-prompten var inte tillräckligt tydlig om att illustrationerna måste vara direkt relevanta och specifika för frågeinnehållet.

**Lösning:**
- Omskrivet system-prompt och user-prompt i alla tre SVG-generatorer
- Lagt till tydliga instruktioner: "Om frågan handlar om ett djur → rita djuret (inte bara en abstrakt siluett)"
- Ökat komplexitetskrav från 3-5 element till 5-10 element för mer detaljerade illustrationer
- Ökat färgpalett från 3-5 till 3-6 harmoniska färger
- Lagt till konkreta exempel på vad "tydlig" illustration innebär
- Ökat max_tokens från 2000 till 3000 för mer detaljerade SVG:er
- Ökat temperature från 0.6 till 0.7 för mer kreativ variation

**Filer som ändrades:**
- `functions/services/aiSvgGenerator.js` (line 59-82, 93-101, 106-110)
- `functions/services/openaiSvgGenerator.js` (samma ändringar)
- `functions/services/geminiSvgGenerator.js` (samma ändringar)

**Status:** ✅ Löst 2025-01-13

---

#### ✅ Fel 4: Valideringsdatum visas felaktigt
**Problem:** Valideringsdatum (`aiValidatedAt`, `manuallyApprovedAt`, `manuallyRejectedAt`) visades felaktigt i frågebanken eftersom Firestore Timestamps inte konverterades korrekt.

**Orsak:** Firestore returnerar Timestamp-objekt som har en `.toDate()`-metod, men koden anropade `.toLocaleString()` direkt på Timestamp-objektet.

**Lösning:**
- Lagt till villkorskontroll för `.toDate()` innan `.toLocaleString()` anropas
- Implementerat fallback för vanliga JavaScript Date-objekt
- Format: `timestamp.toDate ? timestamp.toDate().toLocaleString('sv-SE') : new Date(timestamp).toLocaleString('sv-SE')`

**Filer som ändrades:**
- `src/views/AdminQuestionsPage.js` (line 203-220)

**Status:** ✅ Löst 2025-01-13

---

#### ✅ Fel 5: Saknar datum för illustration-generering
**Problem:** Det fanns ingen synlig information om när en illustration genererades eller vilken provider som användes.

**Orsak:** Systemet sparade inte `illustrationGeneratedAt` eller `illustrationProvider` när SVG:er genererades.

**Lösning:**
- Lagt till `illustrationGeneratedAt` (serverTimestamp) när SVG genereras
- Lagt till `illustrationProvider` (provider.name) för spårning av vilken AI som användes
- Uppdaterat alla tre SVG-genererings-punkter: AI-generering, migration och regenerering
- Uppdaterat AdminQuestionsPage att visa generation-datum och provider i illustration-sektionen

**Filer som ändrades:**
- `functions/index.js` (line 1285-1293, 706-713, 2471, 2949)
- `src/views/AdminQuestionsPage.js` (line 367-381)

**Status:** ✅ Löst 2025-01-13

---

## Kontakt

För frågor om systemet, kontakta utvecklingsteamet eller läs koden i:
- `functions/index.js`
- `functions/services/`

*Senast uppdaterad: 2025-01-13*
id klick på knappen "🎨 Nya emojis" på ett frågekort kraschade applikationen med ett `TypeError`.

**Orsak:** Koden i `questionService.js` anropade en funktion (`regenerateQuestionIllustration`) som inte existerade i `aiService.js`. Namngivningen av funktioner och variabler var också missvisande (använde "illustration" istället för "emoji").

**Lösning:**
- Funktionen i `questionService.js` döptes om från `regenerateIllustration` till `regenerateEmoji` för tydlighet.
- Anropet i `regenerateEmoji` pekar nu på den korrekta funktionen `aiService.regenerateQuestionEmoji`.
- Frontend-komponenten `AdminQuestionsPage.js` har uppdaterats för att använda de nya, tydligare funktions- och variabelnamnen.

**Status:** ✅ Löst 2025-10-14

---

*Senast uppdaterad: 2025-10-14*
