# Teknisk Analys av Applikationen "RouteQuest"

Detta dokument beskriver arkitekturen och funktionaliteten för applikationen `routequest`. Analysen är baserad på en genomgång av källkoden i både frontend- och backend-delarna.

## 1. Översikt

RouteQuest är en webbaserad applikation för att skapa och delta i digitala tipspromenader eller "rundor". Användare kan skapa en rutt på en karta, lägga till frågor och bjuda in deltagare. Appen är designad för att fungera på både datorer och mobila enheter, med möjlighet att paketeras som en native-app via Capacitor.

Kärnfunktionaliteten inkluderar:
- Skapande av kartbaserade tipspromenader ("rundor").
- AI-driven generering av frågor.
- Deltagande i rundor via en unik kod.
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
- **`views/`:** Innehåller alla sidkomponenter som mappas till en specifik URL (t.ex. `LandingPage.js`, `GenerateRunPage.js`, `PlayRunPage.js`).
- **`components/`:** Innehåller återanvändbara UI-komponenter (t.ex. kartor, dialogrutor, knappar).
- **`services/`:** Innehåller affärslogik som är oberoende av UI, t.ex. `questionService.js`, `paymentService.js`, `runFactory.js`.
- **`context/`:** Använder React Context för global state management.
  - `AuthContext.js`: Hanterar användarens autentiseringsstatus, inklusive SuperUser-roll.
  - `RunContext.js`: Hanterar tillståndet för den aktiva rundan och innehåller logik för att skapa rundor.
- **`gateways/`:** Ansvarar för kommunikationen med datakällor, primärt Firestore (t.ex. `firestoreRunGateway.js`).
- **`firebaseClient.js`:** En centraliserad modul för att initialisera och konfigurera Firebase-tjänster (Auth, Firestore) för frontend. Den hanterar även anslutning till lokala emulatorer för utveckling.

### Backend

Backend är implementerad som serverlösa funktioner med Firebase Cloud Functions och används för processer som kräver en säker servermiljö.

- **`functions/index.js`:** Huvudfilen som definierar alla backend-endpoints.
- **Endpoints:**
  - **AI-funktioner:**
    - `generateAIQuestions`: En HTTP-funktion för att manuellt generera frågor med Anthropic/OpenAI och spara dem i Firestore.
    - `questionImport`: En schemalagd funktion som körs var 6:e timme för att automatiskt fylla på med nya frågor.
  - **Betalningar:**
    - `createPaymentIntent`: En HTTP-funktion som skapar en betalningsavsikt med Stripe.
  - **Status:**
    - `getAIStatus`: En HTTP-funktion för att kontrollera status och tillgänglighet för AI-tjänsterna.
  - **Spelflöde (Oanvända):** Funktioner som `createRun`, `joinRun` etc. finns definierade i backend men är för närvarande inte implementerade eller används inte. Appen hanterar denna logik direkt från klientsidan.
- **`functions/services/`:** Innehåller logiken för att kommunicera med AI-API:erna (`aiQuestionGenerator.js`, `openaiQuestionGenerator.js`).

### Databas

Applikationen använder Firestore, en NoSQL-databas från Firebase. De primära datamodellerna (collections) är:
- `runs`: Lagrar information om varje runda (rutt, frågor, deltagare, admin).
- `questions`: En samling av frågor som kan användas i rundor. Dessa genereras av AI-funktionerna.
- `users`: Hanteras av Firebase Authentication, med ytterligare användardata (som roller) troligen lagrad i en `users`-collection i Firestore.

## 4. Kärnfunktioner

### Skapa & Hantera Rundor
En användare kan generera en ny "runda" via `GenerateRunPage`. **Detta är en klientsidig process.** Logiken i `RunContext` och `runFactory.js` bygger ett komplett runda-objekt (med rutt och frågor). Därefter sparar `firestoreRunGateway.js` den nya rundan direkt i Firestore. Anonyma användares rundor sparas temporärt i webbläsarens `localStorage`.

### Spela en Runda
Deltagare kan ansluta till en runda via `/join` och spela den via `/run/:runId/play`. Spelupplevelsen involverar att följa en rutt på en karta och svara på frågor.

### AI-frågegenerering
En av de mest utbyggda funktionerna. Appen kan via backend anropa AI-modeller (Anthropic/OpenAI) för att automatiskt eller manuellt skapa nya frågor. Detta säkerställer ett konstant flöde av nytt innehåll till `questions`-collectionen.

### Betalningar
Integrationen med Stripe är robust. Backend kan skapa en `PaymentIntent`, och frontend har komponenter för att hantera betalningsflödet (`PaymentModal.js`). Detta används som en frivillig donation efter att en runda har skapats.

### Användarhantering & SuperUser
Appen har ett komplett system för användarregistrering och inloggning via Firebase Auth. Det finns även en "SuperUser"-roll som ger tillgång till särskilda administrationssidor för att hantera hela systemet, inklusive alla rundor, användare och frågor.

### Statistik & Analys
Applikationen har ett inbyggt system för att spåra användarinteraktioner.
- **Insamling:** Logik i `src/services/analyticsService.js` ansvarar för att logga händelser som `page_view`, `create_run`, och `donation` till en `analytics`-collection i Firestore. Varje händelse sparas med ett unikt enhets-ID och kan senare kopplas till en inloggad användare.
- **Presentation:** Sidan `src/views/SuperUserAnalyticsPage.js` (endast för SuperUsers) visualiserar denna data. Den visar både en översikt med nyckeltal (totala besök, unika enheter etc.) och en detaljerad, filtrerbar lista över de senaste händelserna.

### Meddelandehantering (Admin till Användare)
Appen inkluderar ett system för envägskommunikation från administratörer (SuperUsers) till användare.
- **Administration:** Via `SuperUserMessagesPage.js` kan en admin skriva och skicka meddelanden.
- **Målgrupp:** Meddelanden kan riktas till alla användare, en specifik användare (via `userId`), eller en specifik enhet (via `deviceId`).
- **Användarvy:** Användare ser meddelanden i en dropdown-meny (`MessagesDropdown.js`), som visar olästa meddelanden och en lista över mottagna notiser.
- **Logik:** All logik hanteras av `messageService.js` som interagerar med en `messages`-collection i Firestore.

## 5. Bygge & Deployment

- **Bygge:** Frontend-appen byggs med `npm run build` (`react-scripts`).
- **Deployment:**
  - **Frontend:** Sannolikt deployad via Firebase Hosting.
  - **Backend:** Funktionerna deployas manuellt med `firebase deploy --only functions`.

## 6. Säkerhetsanalys (2025-10-02)

### Identifierade Säkerhetsrisker

1. **Hårdkodad API-nyckel (Medel Risk)**
   - **Plats:** `src/services/routeService.js:6`
   - **Problem:** OpenRouteService API-nyckeln är hårdkodad som fallback-värde
   - **Risk:** Nyckeln exponeras i källkoden och kan missbrukas om repositoryt är publikt
   - **Rekommendation:** Ta bort fallback-värdet och kräv att miljövariabeln alltid är satt

2. **Klientsidig Rund-skapande (Hög Risk)**
   - **Plats:** `src/services/runFactory.js`, `src/context/RunContext.js`
   - **Problem:** All logik för att skapa rundor körs på klienten innan data sparas i Firestore
   - **Risk:** Tekniskt kunniga användare kan manipulera:
     - `questionCount` (skapa rundor med för många/få frågor)
     - `lengthMeters` (skapa extremt långa/korta rundor)
     - `questionIds` (referera till icke-existerande frågor)
     - Metadata som `createdBy`, `createdAt`
   - **Rekommendation:** Implementera backend-validering (se ACTION_PLAN.md)

3. **Saknade Firestore Security Rules**
   - **Problem:** Okänt om robusta security rules finns för `runs`, `questions`, `messages`, `feedback` collections
   - **Risk:** Utan strikta rules kan användare potentiellt:
     - Läsa privata rundor
     - Modifiera andras rundor
     - Ta bort rundor de inte äger
   - **Rekommendation:** Granska och förstärk firestore.rules

### Säkerhetsåtgärder som Finns

1. **CORS-konfiguration:** Backend har korrekt CORS-setup med whitelisting av tillåtna domäner
2. **Firebase Authentication:** Användarhantering via Firebase Auth med stöd för roller (SuperUser)
3. **API-nyckelparametrar:** Känsliga nycklar (Stripe, Anthropic, OpenAI) hanteras via Firebase Functions parameters
4. **Method validation:** Backend-funktioner validerar HTTP-metoder (ensurePost)
5. **Input validation:** Partiell validering i backend för AI-frågor och betalningar

## 7. Prestandaanalys

### Optimeringsmöjligheter

1. **Route Caching**
   - **Nuvarande:** Varje rund-skapande anropar OpenRouteService API
   - **Problem:** Slösar API-krediter och skapar onödig latens
   - **Lösning:** Cacha rutter baserat på `origin + lengthMeters + checkpointCount` i localStorage

2. **Question Loading**
   - **Nuvarande:** `questionService.listAll()` hämtar alla frågor från Firestore vid varje rund-skapande
   - **Problem:** Onödiga Firestore-läsningar
   - **Lösning:** Implementera caching med TTL (Time To Live)

3. **Bundle Size**
   - **Dependencies:** Leaflet, React-Leaflet, Firebase, Stripe är stora bibliotek
   - **Lösning:** Överväg code splitting och lazy loading för vissa vyer

## 8. Kodkvalitet och Underhåll

### Styrkor

1. **Välstrukturerad arkitektur:** Tydlig separation mellan services, components, views, gateways
2. **Omfattande loggning:** Särskilt i `routeService.js` och `runFactory.js` med utvecklingsloggar
3. **Fallback-hantering:** Robust hantering när externa tjänster misslyckas (route, AI)
4. **Kommenterad kod:** Bra JSDoc-kommentarer i nyckelfiler

### Förbättringsområden

1. **Felhantering:** Vissa funktioner kastar generiska fel utan specifik användarfeedback
2. **TypeScript:** Projektet använder JavaScript - TypeScript skulle ge bättre type safety
3. **Testing:** Ingen information om enhetstester eller integrationstester
4. **Environment variables:** Blandning av hårdkodade värden och environment variables
