# Backendstrategi för Tipspromenad 2.0

## Syfte
Detta dokument beskriver hur vi går från lokal lagring till en molnbaserad lösning med Firebase/Firestore.
Målet är att kunna köra organiserade rundor i realtid, lagra historik per användare och erbjuda auto-genererad ruttlogik.

## Översiktlig arkitektur
- **Frontend**: React-appen (denna kodbas) använder en `RunRepository` som kan läsa/skriva både lokalt (för offline/demo) och mot Firestore.
- **Backend**: Firebase-projekt med Firestore + Cloud Functions. Funktioner exponerar säkra entrypoints för att skapa rundor, generera rutter, registrera svar och hantera anonym access.
- **Synk**: Firestore realtidslyssnare används för runder, deltagare och frågebank. Lokala caches (IndexedDB/localStorage) används som fallback.

## Datamodell i Firestore
```
users/{uid}
  profile { displayName, email, roles }
  history { [ { runId, score, completedAt, totalTime } ] }

runs/{runId}
  meta { name, type, audience, difficulty, lengthMeters, questionCount, description }
  access { joinCode, qrSlug, allowAnonymous, inviteLinks[] }
  state { status, createdAt, startsAt, closedAt }
  checkpoints [{ order, location { lat, lng }, questionId }]

runs/{runId}/participants/{participantId}
  info { alias, contact, isAnonymous, userId? }
  progress { currentOrder, score, startedAt, completedAt, lastSeen }
  answers [{ questionId, answerIndex, correct, answeredAt }]

questions/{questionId}
  text, options[], correctOption, difficulty, audience, categories[], source
```

## Säkerhetsregler (utkast)
- `users/*`: skriv/läs endast av ägaren eller adminroll.
- `runs/*`: läsning öppnas för deltagare som har joinCode; skrivning begränsas till admin/funktioner.
- `runs/*/participants/*`: deltagare får skriva på sin egen doc (via token), admin ser alla.
- Cloud Functions genererar signerade tokens för anonyma deltagare och roterar joinCodes efter avslutad runda.

## Cloud Functions
1. **createRun**: verifierar payload, genererar joinCode/qrSlug, skapar run + checkpoints.
2. **generateRoute**: tar lat/lng, längd, svårighet → anropar kart-API (ex. OpenRouteService) och sparar resultatet.
3. **joinRun**: tar joinCode, alias, optional userId. Skapar participant-doc och returnerar token för klientuppdateringar.
4. **submitAnswer**: skriver svar, uppdaterar score/currentOrder och triggar event (t.ex. notifiering).
5. **closeRun/publishResults**: markerar runda som stängd och genererar sammanfattning till `runs/{id}/summary`.
6. **questionImport**: schemalagd funktion som drar in nya frågor från OpenTDB eller annan källa.

## Migrationsplan
1. **Hybridläge (nuvarande steg)**
   - Behåll `runService` lokal men introducera ett nytt lager `RunRepository` som kan läsa/skriva via Firestore när `process.env.REACT_APP_USE_FIRESTORE` är satt.
   - Återanvänd befintlig datamodell och konvertera lokala objekt till Firestore-format.
2. **Synkronisering**
   - Vid start: ladda data från Firestore och cache i localStorage (för offline). Håll realtidslyssnare för pågående runda.
   - Om offline: skriv mot lokal cache och markera poster som "pending sync"; när uppkoppling återvänder skickas batcher via Cloud Function.
3. **Full serverdrift**
   - Kör QA med Firestore som enda källa. Ta bort localStorage för runs när drift är stabil.
   - Behåll fallback-läge för demos/offline genom feature-flag.

## Implementation steg-för-steg
1. **Konfiguration**
   - Lägg till miljövariabler i `.env` (REACT_APP_FIREBASE_*) och modul `firebaseClient.js` för delad instans.
   - Inför `RunRepository` med metoder `listRuns`, `getRun`, `listenRun`, `createRun`, `registerParticipant`, `submitAnswer`, `closeRun`.
2. **Skriv Firestore-gateway**
   - Skapa `firestoreRunGateway.js` som kapslar Firestore-anrop. Variant för admin (server-side) respektive klient (deltagare).
   - Lägg till en token-baserad auth (anonyma deltagare använder custom token från `joinRun`-funktionen).
3. **UI-justering**
   - Visa synkstatus i UI (ikon + text) så admin ser om datan är uppdaterad.
   - Vid fel (t.ex. permission denied) fall tillbaka till lokal vy och meddela användaren.
4. **Regler och test**
   - Skriv Firestore Security Rules med tester (ny `.rules`-fil + emulator-test).
   - Lägg till funktionella tester (Playwright) där två klienter kör mot samma run i emulatorn.
5. **Deployment**
   - Lägg upp GitHub Actions som kör lint/test och deployar funktioner/regler med `firebase deploy --only functions,firestore:rules`.

## API-kontrakt
### createRun (Cloud Function HTTP)
Request:
```
POST /createRun
{
  "name": "Fredagsquiz",
  "audience": "family",
  "difficulty": "family",
  "questionCount": 8,
  "lengthMeters": 2500,
  "allowAnonymous": true,
  "checkpoints": [{"order":1,"location":{"lat":56.66,"lng":16.36}}]
}
```
Response: `{ "runId": "abc", "joinCode": "KLM123" }`

### joinRun
Request:
```
POST /joinRun
{ "joinCode": "KLM123", "alias": "Lag Lisa", "contact": "lis@example.com", "userId": null }
```
Response: `{ "participantId": "...", "customToken": "..." }`

### submitAnswer
Request: `{ "runId": "...", "participantId": "...", "questionId": "...", "answerIndex": 2 }`
Response: `{ "correct": true, "score": 5 }`

## Teststrategi
- **Enhetstester**: testa gateways (mock Firestore), token-hantering, datakonvertering.
- **Integration**: kör Firebase Emulator (auth, firestore, functions) i CI och kör Playwright-scenarier.
- **Belastning**: script med `k6` eller Cloud Function load-test för att säkerställa att route-generatorn håller.

## Nästa åtgärder
1. Skapa `firebaseClient.js` som initierar `initializeApp` i frontend och exporterar `getFirestore`, `getAuth`.
2. Implementera `RunRepository` och börja flytta `runService`-anrop dit.
3. Skriv säkerhetsregler + emulator-tester.
4. Skapa Cloud Function-skelett i `functions/`-mappen enligt ovan.
5. Uppdatera release-checklistan (deploy, rollback, loggning).
