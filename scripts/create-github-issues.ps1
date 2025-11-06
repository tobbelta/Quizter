# Script för att skapa GitHub issues från AI Question Generation kravspec
# Kör detta script från root-mappen i projektet

$repo = "tobbelta/Quizter"

Write-Host "🚀 Skapar GitHub issues för AI Question Generation..." -ForegroundColor Cyan
Write-Host ""

# Kontrollera att gh är inloggad
Write-Host "📋 Kontrollerar GitHub CLI autentisering..." -ForegroundColor Yellow
$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Du måste logga in med GitHub CLI först!" -ForegroundColor Red
    Write-Host "   Kör: gh auth login" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ GitHub CLI är autentiserad" -ForegroundColor Green
Write-Host ""

# === MILESTONE 1: MVP - Basic Question Generation ===
Write-Host "📦 Skapar Milestone 1: MVP - Basic Question Generation..." -ForegroundColor Magenta

# Epic 1: Core Question Generation System
Write-Host "  📋 Epic #1: Core Question Generation System" -ForegroundColor Cyan

gh issue create --repo $repo --title "[EPIC] Core Question Generation System" --label "epic,backend,priority-critical" --body @"
## 📋 Epic: Core Question Generation System

Implementera grundläggande systemet för AI-driven frågegenerering.

### 🎯 Mål
- Integrera 4 AI-providers (OpenAI, Gemini, Anthropic, Mistral)
- Generera frågor i både svenska och engelska
- Klassificera frågor efter åldersgrupp och kategorier
- Background task system för asynkron generering

### 📚 Relaterad Dokumentation
- [AI_QUESTION_GENERATION.md](docs/AI_QUESTION_GENERATION.md)
- [BACKGROUND_TASK_SYSTEM.md](docs/BACKGROUND_TASK_SYSTEM.md)

### ✅ Sub-tasks
- [ ] #SUB1 - Setup AI Provider Integration
- [ ] #SUB2 - Implement Question Generation API
- [ ] #SUB3 - Add Dual-language Support
- [ ] #SUB4 - Implement Age Group & Category Classification

### 🎯 Definition of Done
- [ ] Alla 4 providers integrerade och testade
- [ ] API endpoint `/api/generateAIQuestions` fungerar
- [ ] Frågor genereras på både svenska och engelska
- [ ] Age groups och kategorier sätts korrekt
- [ ] Background tasks fungerar med SSE progress
"@

Write-Host "  ✅ Epic #1 skapad" -ForegroundColor Green

gh issue create --repo $repo --title "Setup AI Provider Integration (OpenAI, Gemini, Anthropic, Mistral)" --label "feature,backend,priority-critical" --body @"
## 🎯 Beskrivning
Integrera alla 4 AI-providers för frågegenerering och validering.

### 📋 Tekniska Detaljer

**Providers att integrera:**
1. **OpenAI GPT-4o-mini** - \`gpt-4o-mini\`
2. **Google Gemini** - \`gemini-1.5-flash\`
3. **Anthropic Claude** - \`claude-3-5-sonnet-20241022\`
4. **Mistral** - \`mistral-small-latest\`

**Random Provider:**
- Implementera logik för att välja random provider vid generering
- Valideringsproviders väljs deterministiskt (inte random igen)

### 🔑 API Keys
Lägg till i Cloudflare Secrets:
- \`OPENAI_API_KEY\`
- \`GEMINI_API_KEY\`
- \`ANTHROPIC_API_KEY\`
- \`MISTRAL_API_KEY\`

### ✅ Acceptance Criteria
- [ ] Alla 4 providers kan användas för generering
- [ ] Random provider-val fungerar
- [ ] Provider-taggning sparas (\`ai_generation_provider\`)
- [ ] Error handling för alla providers
- [ ] Rate limiting hanterat

### 📚 Dokumentation
Se [AI_QUESTION_GENERATION.md - AI Providers](docs/AI_QUESTION_GENERATION.md#ai-providers)
"@

Write-Host "    ✅ Issue: AI Provider Integration" -ForegroundColor Green

gh issue create --repo $repo --title "Implement Question Generation API with Background Tasks" --label "feature,backend,priority-critical" --body @"
## 🎯 Beskrivning
Skapa API endpoint för frågegenerering med background task system och SSE progress.

### 📋 API Endpoint

\`\`\`javascript
POST /api/generateAIQuestions

Request:
{
  "amount": 10,              // 1-50 frågor
  "category": "Historia",    // Från kategorilistan
  "ageGroup": "youth",       // children, youth, adults (kan vara flera)
  "difficulty": "medium",    // easy, medium, hard (optional)
  "provider": "openai",      // openai, gemini, anthropic, mistral, random
  "generateIllustrations": true  // default: true
}

Response:
{
  "success": true,
  "taskId": "task_1730000000_abc123",
  "message": "AI question generation started"
}
\`\`\`

### 🔄 Progress Phases
1. **10%** - Preparing AI request
2. **30%** - Generating questions with [provider]
3. **50%** - Validating questions (AI validation)
4. **70%** - Saving to database
5. **85%** - Generating illustrations (X/Y completed)
6. **100%** - Complete

### 📡 SSE Endpoint
\`GET /api/subscribeToTask?taskId=...\`

### ✅ Acceptance Criteria
- [ ] POST endpoint fungerar med alla parametrar
- [ ] Background task startar korrekt
- [ ] SSE ger real-time progress updates
- [ ] TaskId returneras omedelbart
- [ ] Errors hanteras och loggas
- [ ] Timeout efter 5 minuter

### 📚 Dokumentation
Se [BACKGROUND_TASK_SYSTEM.md](docs/BACKGROUND_TASK_SYSTEM.md)
"@

Write-Host "    ✅ Issue: Question Generation API" -ForegroundColor Green

gh issue create --repo $repo --title "Add Dual-language Support (Swedish + English)" --label "feature,backend,priority-critical" --body @"
## 🎯 Beskrivning
Implementera automatisk generering av frågor i både svenska OCH engelska.

### 📋 Krav
**Alla frågor MÅSTE ha:**
- \`question_sv\` / \`question_en\`
- \`options_sv\` / \`options_en\` (4 alternativ vardera)
- \`explanation_sv\` / \`explanation_en\`

**Viktigt:**
- Samma \`correct_option\` index (0-3) för båda språken
- Båda språkversionerna genereras samtidigt
- Om någon version saknas → blockera auto-godkännande

### 🎯 Target Audience
- **Children/Adults:** \`target_audience: "swedish"\` (svensk fokus)
- **Youth:** \`target_audience: "global"\` (global fokus)
- **Flera åldersgrupper:** Children/Adults övertrumfar Youth

### ✅ Acceptance Criteria
- [ ] AI-prompt inkluderar krav på båda språken
- [ ] Validering att båda språkversioner finns
- [ ] \`target_audience\` sätts korrekt baserat på åldersgrupp
- [ ] Error om någon språkversion saknas
- [ ] Båda språkversionerna sparas i databas

### 📚 Dokumentation
Se [AI_QUESTION_GENERATION.md - Språk och Inriktning](docs/AI_QUESTION_GENERATION.md#språk-och-inriktning)
"@

Write-Host "    ✅ Issue: Dual-language Support" -ForegroundColor Green

gh issue create --repo $repo --title "Implement Age Group & Category Classification" --label "feature,backend,priority-high" --body @"
## 🎯 Beskrivning
Automatisk klassificering av frågor i åldersgrupper och kategorier med AI.

### 👥 Åldersgrupper
- **Children (6-12):** Enkla frågor, svensk fokus
- **Youth (13-25):** Social media, global fokus, AKTUELLT (med datum!)
- **Adults (25+):** Historia, vetenskap, svensk fokus

**Viktigt:**
- En fråga kan tillhöra FLERA åldersgrupper
- Format: \`"children,youth,adults"\` (kommaseparerat UTAN mellanslag)

### 📂 Kategorier
**Huvudkategorier:** Geografi, Historia, Naturvetenskap, Kultur, Sport & Idrott, Natur & Djur, Teknik, Mat & Dryck, Gåtor, Samhälle

**Social Media (Youth):** Social Media, YouTube, TikTok, Instagram, Snapchat, Threads, Bluesky, Facebook, Gaming, Streaming

**Populärkultur (Youth):** Film & TV, Musik, Kändisar, Mode

**Viktigt:**
- MINST en kategori per fråga (REQUIRED)
- Format: \`"Historia,Kultur"\` (kommaseparerat UTAN mellanslag)
- Om okänd kategori → flagga för granskning

### ✅ Acceptance Criteria
- [ ] AI klassificerar åldersgrupp automatiskt
- [ ] AI väljer minst 1 kategori
- [ ] Validering att kategori finns i listan
- [ ] \`age_groups\` sparas kommaseparerat
- [ ] \`categories\` sparas kommaseparerat
- [ ] Frågor utan kategori blockeras

### 📚 Dokumentation
Se [AI_QUESTION_GENERATION.md - Åldersgrupper](docs/AI_QUESTION_GENERATION.md#åldersgrupper-age-groups)
Se [AI_QUESTION_GENERATION.md - Kategorier](docs/AI_QUESTION_GENERATION.md#kategorier)
"@

Write-Host "    ✅ Issue: Age Group & Category Classification" -ForegroundColor Green

# Epic 2: Validation & Quality Control
Write-Host ""
Write-Host "  📋 Epic #2: Validation & Quality Control" -ForegroundColor Cyan

gh issue create --repo $repo --title "[EPIC] Validation & Quality Control System" --label "epic,backend,priority-critical" --body @"
## 📋 Epic: Validation & Quality Control System

Implementera multi-layer validering för att säkerställa hög kvalitet på genererade frågor.

### 🎯 Mål
- AI-to-AI validering med flera providers
- Konfidenspoäng-beräkning (0-100%)
- Innehållsfilter för olämpligt innehåll
- Semantisk dublettkontroll
- Manuellt granskningssystem för admin

### 📚 Relaterad Dokumentation
- [AI_QUESTION_GENERATION.md - Validering](docs/AI_QUESTION_GENERATION.md#validering-av-genererade-frågor)

### ✅ Sub-tasks
- [ ] AI-to-AI Validation System
- [ ] Confidence Score Calculation
- [ ] Content Filtering System
- [ ] Semantic Duplicate Detection
- [ ] Manual Review System (Admin UI)

### 🎯 Definition of Done
- [ ] Multi-provider validering fungerar
- [ ] Konfidenspoäng beräknas korrekt
- [ ] Innehållsfilter blockerar olämpligt innehåll
- [ ] Dubletter upptäcks och slängs automatiskt
- [ ] Admin kan manuellt granska och godkänna/underkänna
"@

Write-Host "  ✅ Epic #2 skapad" -ForegroundColor Green

gh issue create --repo $repo --title "Implement AI-to-AI Validation System" --label "feature,backend,priority-critical" --body @"
## 🎯 Beskrivning
Validera genererade frågor med andra AI-providers för att öka kvaliteten.

### 📋 Validerings-regler

**Antal validators:**
- 2 providers totalt → 1 validerar (utöver generatorn)
- 3 providers → 2 validerar
- 4 providers → 3 validerar (alla utom generatorn)
- Endast 1 provider → Ingen validering, max 70% confidence

**Vad valideras:**
- Rätt svar korrekt
- Svårighetsgrad rimlig
- Åldersgrupp lämplig
- Kategorier korrekta

### 🎯 Enighet mellan validators
- Alla eniga → +20% confidence
- Delad enighet (2 av 3) → Normal poäng
- Oenighet → -20% confidence, flaggas för granskning

### 💾 Databas-fält
- \`ai_generation_provider: string\` - Vem som genererade
- \`ai_validation_providers: string[]\` - Vilka som validerade

### ✅ Acceptance Criteria
- [ ] Validering körs automatiskt vid generering
- [ ] Rätt antal validators baserat på tillgängliga providers
- [ ] Enighet mellan validators påverkar confidence
- [ ] Resultat sparas i databas
- [ ] Kan valideras manuellt via API (/api/validateQuestions)

### 📚 Dokumentation
Se [AI_QUESTION_GENERATION.md - AI-Validering](docs/AI_QUESTION_GENERATION.md#automatisk-ai-validering)
"@

Write-Host "    ✅ Issue: AI-to-AI Validation" -ForegroundColor Green

gh issue create --repo $repo --title "Implement Confidence Score Calculation (0-100%)" --label "feature,backend,priority-high" --body @"
## 🎯 Beskrivning
Beräkna konfidenspoäng för varje genererad fråga baserat på multipla faktorer.

### 📊 Beräkning baseras på:
1. Antal providers som validerat (mer = högre)
2. Enighet mellan providers (samma svar = högre)
3. Ingen dublett hittad (+10%)
4. Alla kategorier korrekt tilldelade (+5%)
5. Både språkversioner kompletta (+5%)
6. Innehållsfilter godkänt (+10%)

### 🎯 Poängintervall
- 🟢 **90-100%:** Auto-godkänn → Visas direkt för spelare
- 🟡 **70-89%:** Visas för spelare, admin kan granska
- 🟠 **50-69%:** Kräver manuell granskning
- 🔴 **0-49%:** Kräver manuell granskning

### ⚠️ Auto-godkännande blockeras om:
- Innehållsfilter flaggat
- Dublett upptäckt
- Saknar kategori
- Saknar språkversion
→ Sätts automatiskt till \`manual_review_status: "quarantine"\`

### 💾 Databas-fält
- \`ai_confidence_score: number\` (0-100)

### ✅ Acceptance Criteria
- [ ] Konfidenspoäng beräknas vid generering
- [ ] Auto-godkännande vid >=90%
- [ ] Blockering fungerar korrekt
- [ ] Poäng sparas i databas
- [ ] Admin ser poäng i UI

### 📚 Dokumentation
Se [AI_QUESTION_GENERATION.md - Konfidenspoäng](docs/AI_QUESTION_GENERATION.md#ai-konfidenspoäng-confidence-score)
"@

Write-Host "    ✅ Issue: Confidence Score" -ForegroundColor Green

gh issue create --repo $repo --title "Implement Content Filtering System" --label "feature,backend,priority-critical" --body @"
## 🎯 Beskrivning
Automatisk filtrering av olämpligt innehåll med AI.

### 🚫 Vad filtreras:
- Olämpligt eller stötande språk
- Politiska bias eller kontroversiella ämnen
- Stereotyper eller diskriminering
- Våld eller sexuellt innehåll
- Personuppgifter eller känslig information

### 🔄 Process:
1. Fråga genereras
2. Innehållsfilter analyserar text (ALLA språkversioner)
3. Om flaggad → \`content_filter_flagged: true\` + anledning
4. Flaggade frågor går automatiskt till manuell granskning
5. Admin ser varning och anledning

### 💾 Databas-fält
- \`content_filter_flagged: boolean\`
- \`content_filter_reason: string\`

### ✅ Acceptance Criteria
- [ ] Alla språkversioner kontrolleras
- [ ] Flaggade frågor sätts i karantän automatiskt
- [ ] Anledning sparas i databas
- [ ] Admin ser varning i UI
- [ ] Blockerar auto-godkännande

### 📚 Dokumentation
Se [AI_QUESTION_GENERATION.md - Innehållsfilter](docs/AI_QUESTION_GENERATION.md#innehållsfilter)
"@

Write-Host "    ✅ Issue: Content Filtering" -ForegroundColor Green

gh issue create --repo $repo --title "Implement Semantic Duplicate Detection" --label "feature,backend,priority-high" --body @"
## 🎯 Beskrivning
AI-baserad semantisk dublettkontroll som upptäcker omformulerade frågor.

### 📊 Semantisk Likhet (0-100%)
- **90-100%:** Definitivt dublett → Släng automatiskt
- **70-89%:** Trolig dublett → Släng automatiskt
- **50-69%:** Möjlig dublett → Flagga för granskning
- **0-49%:** Inte dublett

### 🔍 Kontrollerar:
- **Båda språkversionerna** (svensk OCH engelsk)
- **Alla frågor i databasen** (inkl. raderade!)
- Jämför om frågan handlar om samma sak, inte bara exakt text

### 🔄 Vid generering (automatisk):
1. AI genererar nya frågor
2. Varje fråga jämförs med befintliga
3. Om >=70% likhet → Släng och generera ny
4. Fortsätt tills rätt antal unika frågor

### 💾 Databas-fält
- \`is_potential_duplicate: boolean\`
- \`duplicate_of_question_id: number | null\`
- \`duplicate_check_date: timestamp\`

### ✅ Acceptance Criteria
- [ ] Semantisk likhet mäts korrekt
- [ ] Båda språkversionerna kontrolleras
- [ ] Raderade frågor inkluderas i sökning
- [ ] >=70% likhet slängs automatiskt
- [ ] 50-69% flaggas för granskning
- [ ] Manuell API: /api/checkDuplicates

### 📚 Dokumentation
Se [AI_QUESTION_GENERATION.md - Dublettkontroll](docs/AI_QUESTION_GENERATION.md#dublettkontroll)
"@

Write-Host "    ✅ Issue: Semantic Duplicate Detection" -ForegroundColor Green

gh issue create --repo $repo --title "Implement Manual Review System (Admin UI)" --label "feature,frontend,backend,priority-high" --body @"
## 🎯 Beskrivning
Admin UI för manuell granskning av frågor. Manuell granskning är HÖGST I RANG och övertrumfar all AI-validering.

### 📋 Status-fält: \`manual_review_status\`
- \`null\` - Inte granskad än
- \`"approved"\` - Manuellt godkänd ✅
- \`"rejected"\` - Manuellt underkänd ❌
- \`"quarantine"\` - I karantän ⚠️

### 🏆 Prioritetsordning:
1. Manuell granskning (högst rang)
2. AI-validering
3. AI-generering

### 🎯 Konflikthantering:
- Admin godkänner låg confidence (<70%) → Visas direkt för spelare
- Admin godkänner innehållsfilter-flaggad → Visas direkt för spelare
- Auto-godkänd (90%) får negativ feedback → Sätts i karantän, admin måste granska igen

### 🖥️ Admin UI ska visa:
- Alla frågor som behöver granskning
- Konfidenspoäng
- Valideringsproviders
- Flaggor (innehållsfilter, dublett, etc.)
- Feedback från användare
- Knapp: Godkänn / Underkänn / Editera

### 💾 Databas-fält
- \`manual_review_status: string | null\`
- \`manual_reviewer_id: string | null\`
- \`manual_review_date: timestamp | null\`

### ✅ Acceptance Criteria
- [ ] Admin kan se alla frågor som behöver granskning
- [ ] Godkänn/Underkänn-knappar fungerar
- [ ] Status sparas i databas
- [ ] Manuell godkännande övertrumfar AI
- [ ] Filter för olika status
- [ ] Bulk-actions (godkänn flera samtidigt)

### 📚 Dokumentation
Se [AI_QUESTION_GENERATION.md - Manuell Granskning](docs/AI_QUESTION_GENERATION.md#manuell-granskning)
"@

Write-Host "    ✅ Issue: Manual Review System" -ForegroundColor Green

Write-Host ""
Write-Host "✅ MILESTONE 1 Issues skapade!" -ForegroundColor Green
Write-Host ""
Write-Host "Vill du fortsätta med MILESTONE 2 (User Interaction & Feedback)? (J/N)" -ForegroundColor Yellow
