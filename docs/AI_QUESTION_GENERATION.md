# AI Question Generation & Categorization

Detta dokument beskriver hur Quizter genererar och kategoriserar frågor med AI.

## 🎯 Snabb Översikt

### Språk
**Alla frågor finns i BÅDE svenska OCH engelska!**
- `question_sv` / `question_en`
- `options_sv` / `options_en`
- `explanation_sv` / `explanation_en`

### Åldersgrupper & Inriktning
- **Children (6-12 år)**: 🇸🇪 Svensk fokus → `target_audience: "swedish"`
- **Youth (13-25 år)**: 🌍 Global fokus → `target_audience: "global"`
- **Adults (25+ år)**: 🇸🇪 Svensk fokus → `target_audience: "swedish"`

### AI-Providers
OpenAI, Gemini, Anthropic, Mistral (eller random)

---

## Översikt

Quizter använder flera AI-providers för att automatiskt generera quizfrågor med rätt svårighetsgrad och kategorier.

## AI-Providers

Systemet stödjer 4 AI-providers:

### 1. OpenAI GPT-4o-mini
- **Modell**: `gpt-4o-mini`
- **Användning**: Generering och validering
- **Fördelar**: Pålitlig, vältestad, snabb

### 2. Google Gemini
- **Modell**: `gemini-1.5-flash`
- **Användning**: Generering och validering  
- **Fördelar**: Gratis tier, bra på svenska

### 3. Anthropic Claude
- **Modell**: `claude-3-5-sonnet-20241022`
- **Användning**: Generering och validering
- **Fördelar**: Hög kvalitet, bra reasoning

### 4. Mistral
- **Modell**: `mistral-small-latest`
- **Användning**: Generering och validering
- **Fördelar**: Europeiskt, GDPR-vänligt, bra på svenska

### Random Provider

Du kan också välja `random` som provider, då väljs en slumpmässig provider bland de som är konfigurerade.

**Hur det fungerar:**
- **Vid generering:** En random provider väljs för att generera frågorna (t.ex. "gemini")
- **Vid validering:** Andra providers används (INTE samma som genererade)
  - Om gemini valdes för generering → openai och anthropic validerar
  - Valideringsproviders väljs alltid deterministiskt (inte random igen)
- **Exempel:**
  ```javascript
  Request: { provider: "random", amount: 10 }
  
  // System väljer random: "gemini"
  // Genereringsprocess:
  - ai_generation_provider: "gemini" (den som slumpades)
  - ai_validation_providers: ["openai", "anthropic"] (övriga providers)
  ```
- **Fördel:** Variation i frågestil, undviker bias från en enskild AI

---

## Frågegenerering

### Parametrar

När du genererar frågor kan du specificera:

- **Amount** (antal): 1-50 frågor
- **Category** (kategori): Geografi, Historia, Naturvetenskap, etc.
- **Age Group** (åldersgrupp): children, youth, adults (kan välja flera)
- **Difficulty** (svårighet): easy, medium, hard (valfri, default: medium)
- **Provider**: openai, gemini, anthropic, mistral eller random
- **Generate Illustrations**: true/false (default: true) - Generera AI-illustrationer för varje fråga

### API Request

```javascript
POST /api/generateAIQuestions

{
  "amount": 10,
  "category": "Historia", 
  "ageGroup": "youth",
  "difficulty": "medium",
  "provider": "openai",  // or "gemini", "anthropic", "mistral", "random"
  "generateIllustrations": true  // Generera illustrationer (default: true)
}
```

### Response

API:et returnerar direkt ett `taskId`:

```json
{
  "success": true,
  "taskId": "task_1730000000_abc123",
  "message": "AI question generation started"
}
```

Själva genereringen körs i bakgrunden och du kan följa progress via SSE (Server-Sent Events).

**Vad kan du göra med taskId:**
- ✅ **Subscriba via SSE:** Få real-time updates (rekommenderat)
- ✅ **Bara vänta:** Frågor sparas i databasen oavsett om du subscribar
- ✅ **Kolla senare:** Hämta resultat via `/api/getTaskResult?taskId=...`

**Vad händer om du INTE subscribar:**
- ✅ Bakgrundsprocessen körs ändå och slutförs normalt
- ✅ Frågor sparas i databasen som vanligt
- ❌ Du får ingen real-time progress (kan ta 30-60 sekunder)
- ❌ Du vet inte om något gick fel förrän efteråt
- **Rekommendation:** Subscriba ALLTID för bästa användarupplevelse

---

## 🔄 Komplett Flöde: Från Generering till Användning

### 1. Generering (Automatisk)
1. Admin startar generering via API
2. ✅ Provider A genererar frågor (text, svar, förklaring)
3. ✅ AI genererar illustration för varje fråga
   - Baserad på frågetext och kategori
   - Sparas som URL: `illustration_url`
4. ✅ Dublettkontroll (semantisk likhet med befintliga frågor)
   - Dublett hittad → Släng fråga, generera ny
5. ✅ Innehållsfilter kontrollerar alla språkversioner
   - Flaggat → `content_filter_flagged: true`
6. ✅ Provider B & C validerar frågor
7. ✅ Konfidenspoäng beräknas (0-100%)
8. ✅ Auto-godkännande om:
   - Konfidenspoäng >= 90%
   - OCH inte flaggad av innehållsfilter
   - OCH inte dublett
   - OCH har alla kategorier
   - OCH har båda språkversioner
   - OCH har illustration
9. Frågor sparas i databas

### 2. Granskning (Admin)
- **Auto-godkända frågor (>=90%):** Kan användas direkt
- **Flaggade frågor (<70% eller innehållsfilter):** Kräver manuell granskning
- **Bra frågor (70-89%):** Kan användas, men admin bör granska

### 3. Användning (Spelare)
**Frågor som VISAS för spelare:**
- ✅ Konfidenspoäng >=70% OCH inga flaggor (innehållsfilter, dublett, karantän) OCH inte raderade
- ✅ Manuellt godkända (`manual_review_status: "approved"`) OCH inte raderade

**Frågor som INTE visas:**
- ❌ Konfidenspoäng <70% (om inte manuellt godkända)
- ❌ Underkända (`manual_review_status: "rejected"`)
- ❌ I karantän (`manual_review_status: "quarantine"`)
- ❌ Flaggade av innehållsfilter (`content_filter_flagged: true`)
- ❌ Möjliga dubletter (`is_potential_duplicate: true`)
- ❌ Hög negativ feedback (>=30%) - sätts automatiskt i karantän
- ❌ Raderade (`deleted_at IS NOT NULL`)

### 4. Användarrapportering
1. Spelare anmäler fråga → `manual_review_status: "quarantine"`
2. Frågan visas INTE längre för andra spelare
3. ✅ Batch-validering startar automatiskt (validerar relaterade frågor)
4. Admin granskar → Godkänn eller Underkänn

### 5. Feedback & Kalibrering (Löpande)
- Spelare svarar på frågor → `times_shown++`, `times_correct++`
- Spelare ger feedback → `user_feedback_positive++` eller `negative++`
- Varje natt: Kalibrering av svårighetsgrad baserat på success rate
- Varje vecka: Flagga Youth-frågor >6 månader för uppdatering
- Varje månad: Generera nya Youth-frågor automatiskt

---

## Validering av Genererade Frågor

### Automatisk AI-Validering

Alla frågor som genereras av en AI-provider valideras automatiskt av en eller flera andra providers:

1. **Genereringstagg**: Varje fråga taggas med vilken provider som genererade den
   - Sparas i: `ai_generation_provider` (t.ex. "openai", "gemini")

2. **Valideringstagg**: Frågan valideras av andra tillgängliga providers
   - Sparas i: `ai_validation_providers` (array, t.ex. ["gemini", "anthropic"])
   - **Krav för validering:**
     - ✅ Minst 2 providers totalt konfigurerade → 1 validerar (utöver generatorn)
     - ✅ Minst 3 providers konfigurerade → 2 validerar (utöver generatorn)
     - ✅ 4 providers konfigurerade → 3 validerar (alla utom generatorn)
   - **Om endast 1 provider konfigurerad:**
     - ❌ Ingen validering möjlig
     - ⚠️ Alla frågor får lägre konfidenspoäng (max 70%)
     - ⚠️ Alla frågor kräver manuell granskning

3. **Valideringsprocess**:
   - Provider A genererar frågan → taggas med `ai_generation_provider: "providerA"`
   - Provider B och C validerar frågan → taggas med `ai_validation_providers: ["providerB", "providerC"]`
   - Validatorer kontrollerar: rätt svar, svårighetsgrad, lämplig åldersgrupp, kategorier
   - **Enighet mellan validatorer:**
     - Alla eniga → Högre konfidenspoäng (+20%)
     - Delad enighet (2 av 3) → Normal poäng
     - Oenighet → Lägre poäng (-20%), flaggas för granskning

**Validering körs automatiskt:**
- ✅ Vid generering av nya frågor (default)
- ✅ Manuellt på befintliga frågor i frågebanken (Admin UI)

### Manuell AI-Validering av Befintliga Frågor

**I Admin UI kan du välja att validera befintliga frågor:**

- **Välj frågor att validera**:
  - Välj en eller flera frågor i frågebanken
  - Klicka "Validera med AI"
  - Välj vilka providers som ska validera

- **Validerings-API**:
```javascript
POST /api/validateQuestions

{
  "questionIds": [123, 456, 789],  // Array av fråge-ID:n
  "validators": ["gemini", "anthropic"]  // Vilka providers ska validera
}
```

- **Response**:
```json
{
  "success": true,
  "taskId": "task_1730000000_validate_abc",
  "message": "Question validation started for 3 questions"
}
```

- **Resultat**:
  - Frågornas `ai_validation_providers` uppdateras
  - Om validering misslyckar → frågan kan flaggas för granskning
  - Admin ser valideringsresultat och kan agera

**Användningsfall för manuell validering:**
- 📝 Frågor som importerats manuellt (utan AI-generering)
- 🔄 Äldre frågor som behöver omkontrolleras
- ⚠️ Frågor som anmälts av användare (efter editering)
- 🆕 Efter uppdatering av frågeinnehåll

### AI-Konfidenspoäng (Confidence Score)

**Alla genererade frågor får ett konfidenspoäng (0-100%):**

- **Beräkning baseras på:**
  1. Antal providers som validerat (mer = högre poäng)
  2. Enighet mellan providers (samma svar = högre poäng)
  3. Ingen dublett hittad (+10%)
  4. Alla kategorier korrekt tilldelade (+5%)
  5. Både språkversioner kompletta (+5%)
  6. Innehållsfilter godkänt (+10%)

- **Poängintervall:**
  - 🟢 **90-100%**: Hög kvalitet - Auto-godkänn → Visas direkt för spelare
  - 🟡 **70-89%**: Bra kvalitet - Visas för spelare, admin kan granska vid behov
  - 🟠 **50-69%**: Medel kvalitet - Visas INTE förrän admin granskat och godkänt
  - 🔴 **0-49%**: Låg kvalitet - Visas INTE förrän admin granskat och godkänt

- **Auto-godkännande:**
  - Om `ai_confidence_score >= 90` OCH ingen anmälan → Automatiskt `manual_review_status: "approved"`
  - Admin kan fortfarande ändra manuellt
  - Sparar enormt mycket tid för admin
  
- **VIKTIGT - Auto-godkännande blockeras om:**
  - ❌ Innehållsfilter flaggat frågan (`content_filter_flagged: true`)
  - ❌ Frågan är dublett (`is_potential_duplicate: true`)
  - ❌ Frågan saknar kategori
  - ❌ Någon språkversion saknas
  - → Dessa frågor KRÄVER alltid manuell granskning, oavsett konfidenspoäng
  - **Status efter blockering:**
    - `manual_review_status: "quarantine"` sätts automatiskt
    - Frågan visas INTE för spelare förrän admin granskat
    - Admin ser i UI: "Blockerad - Innehållsfilter" eller "Blockerad - Dublett" etc.
    - Admin måste aktivt godkänna eller underkänna

### Innehållsfilter

**AI kontrollerar automatiskt allt genererat innehåll:**

- **Vad filtreras:**
  - ❌ Olämpligt eller stötande språk
  - ❌ Politiska bias eller kontroversiella ämnen
  - ❌ Stereotyper eller diskriminering
  - ❌ Våld eller sexuellt innehåll
  - ❌ Personuppgifter eller känslig information

- **Process:**
  1. Fråga genereras
  2. Innehållsfilter analyserar text (alla språkversioner)
  3. Om flaggad → `content_filter_flagged: true` + anledning
  4. Flaggade frågor går automatiskt till manuell granskning
  5. Admin ser varning och anledning

- **Databas-fält:**
  - `content_filter_flagged: boolean`
  - `content_filter_reason: string` (t.ex. "Potentially offensive language")

### Batch-validering

**När en fråga anmäls för "felaktigt svar":**

- **Automatisk batch-kontroll (körs automatiskt):**
  1. **Identifiera "samma generation-batch":**
     - Alla frågor genererade av samma `taskId` (samma API-anrop)
     - Exempel: Om admin genererade 20 frågor samtidigt → alla 20 kontrolleras
  2. **Identifiera "samma AI-provider samma dag":**
     - Alla frågor med samma `ai_generation_provider`
     - OCH `created_at` samma dag (00:00-23:59)
     - Exempel: Alla frågor från "openai" genererade 2024-11-05
  3. **Identifiera "samma kategori samma vecka":**
     - Alla frågor med samma kategori
     - OCH genererade senaste 7 dagarna
     - Exempel: Alla "Historia"-frågor från senaste veckan
  4. Validera alla dessa frågor automatiskt med andra providers
  5. Flagga om fler problem hittas
  6. Admin ser grupperad lista för granskning
  7. **Sker automatiskt i bakgrunden** - admin behöver inte starta manuellt

- **Förhindrar:**
  - Att flera felaktiga frågor från samma batch missas
  - Systematiska fel från en provider
  - Upprepade problem i samma kategori
  
- **Omfattning:**
  - **Vad bestämmer antalet (10-50):**
    - Minst 10 frågor väljs (även om bara 5 matchar kriterierna ovan)
    - Max 50 frågor för att undvika överbelastning
    - **Prioritet:** Senast skapade frågor först
  - **Om fler än 50 hittas:**
    - De 50 senaste frågorna valideras
    - Övriga läggs i kö för nästa batch-validering
    - Admin får notis: "200 frågor behöver valideras - körs i omgångar"
  - **Om färre än 10 hittas:**
    - Alla matchande frågor valideras ändå (ingen minimum)
  - **Typiskt 10-50 frågor** baserat på hur många som matchar kriterierna

- **API (används automatiskt av systemet):**
```javascript
POST /api/batchValidate

{
  "triggeredByQuestionId": 123,  // Frågan som anmäldes
  "reason": "incorrect_answer"    // Anledning
}
```

- **Admin ser resultat:**
  - Notifiering: "Batch-validering startad för 15 relaterade frågor"
  - Lista över frågor som behöver granskas
  - Kan hantera alla på en gång eller en i taget

### Dublettkontroll

**Systemet förhindrar dubletter av frågor:**

- **Intelligent dublettkontroll**:
  - ✅ Kontrollerar om frågan handlar om samma sak (inte bara exakt text)
  - ✅ Använder AI för att identifiera semantiska likheter
  - ✅ Körs automatiskt vid generering och import
  - **Semantisk likhet mäts 0-100%:**
    - 90-100% = Definitivt dublett (samma fråga, omformulerad)
    - 70-89% = Trolig dublett (samma ämne, olika vinkel)
    - 50-69% = Möjlig dublett (relaterat ämne, flaggas för granskning)
    - 0-49% = Inte dublett
  - **Båda språkversionerna kontrolleras:**
    - Svensk version jämförs med alla svenska frågor
    - Engelsk version jämförs med alla engelska frågor
    - Om **någon** version >= 70% likhet → Markeras som dublett

- **Vad räknas som dublett?**
  - ❌ **Exakt samma fråga** (100% likhet): "Vad är Sveriges huvudstad?" och "Vad är Sveriges huvudstad?"
  - ❌ **Omformulerad fråga** (90-100% likhet): "Vilken stad är Sveriges huvudstad?" och "Vad heter Sveriges huvudstad?"
  - ❌ **Samma ämne** (70-89% likhet): "Vad är huvudstaden i Sverige?" och "I vilken stad ligger Sveriges regering?"
  - ⚠️ **Möjlig dublett** (50-69% likhet): "Vad är Sveriges huvudstad?" och "Vad är Sveriges största stad?" (flaggas för granskning)
  - ✅ **INTE dublett** (<50% likhet): "Vad är Sveriges huvudstad?" och "Vad är Norges huvudstad?" (olika länder)

- **Dublettkontroll vid generering** (automatisk):
  1. AI genererar nya frågor
  2. Varje fråga jämförs med befintliga frågor i databasen (inkl. raderade frågor!)
  3. Om semantisk likhet upptäcks → frågan **slängs automatiskt**
  4. En ny fråga genereras istället
  5. Processen fortsätter tills rätt antal unika frågor skapats
  6. **Admin behöver inte ingripa** - allt sker i bakgrunden
  7. **OBS:** Även raderade frågor kontrolleras för att förhindra att samma fråga genereras igen

- **Manuell dublettkontroll i frågebanken**:
  - Admin kan välja **en eller flera specifika frågor** att kontrollera
  - System jämför valda frågor med övriga frågor i databasen
  - Om dubletter hittas → Admin ser grupper av potentiella dubletter
  - Admin väljer vilken version som ska behållas

- **API för manuell dublettkontroll**:
```javascript
POST /api/checkDuplicates

{
  "questionIds": [123, 456, 789]  // Specifika frågor att kontrollera
}
```

**Databas-fält:**
```javascript
{
  is_potential_duplicate: false,     // Flaggad som möjlig dublett
  duplicate_of_question_id: null,    // ID för original-frågan
  duplicate_check_date: null         // När kontrollen gjordes
}
```

### Manuell Granskning

**Manuell granskning är HÖGST I RANG** och övertrumfar all AI-validering:

- **Status-fält**: `manual_review_status`
  - `null` - Inte granskad manuellt än
  - `"approved"` - Manuellt godkänd ✅
  - `"rejected"` - Manuellt underkänd ❌
  - `"quarantine"` - I karantän (väntar på granskning) ⚠️

- **Prioritetsordning**:
  1. 🏆 **Manuell granskning** (högst rang)
  2. 🤖 AI-validering från flera providers
  3. 🤖 AI-generering utan validering

- **I Admin UI**:
  - Granska frågor innan publicering
  - Godkänn (sätter `manual_review_status: "approved"`)
  - Underkänn (sätter `manual_review_status: "rejected"`)
  
- **Konflikthantering (manuell övertrumfar automatik):**
  - ✅ Admin godkänner fråga med låg confidence (<70%) → **Visas direkt för spelare**
  - ✅ Admin godkänner innehållsfilter-flaggad fråga → **Visas direkt för spelare**
  - ⚠️ Auto-godkänd fråga (90%) får negativ feedback → **Sätts i karantän, visas INTE**
    - Admin måste granska på nytt och antingen:
      - Godkänna igen (`manual_review_status: "approved"`) → Visas för spelare
      - Underkänna (`manual_review_status: "rejected"`) → Visas aldrig
  - 🔄 **Regel:** `manual_review_status` har ALLTID högre prioritet än AI-poäng/flaggor
  
- **Vilka frågor visas för spelare:**
  - ✅ `manual_review_status: "approved"` (manuellt godkända, **oavsett AI-poäng eller flaggor**)
  - ✅ `manual_review_status: null` OCH `ai_confidence_score >= 90` (auto-godkända)
  - ✅ `manual_review_status: null` OCH `ai_confidence_score >= 70` (bra kvalitet, ej granskade än)
  - ❌ `manual_review_status: "rejected"` (underkända)
  - ❌ `manual_review_status: "quarantine"` (i karantän)
  - ❌ `content_filter_flagged: true` (flaggade av innehållsfilter) **OM INTE manuellt godkända**
  - ❌ `is_potential_duplicate: true` (möjliga dubletter) **OM INTE manuellt godkända**
  - ❌ `ai_confidence_score < 70` OCH `manual_review_status: null` (låg kvalitet, ej granskade)

### Användarrapportering av Frågor

**Spelare kan anmäla frågor** om de upptäcker fel eller problem:

- **Rapporteringsfunktion**: I spelet kan användare flagga en fråga
- **Anmälningsorsak**: Användaren kan ange orsak (valfritt)
  - Felaktigt svar
  - Fel svårighetsgrad
  - Olämpligt innehåll
  - Föråldrad information
  - Dublett av annan fråga
  - Annat (fritextfält)

- **Automatisk karantän**: 
  - ⚠️ Anmäld fråga sätts automatiskt till `manual_review_status: "quarantine"`
  - 🚫 Frågan visas INTE för andra spelare förrän den granskats manuellt
  - 📋 Anmälan sparas med: `reported_by_user_id`, `report_reason`, `report_date`
  - 🔍 Admin ser alla anmälda frågor i prioriterad lista

- **Admin granskar anmälan**:
  - Godkänn → `manual_review_status: "approved"` (frågan används igen)
  - Underkänn → `manual_review_status: "rejected"` (frågan tas bort permanent)
  - Kan editera frågan och sedan godkänna

### Användar-feedback

**Spelare kan ge feedback på varje fråga:**

- **Efter varje besvarad fråga:**
  - **Exakt timing:** Visas direkt efter att användaren sett om svaret var rätt/fel
  - **Innan nästa fråga laddas:** "Gillade du denna fråga?" 👍 👎
  - Användare har 5 sekunder på sig att svara (eller skippa)
  - Efter 5 sekunder eller när användare klickar "Nästa" → Nästa fråga
  - Visa diskret: "Gillade du denna fråga?" 👍 👎
  - Valfritt - spelare kan skippa
  - Sparas anonymt: `user_feedback_positive` / `user_feedback_negative`

- **Användning av feedback:**
  - Frågor med mycket 👎 → Flaggas för granskning
  - Frågor med mycket 👍 → Högre `popularity_score`
  - **Popularity score beräkning (0-100):**
    - Baseras på: 👍👎 ratio (50%), `times_shown` (30%), `times_correct` (20%)
    - **Formel:**
      ```
      feedback_ratio = positive / (positive + negative)  // 0-1
      views_score = min(times_shown / 1000, 1)           // Max vid 1000 visningar
      correct_ratio = times_correct / times_shown        // 0-1
      
      popularity_score = (feedback_ratio * 50) + (views_score * 30) + (correct_ratio * 20)
      ```
    - **Exempel:**
      - 80% 👍, 500 visningar, 70% rätt → (0.8*50) + (0.5*30) + (0.7*20) = 69 poäng
      - 95% 👍, 1000 visningar, 80% rätt → (0.95*50) + (1*30) + (0.8*20) = 93.5 poäng
  - Används för att förbättra AI-prompter över tid
  - Admin ser feedback-ratio i frågebanken

- **Automatisk flaggning:**
  - Om `user_feedback_negative / (positive + negative) > 0.3` (30% negativ)
  - → Automatiskt sätt till karantän för granskning
  - → Frågan visas INTE längre för spelare
  - Admin ser: "Fråga flaggad - 45% negativ feedback (18 av 40 användare)"
  - Admin kan sedan:
    - Editera och återgodkänna frågan
    - Underkänna permanent
    - Godkänna ändå om feedbacken bedöms som felaktig

### Svårighetsgrad-kalibrering

**Automatisk justering baserat på faktiska svar:**

- **Datainsamling:**
  - **När räknas en "visning":**
    - ✅ Frågan laddas OCH användaren svarar (rätt eller fel) → `times_shown++`
    - ❌ Frågan laddas men quiz avbryts innan svar → Räknas INTE
    - **Regel:** Endast kompletta svar räknas för korrekt statistik
  - Varje gång frågan visas OCH besvarats: `times_shown++`
  - Vid rätt svar: `times_correct++`
  - Vid fel svar: `times_incorrect++`
  - **Validering:** `times_shown = times_correct + times_incorrect` (ska alltid stämma)

- **Kalibrering (körs automatiskt varje natt kl 03:00):**
  - Beräkna success rate: `times_correct / times_shown`
  - **OBS:** Endast kompletta svar räknas
    - ✅ Användare svarade (rätt eller fel) = räknas
    - ❌ Användare lämnade mitt i quiz = räknas INTE
    - ❌ Frågan laddades men quiz avbröts = räknas INTE
  - **Formel:** `success_rate = times_correct / times_shown` (0.0 - 1.0)
  - **Kräver minst 50 visningar för tillförlitlig data**
  - Om frågan visats minst 50 gånger:
    - Success rate > 0.90 (90%) → `actual_difficulty: "easy"`
    - Success rate 0.60-0.90 (60-90%) → `actual_difficulty: "medium"`
    - Success rate < 0.60 (60%) → `actual_difficulty: "hard"`
  - **Om 0-49 visningar:**
    - `actual_difficulty: null` (för lite data)
    - Frågan visas fortfarande normalt med original `difficulty`
  
- **Auto-justering:**
  - Om skillnad mellan `difficulty` och `actual_difficulty` > 1 nivå
  - OCH frågan visats >100 gånger (för att vara säker)
  - → Uppdatera automatiskt `difficulty` till `actual_difficulty`
  - → Logga ändring för admin (visas i Admin UI)
  - Exempel: Fråga markerad "hard" men 95% svarar rätt → Auto-justeras till "easy"
  - **Om 50-99 visningar:**
    - `actual_difficulty` beräknas men `difficulty` ändras INTE automatiskt
    - Admin ser varning: "Svårighet kan behöva justeras (baserat på 67 svar)"
    - Admin kan manuellt justera

- **Databas-fält:**
  - `times_shown: number`
  - `times_correct: number`
  - `times_incorrect: number`
  - `actual_difficulty: string | null` (beräknad svårighet)

### Säsongsanpassning (Youth-frågor)

**Youth-frågor måste hållas aktuella:**

- **Automatisk kontroll (körs varje vecka, måndagar kl 02:00):**
  1. Hitta alla Youth-frågor äldre än 6 månader
  2. **Beräkning:** `created_at < (now() - 6 months)` 
     - **OBS:** Räknas från `created_at` första gången
     - Efter första uppdateringen räknas från `last_seasonal_check`
  3. **Exakt 6 månader:** 183 dagar (6 * 30.5 dagar)
  4. Sätt `requires_seasonal_update: true`
  5. Admin får notifiering: "47 youth-frågor behöver uppdateras"
  6. **Frågor visas fortfarande för spelare** tills admin hanterar dem

- **Admin-åtgärder:**
  - Granska frågor som behöver uppdatering
  - Uppdatera datum (t.ex. "november 2024" → "maj 2025")
  - Uppdatera siffror/fakta om de ändrats
  - Eller underkänn om frågan inte längre är relevant
  - **När uppdaterad:** `requires_seasonal_update: false` + `last_seasonal_check: now()`

- **Automatisk generering (månatlig):**
  - Första måndagen varje månad → Generera 20 nya Youth-frågor automatiskt
  - Kategorier: Social Media, Gaming, Musik, TikTok, Instagram
  - Admin får notifiering för granskning
  - Kan ersätta de äldsta/minst populära frågorna (admin beslutar)

- **Databas-fält:**
  - `requires_seasonal_update: boolean` - Flaggad för uppdatering
  - `last_seasonal_check: timestamp` - Senast kontrollerad

### Kategori-filter för Spelare

**Spelare kan välja sina favoritkategorier:**

- **Användarprofil:**
  - Spelare väljer intressen: "Sport & Idrott", "Gaming", "TikTok", "Historia"
  - Sparas i användarprofil: `preferred_categories: string[]`
  - **Default för nya användare:** 
    - Första gången användare spelar → Alla kategorier aktiverade
    - Efter första quizet → Popup: "Vad är du intresserad av?" (valfritt att välja)
    - Om användare skippar → Fortsätt med alla kategorier

- **Quiz-generering:**
  - Vid start av nytt quiz → Filtrera frågor baserat på preferenser
  - "Personal Quiz" - 80% frågor från favoritkategorier, 20% från övriga
  - "Surprise Quiz" - Helt random (ignorerar preferenser)

- **API:**
```javascript
POST /api/user/updatePreferences

{
  "preferred_categories": ["Gaming", "Social Media", "Sport & Idrott"],
  "preferred_age_groups": ["youth"],  // Optional filter
  "preferred_difficulty": "medium"     // Optional filter
}
```

- **Quiz-generering med filter:**
```javascript
POST /api/getQuizQuestions

{
  "amount": 10,
  "useUserPreferences": true,  // Använd sparade preferenser
  "preferenceWeight": 0.8      // 80% från preferenser, 20% random
}
```

### Frågefält för Validering

```javascript
{
  // ... övriga fält
  ai_generation_provider: "openai",              // Vilken provider som genererade
  ai_validation_providers: ["gemini", "anthropic"], // Vilka providers som validerade
  ai_confidence_score: 95,                        // AI-konfidenspoäng 0-100%
  manual_review_status: null,                     // null | "approved" | "rejected" | "quarantine"
  manual_reviewer_id: null,                       // User ID för den som granskade
  manual_review_date: null,                       // Timestamp för granskning
  reported_by_user_id: null,                      // User ID för den som anmälde
  report_reason: null,                            // Anledning till anmälan
  report_date: null,                              // Timestamp för anmälan
  is_potential_duplicate: false,                  // Flaggad som möjlig dublett
  duplicate_of_question_id: null,                 // ID för original-frågan
  duplicate_check_date: null,                     // När kontrollen gjordes
  
  // Kvalitetsdata
  times_shown: 0,                                 // Antal gånger frågan visats OCH besvarats
  times_correct: 0,                               // Antal gånger rätt svar
  times_incorrect: 0,                             // Antal gånger fel svar
  actual_difficulty: null,                        // Kalibrerad svårighet baserat på data
  popularity_score: 0,                            // Hur populär frågan är (0-100)
  user_feedback_positive: 0,                      // Antal 👍
  user_feedback_negative: 0,                      // Antal 👎
  
  // Innehållsfilter
  content_filter_flagged: false,                  // Flaggad av innehållsfilter
  content_filter_reason: null,                    // Anledning till flaggning
  
  // Youth-specifikt
  requires_seasonal_update: false,                // Behöver uppdateras (>6 mån gammal)
  last_seasonal_check: null,                      // När frågan senast kontrollerades
  
  // Illustration
  illustration_url: "https://...",                // AI-genererad illustration för frågan
  illustration_prompt: "...",                     // Prompt som användes för att generera bilden
  illustration_provider: "dall-e-3",              // AI-provider för illustration (dall-e-3, midjourney, etc.)
  
  // Soft delete
  deleted_at: null,                               // Timestamp när frågan raderades (null = aktiv)
  deleted_by_user_id: null,                       // User ID för den som raderade
  deletion_reason: null                           // Anledning till radering
}
```

### Radering av Frågor (Soft Delete)

**Frågor raderas aldrig permanent - de "soft deletas":**

- **Varför soft delete?**
  - 🔍 Dublettkontroll behöver alla frågor (även raderade) för att förhindra att samma fråga genereras igen
  - 📊 Statistik och historik bevaras
  - ↩️ Möjlighet att ångra radering

- **Hur det fungerar:**
  1. Admin "raderar" en fråga
  2. `deleted_at: timestamp` sätts (frågan markeras som raderad)
  3. `deleted_by_user_id` + `deletion_reason` sparas
  4. Frågan visas INTE längre för spelare
  5. Frågan visas INTE i admin-listan (om inte "Visa raderade" är aktivt)
  6. **Men frågan används fortfarande i dublettkontroll!**

- **Databas-fält:**
  - `deleted_at: timestamp | null` - När frågan raderades (null = aktiv)
  - `deleted_by_user_id: string` - Vem som raderade
  - `deletion_reason: string` - Anledning (t.ex. "Felaktigt innehåll", "Dublett", "Föråldrad")

- **I Admin UI:**
  - "Radera fråga" → Dialog: "Varför raderar du denna fråga?"
  - Frågan försvinner från normala listan
  - Toggle: "Visa raderade frågor" → Grå markering
  - Möjlighet att återställa: "Ångra radering"

- **Lagringstid för raderade frågor:**
  - ✅ Raderade frågor sparas **permanent** (ingen automatisk rensning)
  - 📊 Används för dublettkontroll och statistik i all framtid
  - 💾 **Databas-optimering:** Raderade frågor indexeras separat för snabbare sökningar
  - **Varför permanent:**
    - Förhindrar att gamla dubletter genereras igen om frågor rensas
    - Bevarar historisk data för analys
    - Möjlighet att återställa populära frågor i framtiden
  - **Undantag:** Hard delete (se nedan)

- **API:**
```javascript
// Soft delete
POST /api/questions/delete
{
  "questionId": 123,
  "reason": "Dublett av fråga #456"
}

// Återställ
POST /api/questions/restore
{
  "questionId": 123
}
```

- **Dublettkontroll:**
  - Jämför med ALLA frågor, även raderade (`deleted_at IS NOT NULL`)
  - Om dublett av raderad fråga hittas → Frågan slängs
  - Förhindrar att samma fråga genereras igen
  - **Optimering:** Raderade frågor indexeras för snabb dublettsökning

- **Hard delete (permanent radering):**
  - Endast för admins med speciella rättigheter
  - Kräver bekräftelse: "Detta kan INTE ångras!"
  - Används endast för känsligt/olagligt innehåll som MÅSTE tas bort
  - **OBS:** Kan resultera i att dubletter genereras igen
  - **Loggning:** All hard delete loggas permanent (vem, när, varför)

### AI-Illustrationer

**Varje fråga får en AI-genererad illustration:**

- **När genereras illustrationer:**
  - ✅ **EFTER** frågan har validerats och godkänts (för att spara kostnader)
  - ✅ Illustration genereras parallellt med databas-sparning (steg 3 i flödet)
  - ✅ Om illustration-genereringen misslyckas → Frågan sparas ändå
  - ⏱️ **Timing:** Illustration tar typiskt 5-15 sekunder per fråga
  - **Prioritering:**
    - Om många frågor genereras samtidigt → Illustrationer körs i bakgrund
    - Frågor blir synliga för spelare direkt, illustrationer läggs till när de är klara
  - **Progress-uppdatering:**
    - "70% - Saving to database"
    - "85% - Generating illustrations (3/10)"
    - "100% - Complete"

- **Illustration-prompt:**
  - Skapas smart baserat på frågan
  - **Vem skapar prompten:** Samma AI-provider som genererade frågan
  - **Process:**
    1. Fråge-AI (t.ex. OpenAI) genererar frågan
    2. Samma AI får instruction: "Create an image prompt for this question"
    3. AI genererar bild-prompt baserat på fråga, kategori, åldersgrupp
    4. Bild-AI (DALL-E 3) tar emot prompten och genererar bild
  - Exempel: För fråga "Vad är Sveriges huvudstad?" 
    → Fråge-AI genererar: "A colorful, child-friendly illustration of Stockholm city with famous landmarks"
    → DALL-E 3 skapar bilden
  - För Youth-frågor → Modern, trendig stil
  - För Children-frågor → Färgglad, enkel, pedagogisk stil
  - För Adults-frågor → Mer detaljerad, realistisk stil

- **Providers för illustrationer:**
  - **DALL-E 3** (OpenAI) - Hög kvalitet, bra på text i bilder (default)
  - **Midjourney** - Artistisk stil (framtida)
  - **Stable Diffusion** - Open source alternativ (framtida)

- **Databas-fält:**
  - `illustration_url: string | null` - URL till genererad bild (null om inte genererad än)
  - `illustration_prompt: string | null` - Prompt som användes
  - `illustration_provider: string | null` - Vilken AI som genererade bilden

- **Validering:**
  - Illustrationer kontrolleras automatiskt av innehållsfilter
  - Olämpliga bilder flaggas för manuell granskning
  - Admin kan regenerera illustration om behövs

- **Om illustration saknas (illustration_url = null):**
  - ✅ Frågan visas ändå för spelare
  - 🖼️ **Placeholder-bild visas:** Generisk bild baserad på kategori
    - "Historia" → Historisk ikon
    - "Gaming" → Gaming-ikon
    - "Naturvetenskap" → Vetenskaps-ikon
    - Default → Quizter-logo
  - 📊 Admin ser varning: "Illustration saknas - generera?" (knapp)
  - **Illustration kan läggas till senare** utan att påverka frågan

- **Admin kan:**
  - Se illustration i förhandsgranskning
  - Regenerera illustration (med ny prompt)
  - Ladda upp egen bild istället
  - Ta bort illustration (frågan visas ändå)

---

## Åldersgrupper (Age Groups)

Frågor kategoriseras i tre åldersgrupper:

### Children (Barn, 6-12 år)
- **Innehåll**: Enkla frågor om vardagliga saker, djur, natur
- **Språk**: Enkla ord, tydliga beskrivningar
- **Inriktning**: 🇸🇪 **Svensk fokus** (svenska förhållanden, svensk kultur)
- **Exempel**: "Vilken färg har solen?", "Hur många ben har en spindel?", "Vad heter Sveriges kung?"

### Youth (Ungdom, 13-25 år)
- **Innehåll**: Sociala medier-trender, vad som händer nu, populärkultur, influencers, viral content
- **Språk**: Modernt, aktuellt
- **Inriktning**: 🌍 **Global fokus** (internationell kultur, globala trender)
- **Aktualitet**: ⚠️ **VIKTIGT - Var så aktuell som möjligt!**
  - Använd nutid och aktuella siffror (2024/2025)
  - Om frågan/svaret inte är aktuellt längre → **Ange TYDLIGT när den var aktuell**
  - Frågor kan handla om trendiga ord/slang (ange när de blev virala!)
  - Exempel: "Vem hade flest följare på Instagram **i november 2024**?"
  - Exempel: "Vad betyder 'rizz' **som blev viralt 2023-2024**?"
- **Exempel**: 
  - ✅ "Vem har flest följare på Instagram i november 2024?"
  - ✅ "Vilken TikTok-trend gick viral under sommaren 2024?"
  - ✅ "Vilken YouTuber är känd för sina gaming-videos 2024?"
  - ✅ "Vad betyder 'rizz' som blev viralt på TikTok 2023-2024?" (fråga OM trendigt slangord)
  - ⚠️ "Vem hade flest följare på Instagram 2023?" (ange året!)
- **INTE**: Historiska frågor om när appar lanserades (det är vuxen-frågor)

### Adults (Vuxna, 25+ år)
- **Innehåll**: Historia, samhälle, vetenskap, komplexa ämnen, teknikhistoria
- **Språk**: Mer avancerat, detaljerat
- **Inriktning**: 🇸🇪 **Svensk fokus** (svensk historia, svenska förhållanden)
- **Exempel**: "Vilket år infördes allmän rösträtt i Sverige?", "Vad är fotosyntesens kemiska formel?", "Vem var Sveriges förste socialdemokratiske statsminister?", "Vilket år lanserades YouTube?"

---

**Viktigt**: En fråga kan tillhöra **flera** åldersgrupper samtidigt!

**Exempel på frågor med flera åldersgrupper:**
```javascript
// Passar både barn OCH ungdom OCH vuxna
{
  question_sv: "Vad heter Sveriges huvudstad?",
  age_groups: "children,youth,adults",
  target_audience: "swedish"  // Children/Adults prioriteras → svensk fokus
}

// Passar både ungdom OCH vuxna
{
  question_sv: "Vilket år lanserades YouTube?",
  age_groups: "youth,adults",
  target_audience: "swedish"  // Adults prioriteras → svensk fokus (teknikhistoria)
}

// Passar endast barn
{
  question_sv: "Hur många ben har en katt?",
  age_groups: "children",
  target_audience: "swedish"  // Barn → svensk fokus
}

// Passar endast ungdom
{
  question_sv: "Vem har flest följare på Instagram i november 2024?",
  age_groups: "youth",
  target_audience: "global"  // Ungdom → global fokus
}
```

**Regler för target_audience vid flera åldersgrupper:**
- Om frågan innehåller **"children" ELLER "adults"** → `target_audience: "swedish"`
- Om frågan ENDAST innehåller **"youth"** → `target_audience: "global"`
- **Prioritet:** Children/Adults övertrumfar Youth för target_audience
- **Resonemang:** Svenska förhållanden ska ha svensk fokus, även om ungdomar också kan svara

---

## Kategorier

**VIKTIGT**: Varje fråga MÅSTE ha minst en kategori! Användare ska kunna filtrera frågor baserat på kategori.

### Kategori-hantering

- **Fast lista**: Kategorier är fördefinierade (listan nedan)
- **Framtida:** Admin UI för att lägga till nya kategorier (se "Framtida Förbättringar")
- **AI-validering:**
  - Om AI väljer en kategori som inte finns → Frågan flaggas för granskning
  - Admin ser: "Okänd kategori: 'Rymdvetenskap'" och kan:
    - Välja närmaste befintlig kategori (t.ex. "Naturvetenskap")
    - Eller skapa ny kategori om det är återkommande behov
- **Kategori-format:** Exakt stavning enligt listan nedan (case-sensitive)

Varje fråga får en eller flera kategorier:

### Huvudkategorier
- **Geografi** - Länder, städer, berg, floder, platser
- **Historia** - Historiska händelser, personer, epoker
- **Naturvetenskap** - Fysik, kemi, biologi
- **Kultur** - Konst, litteratur, musik, film
- **Sport & Idrott** - Olympiska spel, fotboll, alla sporter
- **Natur & Djur** - Djur, växter, klimat, miljö
- **Teknik** - Datorer, uppfinningar, innovation
- **Mat & Dryck** - Matlagning, recept, drycker
- **Gåtor** - Logiska gåtor, tankenötter
- **Samhälle** - Politik, ekonomi, samhällsfrågor

### Sociala Medier & Plattformar (främst för Youth)
- **Social Media** - Allmänt om sociala medier
- **YouTube** - Specifikt om YouTube
- **TikTok** - Specifikt om TikTok
- **Instagram** - Specifikt om Instagram
- **Snapchat** - Specifikt om Snapchat
- **Threads** - Specifikt om Threads
- **Bluesky** - Specifikt om Bluesky
- **Facebook** - Specifikt om Facebook
- **Gaming** - Spel, gaming, e-sport
- **Streaming** - Twitch, streamingtjänster

### Populärkultur (främst för Youth)
- **Film & TV** - Filmer, TV-serier, Netflix, etc.
- **Musik** - Artister, låtar, musikstreaming
- **Kändisar** - Influencers, celebrities
- **Mode** - Trender, kläder, style

**Viktigt**: 
- En fråga kan tillhöra **flera** kategorier samtidigt
- **Alla frågor MÅSTE ha minst EN kategori** (validering krävs!)
- **Kategori-format:** 
  - Kommaseparerade **UTAN mellanslag**: `"Historia,Kultur"` eller `"TikTok,Social Media"`
  - ❌ INTE: `"Historia, Kultur"` (mellanslag gör sökningar svårare)
  - ✅ JA: `"Historia,Kultur"`
  - Exakt stavning enligt listan ovan (case-sensitive)

---

## Frågeformat

Alla frågor finns i **både svenska och engelska versioner**.

Genererade frågor följer detta schema:

```javascript
{
  // === REQUIRED FIELDS (måste alltid finnas) ===
  id: "auto-generated-uuid",                    // REQUIRED - Genereras automatiskt
  
  // SVENSKA VERSION (REQUIRED)
  question_sv: "Frågetext på svenska",          // REQUIRED
  options_sv: [                                  // REQUIRED - Exakt 4 alternativ
    "Alternativ 1",
    "Alternativ 2", 
    "Alternativ 3",
    "Alternativ 4"
  ],
  explanation_sv: "Förklaring av det korrekta svaret",  // REQUIRED
  
  // ENGELSKA VERSION (REQUIRED)
  question_en: "Question text in English",      // REQUIRED
  options_en: [                                  // REQUIRED - Exakt 4 alternativ
    "Option 1",
    "Option 2",
    "Option 3", 
    "Option 4"
  ],
  explanation_en: "Explanation of the correct answer",  // REQUIRED
  
  // Korrekt svar (REQUIRED)
  correct_option: 0,                            // REQUIRED - Index 0-3
  
  // Metadata (REQUIRED)
  age_groups: "youth,adults",                   // REQUIRED - Minst en åldersgrupp
  categories: "Historia,Kultur",                // REQUIRED - Minst en kategori (UTAN mellanslag)
  difficulty: "medium",                         // REQUIRED - easy, medium, hard
  target_audience: "swedish",                   // REQUIRED - "swedish" eller "global"
  
  // AI-info (REQUIRED)
  ai_generation_provider: "openai",             // REQUIRED - Vilken AI som genererade
  
  // Timestamps (REQUIRED)
  created_at: 1730000000000,                   // REQUIRED - Unix timestamp (ms)
  updated_at: 1730000000000,                   // REQUIRED - Unix timestamp (ms)
  
  // === OPTIONAL FIELDS (kan vara null) ===
  
  // Illustration (optional - kan vara null om generering misslyckades)
  illustration_url: "https://cdn.quizter.se/illustrations/abc123.jpg",  // OPTIONAL
  illustration_prompt: "A colorful illustration of...",                  // OPTIONAL
  illustration_provider: "dall-e-3",                                     // OPTIONAL
}
```

### Språk och Inriktning

**Children & Adults:**
- `target_audience: "swedish"` 
- Frågor med svensk fokus (svenska förhållanden, svensk kultur, svensk historia)
- Båda språkversioner genereras automatiskt

**Youth:**
- `target_audience: "global"`
- Frågor med global fokus (internationell kultur, globala trender)
- Båda språkversioner genereras automatiskt

**Exempel:**

```javascript
// BARN-fråga (svensk fokus, båda språk, illustration)
{
  question_sv: "Vad heter Sveriges huvudstad?",
  question_en: "What is the capital of Sweden?",
  options_sv: ["Stockholm", "Göteborg", "Malmö", "Uppsala"],
  options_en: ["Stockholm", "Gothenburg", "Malmö", "Uppsala"],
  age_groups: "children",
  target_audience: "swedish",
  illustration_url: "https://cdn.quizter.se/illustrations/stockholm-child.jpg",
  illustration_prompt: "A colorful, child-friendly illustration of Stockholm with the Royal Palace and colorful buildings",
  illustration_provider: "dall-e-3"
}

// UNGDOMS-fråga (global fokus, vad som händer NU, båda språk)
{
  question_sv: "Vem har flest följare på Instagram i november 2024?",
  question_en: "Who has the most followers on Instagram in November 2024?",
  options_sv: ["Cristiano Ronaldo", "Lionel Messi", "Selena Gomez", "Kylie Jenner"],
  options_en: ["Cristiano Ronaldo", "Lionel Messi", "Selena Gomez", "Kylie Jenner"],
  explanation_sv: "Cristiano Ronaldo har över 640 miljoner följare på Instagram i november 2024, vilket gör honom till den mest följda personen på plattformen.",
  explanation_en: "Cristiano Ronaldo has over 640 million followers on Instagram in November 2024, making him the most followed person on the platform.",
  age_groups: "youth",
  target_audience: "global"
}

// UNGDOMS-fråga - ej aktuell längre, ANGE DATUM
{
  question_sv: "Vilken artist hade flest Spotify-lyssnare per månad i juni 2024?",
  question_en: "Which artist had the most monthly Spotify listeners in June 2024?",
  options_sv: ["Taylor Swift", "The Weeknd", "Drake", "Ed Sheeran"],
  options_en: ["Taylor Swift", "The Weeknd", "Drake", "Ed Sheeran"],
  explanation_sv: "I juni 2024 hade The Weeknd över 110 miljoner månatliga lyssnare på Spotify.",
  explanation_en: "In June 2024, The Weeknd had over 110 million monthly listeners on Spotify.",
  age_groups: "youth",
  target_audience: "global"
}

// UNGDOMS-fråga med trendiga ord
{
  question_sv: "Vad betyder slanguttrycket 'rizz' på sociala medier 2024?",
  question_en: "What does the slang term 'rizz' mean on social media in 2024?",
  options_sv: ["Karisma/charm", "Att vara cool", "Att ljuga", "Att skratta"],
  options_en: ["Charisma/charm", "Being cool", "To lie", "To laugh"],
  explanation_sv: "'Rizz' är en förkortning av 'charisma' och används för att beskriva någons förmåga att charma eller flörta. Ordet blev viralt på TikTok 2023-2024.",
  explanation_en: "'Rizz' is short for 'charisma' and is used to describe someone's ability to charm or flirt. The word went viral on TikTok in 2023-2024.",
  age_groups: "youth",
  target_audience: "global"
}

// VUXEN-fråga (svensk fokus, teknikhistoria, båda språk)
{
  question_sv: "Vilket år lanserades YouTube?",
  question_en: "What year was YouTube launched?",
  options_sv: ["2003", "2004", "2005", "2006"],
  options_en: ["2003", "2004", "2005", "2006"],
  age_groups: "adults",
  target_audience: "swedish"
}

// VUXEN-fråga (svensk fokus, båda språk)
{
  question_sv: "Vilket år infördes allmän rösträtt i Sverige?",
  question_en: "What year was universal suffrage introduced in Sweden?",
  options_sv: ["1918", "1919", "1920", "1921"],
  options_en: ["1918", "1919", "1920", "1921"],
  age_groups: "adults",
  target_audience: "swedish"
}
```

---

## AI-Kategorisering

AI:n analyserar varje fråga och bestämmer automatiskt:

### 1. Åldersgrupper

AI:n tittar på:
- Språknivå och ordval
- Ämnesområde och komplexitet
- Kunskapskrav för att svara rätt

**Exempel:**
```
Fråga: "Vem har flest följare på Instagram i november 2024?"
→ AI bestämmer: ["youth"]
→ target_audience: "global"
Resonemang: "Aktuell fråga om sociala medier-trender med specifikt datum, passar ungdomar"
```

```
Fråga: "Vilken artist hade flest Spotify-lyssnare i juni 2024?"
→ AI bestämmer: ["youth"]
→ target_audience: "global"
Resonemang: "Fråga om sociala medier-statistik med tydligt angivet datum eftersom det inte är aktuellt längre"
```

```
Fråga: "Vilket år lanserades YouTube?"
→ AI bestämmer: ["adults"]
→ target_audience: "swedish"
Resonemang: "Frågan om teknikhistoria passar vuxna, svensk kontext"
```

```
Fråga: "Vad heter Sveriges kung?"
→ AI bestämmer: ["children", "youth"]
→ target_audience: "swedish" (eftersom children/adults prioriteras)
Resonemang: "Frågan om svensk kultur passar barn och ungdomar"
```

### 2. Kategorier

AI:n identifierar alla relevanta kategorier:

**Exempel:**
```
Fråga: "Vilken svensk fotbollsspelare har flest följare på Instagram?"
→ AI bestämmer: ["Sport", "Instagram", "Idrott"]
Resonemang: "Frågan kombinerar sport/fotboll med sociala medier"
```

### 3. Svårighetsgrad

Om inte specificerad, väljer AI:n automatiskt:
- **Easy**: Allmän kännedom, enkla fakta
- **Medium**: Kräver viss bildning eller intresse
- **Hard**: Specialkunskap, mindre kända fakta

---

## Progress & Background Tasks

Fråggenerering körs som ett bakgrundsjobb. Se [BACKGROUND_TASK_SYSTEM.md](BACKGROUND_TASK_SYSTEM.md) för detaljer.

### Progress-faser

1. **10%** - Preparing AI request
2. **30%** - Generating questions with [provider]
3. **50%** - Validating questions (AI validation)
4. **70%** - Saving to database
5. **85%** - Generating illustrations (X/Y completed)
6. **100%** - Complete

**Tidsuppskattningar:**
- 10 frågor: ~30-45 sekunder
- 20 frågor: ~60-90 sekunder
- 50 frågor: ~2-3 minuter

**Flaskhalsar:**
- Illustration-generering: 5-15 sek per fråga (längst tid)
- AI-validering: 2-5 sek per fråga
- Dublettkontroll: 1-3 sek per fråga

### Real-time Updates

Frontend kan prenumerera på progress via SSE:

```javascript
GET /api/subscribeToTask?taskId=task_123

// Events:
// - update: Progress update (10%, 30%, 70%)
// - complete: Task finished successfully
// - error: Task failed
```

---

## Exempel: Komplett Generering

### 1. Request
```javascript
POST /api/generateAIQuestions

{
  "amount": 5,
  "category": "Historia",
  "ageGroup": "youth", 
  "difficulty": "medium",
  "provider": "gemini"
}
```

### 2. Svar
```json
{
  "success": true,
  "taskId": "task_1730000000_abc123"
}
```

### 3. Subscribe till Progress
```javascript
const eventSource = new EventSource(
  '/api/subscribeToTask?taskId=task_1730000000_abc123'
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'update') {
    console.log(`Progress: ${data.task.progress}%`);
    console.log(data.task.description);
  }
  
  if (data.type === 'complete') {
    console.log('Done!', data.task.result);
    eventSource.close();
  }
};
```

### 4. Resultat
```javascript
{
  success: true,
  questionsGenerated: 5,
  questions: [
    {
      id: "q_abc123",
      question_sv: "Vilket år slutade andra världskriget?",
      question_en: "What year did World War II end?",
      options_sv: ["1943", "1944", "1945", "1946"],
      options_en: ["1943", "1944", "1945", "1946"],
      correct_option: 2,
      explanation_sv: "Andra världskriget slutade 1945 med Tysklands kapitulation i maj och Japans kapitulation i augusti.",
      explanation_en: "World War II ended in 1945 with Germany's surrender in May and Japan's surrender in August.",
      age_groups: "youth,adults",
      categories: "Historia",
      difficulty: "medium",
      target_audience: "swedish",
      ai_generation_provider: "gemini",
      ai_validation_providers: ["openai", "anthropic"],
      ai_confidence_score: 95,
      manual_review_status: null,
      manual_reviewer_id: null,
      manual_review_date: null,
      reported_by_user_id: null,
      report_reason: null,
      report_date: null,
      is_potential_duplicate: false,
      duplicate_of_question_id: null,
      duplicate_check_date: null,
      times_shown: 0,
      times_correct: 0,
      times_incorrect: 0,
      actual_difficulty: null,
      popularity_score: 0,
      user_feedback_positive: 0,
      user_feedback_negative: 0,
      content_filter_flagged: false,
      content_filter_reason: null,
      requires_seasonal_update: false,
      last_seasonal_check: null,
      illustration_url: "https://cdn.quizter.se/illustrations/ww2-end.jpg",
      illustration_prompt: "A historical illustration showing the end of World War II in 1945",
      illustration_provider: "dall-e-3",
      deleted_at: null,
      deleted_by_user_id: null,
      deletion_reason: null
    },
    // ... 4 more questions
  ]
}
```

---

## Best Practices

### För Bästa Resultat

✅ **GÖR:**
- Specificera tydlig kategori (ger mer relevanta frågor)
- Välj rätt åldersgrupp för din målgrupp
- Använd `random` provider för variation
- Generera 5-20 frågor åt gången (snabbare än 50)
- För **children/adults**: AI genererar svensk fokus automatiskt
- För **youth**: AI genererar global fokus automatiskt
- Låt auto-godkännande hantera frågor med hög konfidenspoäng (>=90%)
- Granska innehållsfilter-flaggade frågor manuellt
- Kontrollera säsongsuppdateringar för youth-frågor regelbundet
- **För Youth-frågor - VAR AKTUELL:**
  - ✅ Använd "i november 2024" eller "2024" för nutidsfrågor
  - ✅ Ange specifikt datum om frågan inte är aktuell längre: "i juni 2024", "under 2023"
  - ✅ Uppdatera siffror och fakta till senaste tillgängliga data
  - ✅ Frågor kan handla om trendiga ord/uttryck (ange när de blev virala!)
  - ✅ Exempel: "Vem har flest följare på Instagram **i november 2024**?"
  - ✅ Exempel: "Vad betyder 'rizz' **som blev viralt 2023-2024**?"
  - ❌ Undvik vaga tidsangivelser som "idag" eller "just nu"

❌ **UNDVIK:**
- Generera för många frågor samtidigt (>50)
- Blanda olika åldersgrupper i samma batch
- Använda provider utan API-nyckel
- Ignorera frågor med låg konfidenspoäng (<70%)
- Ignorera negativ användar-feedback
- **För Youth-frågor:**
  - ❌ Frågor utan tidsangivelse: "Vem har flest följare?" (när var det?)
  - ❌ Föråldrad data utan datum: "Taylor Swift har 500M följare" (när?)
  - ❌ Historiska frågor: "Vilket år lanserades TikTok?" (det är Adults!)

### Kvalitetskontroll

Efter generering:
1. **Innehållsfilter körs automatiskt** vid generering
2. **Dublettkontroll körs automatiskt** vid generering
3. **AI-Validering körs automatiskt** (om flera providers finns)
4. **Konfidenspoäng beräknas** automatiskt
5. **Auto-godkännande** om konfidenspoäng >= 90%
6. **Granska frågor i Admin UI** (manuell granskning vid behov)
7. Godkänn eller underkänn varje fråga
8. **Hantera anmälda frågor** (i karantän)
   - Se vilka användare som anmält
   - Läs anmälningsorsaker (inklusive dubletter)
   - Kontrollera användar-feedback (👍👎 ratio)
   - Editera frågan om behövs
   - Godkänn eller underkänn
9. **Hantera potentiella dubletter**
   - Granska frågor markerade som möjliga dubletter
   - Jämför med original-frågan
   - Välj vilken som ska behållas
10. **Granska flaggade innehåll**
    - Se frågor flaggade av innehållsfilter
    - Läs anledning till flaggning
    - Godkänn eller underkänn
11. **Granska svårighetsgrad**
    - Se frågor där `actual_difficulty` skiljer från `difficulty`
    - Baserat på faktiska spelarsvar
    - Uppdatera vid behov
12. **Youth-frågor säsongsuppdatering**
    - Granska frågor som behöver uppdateras (>6 mån gamla)
    - Uppdatera datum och fakta
    - Eller underkänn om inte längre relevant
13. Kontrollera att kategorier stämmer
14. Verifiera att åldersgrupper är rimliga
15. **Kontrollera att target_audience är korrekt:**
    - Children/Adults → `target_audience: "swedish"`
    - Youth → `target_audience: "global"`
16. **Verifiera att båda språkversionerna finns:**
    - `question_sv` och `question_en`
    - `options_sv` och `options_en`
    - `explanation_sv` och `explanation_en`
17. Kontrollera validering:
    - Se vilken provider som genererade (`ai_generation_provider`)
    - Se vilka providers som validerade (`ai_validation_providers`)
    - Se konfidenspoäng (`ai_confidence_score`)
    - Sätt manuell status (`manual_review_status`)
18. Testa några frågor själv

**Kom ihåg:** Manuell granskning är HÖGST I RANG - din godkännande eller underkännande är det som räknas!

---

## Troubleshooting

### Frågor får fel åldersgrupp

→ AI:ns bedömning baseras på innehåll och språk. Du kan manuellt ändra i Admin UI.

### Frågor saknar kategori

→ **Detta ska INTE kunna hända!** Alla frågor MÅSTE ha minst en kategori.
→ Om det ändå händer: AI-genereringsfel. Regenerera frågan eller lägg till kategori manuellt i Admin UI.

### Frågor har fel kategorier

→ AI:ns kategorisering kan ibland missa. Redigera kategorier manuellt i Admin UI.
→ Kom ihåg: Frågor kan ha FLERA kategorier - lägg till alla relevanta!

### "Provider not configured"

→ Kontrollera att API-nyckeln är satt i Cloudflare Secrets.

### Frågor på engelska istället för svenska

→ Detta borde inte hända. **Alla frågor ska ha BÅDE svenska och engelska versioner**. Rapportera som bug om någon version saknas.

### Fel target_audience

→ Kontrollera att:
- **Children/Adults-frågor** har `target_audience: "swedish"` (svensk fokus)
- **Youth-frågor** har `target_audience: "global"` (global fokus)

### Saknar engelsk eller svensk version

→ **Alla frågor måste ha båda språk.** Om någon version saknas är det ett AI-genereringsfel. Regenerera frågan.

---

## ❓ Vanliga Frågor (FAQ)

### Generering

**Q: Vad händer om dublettkontrollen hittar en dublett?**  
A: Frågan slängs automatiskt och en ny genereras istället. Admin behöver inte ingripa.

**Q: Kan jag lita på auto-godkända frågor?**  
A: Ja! Auto-godkända frågor har konfidenspoäng >=90%, validerats av flera providers, passerat innehållsfilter och dublettkontroll. Men admin kan fortfarande granska och ändra.

**Q: Vad händer om innehållsfiltret flaggar en fråga?**  
A: Frågan går automatiskt till manuell granskning och visas INTE för spelare förrän admin godkänt den.

### Kvalitet

**Q: Hur vet jag vilka frågor som behöver granskas?**  
A: Admin UI visar frågor som:
- Har låg konfidenspoäng (<70%)
- Flaggats av innehållsfilter
- Anmälts av användare (i karantän)
- Har hög negativ feedback (>30%)
- Behöver säsongsuppdatering (Youth, >6 mån)

**Q: Vad händer om spelare anmäler en fråga?**  
A: Frågan sätts i karantän och visas INTE för andra spelare. Batch-validering startar automatiskt för relaterade frågor. Admin granskar och beslutar.

**Q: Kan jag se vilken AI som genererade en fråga?**  
A: Ja! Varje fråga har `ai_generation_provider` och `ai_validation_providers` som visar exakt vilka AI:er som var inblandade.

**Q: Vad händer med raderade frågor?**  
A: Frågor "soft deletas" - de visas inte för spelare eller i admin-listan, men finns kvar i databasen. De används fortfarande i dublettkontroll för att förhindra att samma fråga genereras igen. Admin kan återställa raderade frågor.

**Q: Kan raderade frågor återställas?**  
A: Ja! Admin kan se raderade frågor (toggle "Visa raderade") och återställa dem. Endast "hard delete" är permanent, men det kräver speciella rättigheter och används endast för känsligt innehåll.

### Användning

**Q: Vad händer om illustration-genereringen misslyckas?**  
A: Frågan sparas ändå men utan illustration. Admin får notifiering och kan regenerera illustrationen senare. Frågor utan illustration kan fortfarande visas för spelare.

**Q: Kan admin ändra illustrationen?**  
A: Ja! Admin kan:
- Regenerera med AI (ny prompt)
- Ladda upp egen bild
- Ta bort illustration
- Se illustration-prompt för att förstå hur den genererades

**Q: Vilka frågor ser spelarna?**  
A: Endast frågor med:
- Konfidenspoäng >=70% OCH inga flaggor (innehållsfilter, dublett, etc.) OCH inte raderade ELLER
- Manuellt godkända OCH inte raderade

**Visas INTE:**
- Konfidenspoäng <70% (om inte manuellt godkända)
- Innehållsfilter-flaggade
- I karantän (anmälda eller hög negativ feedback)
- Möjliga dubletter
- Underkända
- Raderade frågor (`deleted_at IS NOT NULL`)

**Q: Vad händer om en godkänd fråga får mycket negativ feedback?**  
A: Vid >30% negativ feedback sätts frågan automatiskt i karantän och visas INTE längre för spelare. Admin måste granska och antingen editera+återgodkänna eller underkänna.

**Q: Hur fungerar svårighetsgrad-kalibrering?**  
A: Systemet spårar hur många som svarar rätt. Efter minst 50 visningar beräknas `actual_difficulty`. Efter 100+ visningar justeras `difficulty` automatiskt om stor skillnad. Exempel: "hard" som 95% klarar blir automatiskt "easy".  
A: Varje vecka flaggas Youth-frågor >6 månader gamla för uppdatering. De visas fortfarande för spelare tills admin uppdaterar eller underkänner dem.

**Q: Hur fungerar kategori-filter för spelare?**  
A: Spelare väljer favoritkategorier. "Personal Quiz" ger 80% frågor från deras favoriter, 20% random. "Surprise Quiz" ignorerar preferenser.

### Automatisering

**Q: Vad körs automatiskt utan admin-inblandning?**  
A:
- Dublettkontroll vid generering
- Innehållsfilter
- AI-validering
- Konfidenspoäng-beräkning
- Auto-godkännande (>=90%)
- Batch-validering vid anmälan
- Svårighetsgrad-kalibrering (varje natt)
- Säsongsuppdatering-flaggning (varje vecka)
- Youth-fråggenerering (varje månad)

**Q: När måste admin ingripa?**  
A: Endast för:
- Frågor med låg konfidenspoäng (<70%)
- Innehållsfilter-flaggade frågor
- Anmälda frågor (i karantän)
- Potentiella dubletter
- Youth-frågor som behöver uppdatering

---

## API Secrets

Konfigurera i Cloudflare Dashboard → Workers & Pages → quizter → Settings → Variables:

**Production:**
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `ANTHROPIC_API_KEY`
- `MISTRAL_API_KEY`

**Preview:**
Samma secrets behöver sättas för preview-miljön också.

---

## Relaterad Dokumentation

- [BACKGROUND_TASK_SYSTEM.md](BACKGROUND_TASK_SYSTEM.md) - Hur background tasks fungerar
- [D1_DATABASE_SETUP.md](D1_DATABASE_SETUP.md) - Database schema för questions

---

**Senast uppdaterad:** 2025-11-05

---

## 💡 Framtida Förbättringar (Ej Implementerade)

Dessa funktioner kan övervägas för framtida versioner:

### Provider-hantering (UI)

**Gränssnitt för att hantera AI-providers:**
- Admin UI för att lägga till/ta bort providers
- Konfigurera API-nycklar direkt i UI (istället för Cloudflare Secrets)
- **Säkerhet:**
  - API-tokens sparas **hashade** i databasen (ej klartext)
  - Använd bcrypt eller liknande för hashing
  - Tokens visas aldrig i UI efter sparande
  - Endast "Token sparad ✓" eller "Token inte konfigurerad ✗"
- **Funktioner:**
  - Aktivera/inaktivera providers
  - Testa provider-anslutning ("Test Connection")
  - Se provider-statistik (användning, kostnader, framgångsfrekvens)
  - Sätt default provider
  - Prioritera providers (1. OpenAI, 2. Gemini, 3. Anthropic)

**Databas-schema (framtida):**
```javascript
providers_table: {
  id: "uuid",
  name: "openai" | "gemini" | "anthropic" | "mistral",
  display_name: "OpenAI GPT-4",
  api_key_hash: "hashed_token",  // Hashad med bcrypt
  is_active: true,
  is_default: false,
  priority_order: 1,
  created_at: timestamp,
  updated_at: timestamp
}
```

### Frågegenereringsregler (UI)

**Gränssnitt för att konfigurera hur frågor genereras:**

- **Per åldersgrupp (Children, Youth, Adults):**
  - Språknivå (enkla ord, modernt språk, avancerat)
  - Fokus (svensk/global)
  - Exempel-prompt som AI:n får
  - Min/max ord i fråga
  - Min/max ord i förklaring
  - Prefererade kategorier
  
- **Per kategori:**
  - Specifika instruktioner till AI
  - Exempel på bra frågor
  - Exempel på dåliga frågor (vad man ska undvika)
  
- **Globala regler:**
  - Tonfallsinstruktioner
  - Illustration-stil per åldersgrupp
  - Svårighetsgrad-definitioner
  - Språkspecifika regler

**Exempel på konfigurerbart prompt-system:**
```javascript
generation_rules: {
  age_group: "youth",
  rules: {
    language_level: "modern, casual",
    focus: "global",
    max_question_words: 25,
    max_explanation_words: 50,
    preferred_categories: ["Social Media", "Gaming", "TikTok"],
    custom_instructions: "Focus on current trends from 2024-2025. Always include specific dates. Use examples from popular culture.",
    illustration_style: "Modern, vibrant, trendy aesthetic",
    example_good_questions: [
      "Vem har flest följare på Instagram i november 2024?",
      "Vilket spel vann Game of the Year 2024?"
    ],
    example_bad_questions: [
      "Vilket år lanserades Instagram?",  // För historiskt
      "Vem har flest följare?"  // Saknar datum
    ]
  }
}
```

**UI-funktioner:**
- Visuell editor för genereringsregler
- Test-knapp: "Generera exempel-fråga med dessa regler"
- Versionering av regler (se historik, återställ)
- Import/export av regeluppsättningar
- A/B-testning: Jämför olika regeluppsättningar

**Databas-schema (framtida):**
```javascript
generation_rules_table: {
  id: "uuid",
  age_group: "children" | "youth" | "adults",
  category: "Historia" | "Social Media" | null,  // null = gäller alla kategorier
  rules: {
    language_level: string,
    focus: "swedish" | "global",
    max_question_words: number,
    max_explanation_words: number,
    custom_instructions: string,
    illustration_style: string,
    example_good_questions: string[],
    example_bad_questions: string[]
  },
  is_active: true,
  version: 1,
  created_at: timestamp,
  updated_at: timestamp,
  created_by_user_id: string
}
```

**Fördelar:**
- Flexibilitet utan kod-ändringar
- Snabb iteration på fråge-kvalitet
- Anpassning per målgrupp
- Enklare att finjustera AI-prompts
- Historik över vad som fungerat bäst

### Avancerad Analys
- **Provider-statistik**: Spåra vilken AI-provider som genererar bäst frågor baserat på anmälningar och godkännanden
- **Duplett-score**: Istället för binärt (dublett/inte), ge likhetsscore 0-100% med justerbar tröskel
- **Popularitets-ranking**: Prioritera populära frågor i quiz-generering

### Adaptiv Spelupplevelse  
- **Fråge-kedjor**: Om spelare svarar rätt på svår fråga → bonusfråga, vid fel → lättare fråga
- **Personlig svårighetsgrad**: Adaptiv svårighet baserat på spelarprestanda över tid

### Community Features
- **Community-skapade frågor**: Låt användare föreslå frågor som AI validerar och kategoriserar automatiskt
- **Rapportera dublett med förslag**: När användare rapporterar dublett, låt dem markera vilket som är originalet

---

**Observera:** Ovanstående är framtida idéer. Huvudfunktionaliteten finns beskriven i resten av dokumentet.

````
