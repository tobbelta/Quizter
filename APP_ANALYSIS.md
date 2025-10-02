# Teknisk Analys av Applikationen "RouteQuest"

Detta dokument beskriver arkitekturen och funktionaliteten för applikationen `routequest`. Analysen är baserad på en genomgång av källkoden i både frontend- och backend-delarna.

## 1. Översikt

RouteQuest är en webbaserad applikation för att skapa och delta i digitala tipspromenader eller "runs". Användare kan skapa en rutt på en karta, lägga till frågor och bjuda in deltagare. Appen är designad för att fungera på både datorer och mobila enheter, med möjlighet att paketeras som en native-app via Capacitor.

Kärnfunktionaliteten inkluderar:
- Skapande av kartbaserade tipspromenader ("runs").
- AI-driven generering av frågor.
- Deltagande i runs via en unik kod.
- Resultathantering och poängräkning.
- Betalningslösning via Stripe.
- Avancerade administrationsvyer för "SuperUsers".

## 2. Teknikstack

Applikationen är byggd med moderna webbteknologier.

- **Frontend:**
  - **Ramverk:** React (v18)
  - **Routing:** React Router (v6)
  - **Kartor:** Leaflet & React-Leaflet
  - **Styling:** TailwindCSS
  - **Byggverktyg:** Create React App (react-scripts)

- **Backend:**
  - **Plattform:** Firebase (Cloud Functions, Firestore, Authentication, Hosting)
  - **Språk:** Node.js
  - **AI-tjänster:** Anthropic (Claude) och OpenAI (som fallback) för frågegenerering.

- **Betalningar:**
  - **Leverantör:** Stripe (via `stripe-js` och Stripe API)

- **Mobil App:**
  - **Ramverk:** Capacitor (konfigurerat för iOS och Android)

## 3. Arkitektur

### Frontend

Frontend-koden är strukturerad i `src`-katalogen och följer en komponentbaserad arkitektur.

- **`App.js`:** Applikationens huvudkomponent som konfigurerar routing och globala providers.
- **`views/`:** Innehåller alla sidkomponenter som mappas till en specifik URL (t.ex. `LandingPage.js`, `CreateRunPage.js`, `PlayRunPage.js`).
- **`components/`:** Innehåller återanvändbara UI-komponenter (t.ex. kartor, dialogrutor, knappar).
- **`services/`:** Innehåller affärslogik som är oberoende av UI, t.ex. `questionService.js`, `paymentService.js`.
- **`context/`:** Använder React Context för global state management.
  - `AuthContext.js`: Hanterar användarens autentiseringsstatus, inklusive SuperUser-roll.
  - `RunContext.js`: Hanterar tillståndet för den aktiva tipspromenaden.
- **`gateways/`:** Ansvarar för kommunikationen med datakällor, primärt Firestore (t.ex. `firestoreRunGateway.js`).
- **`firebaseClient.js`:** En centraliserad modul för att initialisera och konfigurera Firebase-tjänster (Auth, Firestore) för frontend. Den hanterar även anslutning till lokala emulatorer för utveckling.

### Backend

Backend är implementerad som serverlösa funktioner med Firebase Cloud Functions.

- **`functions/index.js`:** Huvudfilen som definierar alla backend-endpoints.
- **Endpoints:**
  - **Spelflöde:** Funktioner som `createRun`, `joinRun`, `submitAnswer` är definierade men ännu inte implementerade (returnerar `501 Not Implemented`).
  - **AI-funktioner:**
    - `generateAIQuestions`: En HTTP-funktion för att manuellt generera frågor med Anthropic/OpenAI och spara dem i Firestore.
    - `questionImport`: En schemalagd funktion som körs var 6:e timme för att automatiskt fylla på med nya frågor.
  - **Betalningar:**
    - `createPaymentIntent`: En HTTP-funktion som skapar en betalningsavsikt med Stripe.
  - **Status:**
    - `getAIStatus`: En HTTP-funktion för att kontrollera status och tillgänglighet för AI-tjänsterna.
- **`functions/services/`:** Innehåller logiken för att kommunicera med AI-API:erna (`aiQuestionGenerator.js`, `openaiQuestionGenerator.js`).

### Databas

Applikationen använder Firestore, en NoSQL-databas från Firebase. De primära datamodellerna (collections) verkar vara:
- `runs`: Lagrar information om varje tipspromenad (rutt, frågor, deltagare, admin).
- `questions`: En samling av frågor som kan användas i runs. Dessa genereras av AI-funktionerna.
- `users`: Hanteras av Firebase Authentication, med ytterligare användardata (som roller) troligen lagrad i en `users`-collection i Firestore.

## 4. Kärnfunktioner

### Skapa & Hantera Runs
En användare kan generera en ny "run". Detta flöde är ännu inte fullt implementerat i backend, men frontend-vyerna (`GenerateRunPage.js`, `RunAdminPage.js`) finns på plats.

### Spela en Run
Deltagare kan ansluta till en run via `/join` och spela den via `/run/:runId/play`. Spelupplevelsen involverar att följa en rutt på en karta och svara på frågor.

### AI-frågegenerering
En av de mest utbyggda funktionerna. Appen kan automatiskt eller manuellt skapa nya frågor med hjälp av avancerade AI-modeller. Detta säkerställer ett konstant flöde av nytt innehåll.

### Betalningar
Integrationen med Stripe är robust. Backend kan skapa en `PaymentIntent`, och frontend har komponenter för att hantera betalningsflödet (`PaymentModal.js`). Detta används troligen för att ta betalt för att skapa eller delta i en run.

### Användarhantering & SuperUser
Appen har ett komplett system för användarregistrering och inloggning via Firebase Auth. Det finns även en "SuperUser"-roll som ger tillgång till särskilda administrationssidor för att hantera hela systemet, inklusive alla runs, användare och frågor.

## 5. Bygge & Deployment

- **Bygge:** Frontend-appen byggs med `npm run build` (`react-scripts`).
- **Deployment:**
  - **Frontend:** Sannolikt deployad via Firebase Hosting.
  - **Backend:** Funktionerna deployas med `firebase deploy --only functions`.
