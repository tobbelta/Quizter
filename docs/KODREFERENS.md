# Kodreferens för tipspromenaden

Detta dokument listar varje central modul, funktion och vad den gör. Referenserna pekar på filerna i `src/` samt Functions-katalogen.

## src/index.js
- `index.js`: Monterar `<App />` inuti `BrowserRouter` med `React.StrictMode`.

## src/App.js
- `RequireAdmin`: Skyddar adminrutter genom att skicka icke-admin tillbaka till `/`.
- `AppRoutes`: Deklarerar samtliga React Router-vägar för appen.
- `App`: Kopplar samman `AuthProvider` och `RunProvider` runt routinglagret.

## src/firebaseClient.js
- `firebaseConfig`: Läser in konfiguration från `REACT_APP_FIREBASE_*`-variabler.
- `isFirebaseConfigured`: Kontroll att obligatoriska nycklar är satta.
- `ensureApp`: Initierar (eller återanvänder) Firebase-appen.
- `getFirebaseApp`: Returnerar app-instansen för övriga moduler.
- `getFirebaseDb`: Returnerar Firestore-klienten.
- `getFirebaseAuth`: Returnerar Firebase Auth-klienten.
- `hasFirebaseConfig`: Flaggar om vi kan använda molnläget.

## src/context/AuthContext.js
- `readStoredUser` / `writeStoredUser`: Hämtar/sparar offline-användare i localStorage.
- `mapFirebaseUser`: Läser `users/{uid}` och bygger vårt auth-objekt.
- `AuthProvider`: Håller aktuell användare i state och exponerar inloggningsmetoder.
  - `ensureUserDoc`: Ser till att `users/{uid}` finns i Firestore.
  - `loginAsAdmin`: Loggar in admin lokalt eller via Firebase.
  - `loginAsRegistered`: Loggar in en registrerad spelare.
  - `loginAsGuest`: Skapar gästkonto (lokalt eller anonym Firebase).
  - `logout`: Loggar ut från vald backend och nollställer state.
- `useAuth`: Hook som ger åtkomst till auth-contexten.

## src/context/RunContext.js
- `readActiveParticipant` / `writeActiveParticipant`: Minneslagrar vald runda+deltagare i localStorage.
- `mapRunQuestions`: Hämtar riktiga frågeobjekt för en runda.
- `RunProvider`: Central state-hantering för pågående runda.
  - `loadRunState`: Buffrar runda, frågor och deltagare.
  - `createHostedRun` / `generateRun`: Skapar nya rundor via `runRepository`.
  - `loadRunById`: Hämtar en runda och laddar in den i contexten.
  - `joinRunByCode`: Registrerar deltagare och aktiverar rundan.
  - `attachToRun`: Återställer tidigare sparad deltagare.
  - `refreshParticipants`: Uppdaterar deltagarlistan och aktiv deltagare.
  - `submitAnswer`: Sparar svar, uppdaterar status och returnerar feedback.
  - `completeRunForParticipant`: Markerar deltagaren som klar.
  - `closeRun`: Sätter run-status till `closed`.
  - useEffect-blocken: Synkar localStorage, lyssnar på Firestore/localStorage, håller heartbeat och uppdaterar listor.
- `useRun`: Hook som exponerar värdena från `RunProvider`.

## src/services/runFactory.js
- `generateJoinCode`: Skapar kod för att ansluta till rundan.
- `resolveQuestionPool`: Hämtar aktuellt frågeutbud (med fallback).
- `pickQuestions`: Filtrerar frågor efter målgrupp/svårighet.
- `createHostedCheckpoints`: Bygger standardrutt för handplanerade rundor.
- `createGeneratedCheckpoints`: Bygger slinga för auto-genererade rundor.
- `stampBaseRun`: Fyller på metadata (skapare, status, tidsstämplar).
- `buildHostedRun` / `buildGeneratedRun`: Exporterade fabriker som används av `runService`/gateway.

## src/services/runService.js
- `readJson` / `writeJson`: Säker åtkomst till localStorage.
- `ensureCachesLoaded`: Laddar en gång per session.
- `cloneRuns`: Returnerar klon av rundor.
- `enrichParticipant`: Beräknar status (aktiv/inaktiv/klar).
- `participantsForRun`: Hämtar deltagare för en runda.
- `notifyRuns` / `notifyParticipants` / `notifyParticipantsForAll`: Anropar registrerade lyssnare.
- `ensureStorageListeners`: Delar uppdateringar mellan flikar.
- `persistRuns` / `persistParticipants`: Sparar i cache + localStorage.
- `getRunById`: Enkelt uppslag i cache.
- `runService`: Lokal implementation av repository-API:t (`listRuns`, `createRun`, `registerParticipant`, `recordAnswer`, `heartbeatParticipant` m.fl.).

## src/services/questionService.js
- `readExtras` / `writeExtras`: Hanterar extra frågor i localStorage.
- `notify`: Ping av prenumeranter vid förändring.
- `addQuestions`: Lägg till nya frågor utan dubbletter.
- `questionService.listAll/getById/getManyByIds`: Utläsning av frågebank.
- `fetchAndAddFromOpenTDB`: Hämtar nya frågor via `opentdbService`.
- `subscribe`: Prenumerations-API för UI.

## src/services/opentdbService.js
- `decodeHtmlEntities`: Översätter HTML-entiteter till text.
- `translateToSwedish`: Enkla ordboksbyten till svenska.
- `translateCategory`: Svensk översättning av OpenTDB-kategorier.
- `mapAudience`: Kartläggning till våra målgrupper.
- `mapDifficulty`: Mappar svårighetsnivåer.
- `shuffleArray`: Fisher-Yates-slagen kopia.
- `convertQuestion`: Gör om OpenTDB-resultat till vårt format.
- `fetchQuestions`: Hämtar, validerar och omvandlar frågelistan.

## src/repositories/runRepository.js
- `wrapSync`: Gör synk-funktioner kompatibla med async-gränssnitt.
- `createLocalRepository`: Binder `runService` till repository-kontraktet.
- `repository`: Växlar mellan Firestore och lokal variant.
- `runRepository`, `isFirestoreEnabled`: Exporterade hjälpare.

## src/gateways/firestoreRunGateway.js
- `serialize`: Deep-clone innan Firestore.
- `mapRunDoc`: Slår ihop id + dokumentdata.
- `enrichParticipant` / `mapParticipantDoc`: Statushantering för Firestore-deltagare.
- `listRuns`, `getRun`, `getRunByCode`: Läslager mot Firestore.
- `createRun`, `generateRouteRun`: Sparar rundor byggda av `runFactory`.
- `listParticipants`, `registerParticipant`, `recordAnswer`, `completeRun`, `closeRun`, `heartbeatParticipant`, `getParticipant`: Molnimplementation av deltagarlogik.
- `subscribeRuns`, `subscribeParticipants`: Realtidslyssnare.

## src/hooks/useRunLocation.js
- `readInitialPreference`: Hämtar sparad GPS-inställning.
- `useRunLocation`: Själva hooken som håller koll på koordinater och status.
  - `clearWatcher`: Stänger geolocation-övervakningen.
  - `enableTracking` / `disableTracking`: Växlar preferens.
  - useEffect-block: Synkar localStorage och startar/stoppar geolocation.

## src/utils/geo.js
- `toRadians`: Hjälpfunktion för haversine.
- `calculateDistanceMeters`: Meteravstånd mellan två koordinater.
- `formatDistance`: Formaterad sträng med m eller km.

## src/utils/joinLink.js
- `buildJoinLink`: Returnerar absolut eller relativ länk för join-koden.

## src/utils/participantStatus.js
- `STATUS_META`: Definition av färger/etiketter.
- `describeParticipantStatus`: Slår upp statusmetadata.

## src/components/run/RunMap.js
- `MapUpdater`: Centrerar Leaflet-kartan när positionen ändras.
- `RunMap`: Renderar polyline, checkpoints och spelarmarkör.

## src/components/shared/QRCodeDisplay.js
- `QRCodeDisplay`: Genererar och visar QR-kod för anslutning.
  - `handleDownload`: Laddar ner bilden.
  - `handleCopy`: Kopierar länktext till urklipp.

## src/views/LandingPage.js
- `handleAliasSubmit`: Skapar gäst och flyttar till join.
- `handleAdminSubmit`: Loggar in admin och går till skapaflödet.
- `handlePlayerLogin`: Loggar in registrerad spelare.
- `handleLogout`: Loggar ut aktiv användare.

## src/views/CreateRunPage.js
- `handleChange`: Uppdaterar adminformuläret.
- `handleImportQuestions`: Hämtar fler frågor från OpenTDB.
- `handleSubmit`: Skapar rundan via `createHostedRun`.

## src/views/GenerateRunPage.js
- `handleChange`: Uppdaterar genereringsformuläret.
- `handleGenerate`: Kallar `generateRun` och visar resultat.
- `handleReset`: Rensar formulär och aktuell runda.

## src/views/JoinRunPage.js
- `handleSubmit`: Validerar kod och ansluter deltagaren.

## src/views/PlayRunPage.js
- `locationStatusLabels`: Text för GPS-status.
- `handleSubmit`: Skickar in valt svar.
- `handleFinish`: Markerar deltagaren som klar.
- `handleStartManualQuestion`: Öppnar nästa fråga i manuellt läge.
- `handleToggleTracking`: Växlar GPS-spårning.

## src/views/RunAdminPage.js
- `questionMap`: cache för frågetexter.
- `rankedParticipants`: Sorterad lista för topplistan.

## src/views/RunResultsPage.js
- `ranking`: Skapar resultatlista med poäng och tider.

## src/data/questions.js
- Bundlad frågebank som används som grundlager för frågor.

## functions/index.js
- `createRun`: HTTP-skelett (POST) för att skapa rundor.
- `generateRoute`: HTTP-skelett för automatgenererad runda.
- `joinRun`: HTTP-skelett för att ansluta deltagare.
- `submitAnswer`: HTTP-skelett för inskickade svar.
- `closeRun`: HTTP-skelett för att stänga runda.
- `questionImport`: Schemalagd funktion som ska importera fler frågor.
