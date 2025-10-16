# RouteQuest - Agentguide

Dokumentet sammanfattar hur appen hanger ihop efter de senaste uppdateringarna. Spraket ar medvetet enkelt sa att nya bidragare snabbt hittar ratt.

## 1. Kort lagesbild
- RouteQuest ar en webbapp (PWA) som skapar och driver GPS-baserade tipspromenader.
- Frontend byggs i React 18 med React Router 6, Tailwind-styling och Leaflet-kartor.
- Backend ligger i Firebase: Auth, Firestore, Functions, Hosting och Cloud Tasks.
- Appen fungerar offline. Lokal cache i `localStorageService` baddar for offline-spel och synk vid inloggning.
- Version och uppdateringskontroll sker via `src/version.js` och `public/version-check.js`.

## 2. Viktiga anvandarfloden

### 2.1 Skapa och dela en runda
- `GenerateRunPage` -> `routeService` kallar OpenRouteService och `runFactory` bygger checkpunkter och fragor.
- `runRepository` (Firestore-gateway) sparar runda och deltagare i `runs`-kollektionen.
- Vid behov skapas QR-kod via `useQRCode` och kan visas i `FullscreenQRCode`.
- Gastanvandare kan skapa rundor offline och synka senare via `MigrationHandler` och `LocalRunsImportDialog`.

### 2.2 Spela en runda
- Spelare gar via `JoinRunPage` eller QR-kod, lagras i `runs/{runId}/participants`.
- Kartvy och GPS styrs av `RunContext`, `useRunLocation`, `RunMap`, `GPSStatus` och `GPSPrompt`.
- Svar registreras via `runRepository.recordAnswer`, resultat visas i `RunResultsPage`. Admin foljer i `RunAdminPage`.

### 2.3 Fragobank och AI
- `questionService` laddar fragor fran Firestore, haller cache och notifierar lyssnare.
- Dubblettkontroll och strukturvalidering finns i `questionValidationService`.
- Admin kan generera, validera och rensa fragor i `AdminQuestionsPage`. Bakom kulisserna anvands `aiService`.
- AI-stod: Anthropic Claude, OpenAI GPT-4o-mini och Google Gemini; aktivering sker i `AIProviderSettingsPage`.
- Illustrationer (SVG/emoji) kan regenereras individuellt eller i batch.

### 2.4 Bakgrundsjobb och overvaktning
- Alla tunga jobb (AI-generering, validering, emoji-regenerering, migration) kors som Cloud Tasks.
- Resultat och progress sparas i Firestore-kollektionen `backgroundTasks`.
- `BackgroundTaskProvider` lyssnar pa mina jobb och visar dem i `BackgroundTasksDropdown`. Superuser ser helheten i `SuperUserTasksPage`.
- Admin kan stoppa och radera jobb via funktionerna `stopTask`, `deleteTask`, `bulkStopTasks`, `bulkDeleteTasks`, `cleanupStuckTasks` och `deleteOldTasks`.

## 3. Frontend (React)

### 3.1 Struktur
- `src/views/` innehaller sida-filer. Vyer med prefix `SuperUser` kraver behorighet (se `App.js`).
- `src/components/` samlar UI-block: `layout/` (Header/Footer), `shared/` (dialoger, statuskomponenter), `backgroundTasks/`, `admin/`, `migration/`, `run/`, `payment/`.
- `src/context/`: `AuthContext`, `RunContext`, `BackgroundTaskContext`, `ToastContext`.
- `src/services/`: affarslogik, API-anrop och lokala hjalpare.
- `src/repositories/` + `src/gateways/`: Firestore-persistens.
- `src/hooks/`: speciallogik (t.ex. `useBreadcrumbs` som loggar handelser i error-loggen).

### 3.2 Context & hooks
- `AuthProvider` hanterar Firebase-inloggning, gastkonton och superuser-flaggan (`users`-kollektionen).
- `RunProvider` haller aktiv runda, deltagare och resultat.
- `BackgroundTaskProvider` haller koll pa bakgrundsjobb, notifierar toasts vid statusbyte och sparar bevakade jobb i localStorage.
- `ToastProvider` erbjuder `useToast` for korta aviseringar.
- `useBreadcrumbs` skriver navigationsspar till `errorLogService` sa att superuser kan folja anvandarens steg fore ett fel.

### 3.3 Centrala services
- `runFactory` bygger rundaobjekt, `routeService` pratar med OpenRouteService.
- `questionService` skoter Firestore-laddning, AI-uppdrag, valideringar, dublettlistor och rapporthantering.
- `aiService` skickar jobb till Functions (`generateAIQuestions`, `validateQuestionWithAI`, `batchValidateQuestions`, `regenerateQuestionEmoji`, `batchRegenerateEmojis`, `regenerateAllIllustrations`).
- `analyticsService` registrerar enheter, loggar events (`logVisit`, `logDonation`, `linkDeviceToUser`) och anvands i `SuperUserAnalyticsPage`.
- `messageService` laser/skrivermeddelanden till `messages`-kollektionen och driver `MessagesDropdown` samt `SuperUserMessagesPage`.
- `serviceStatusService` anropar `getStripeStatus` och `getAIStatus` och visar status via `ServiceStatusIcon`.
- `errorLogService` fangar fel, sparar breadcrumbs och driver sidan `SuperUserErrorLogsPage`.
- `backgroundTaskService` (read-only) anvands av `BackgroundTaskProvider` och superuser-vyer.
- Ovrigt: `userPreferencesService` (alias/kontakt i localStorage), `taskService` (vanta pa enskilt jobb), `paymentService`, `feedbackService`, `translationService`.

### 3.4 Komponenter att kanna till
- `Header` visar meny, version, meddelanden och bakgrundsjobb. Superuser far extra menyalternativ.
- `MessagesDropdown` visar meddelanden och later anvandaren markera lasta/ta bort.
- `BackgroundTasksDropdown` listar mina jobb, visar status och lankar till superuser-sidan.
- `ServiceStatusIcon` varnar for storningar i Stripe, OpenRouteService eller AI.
- `MigrationHandler` och `MigrationPrompt` guidar anvandare med lokal data att importera till Firestore.

## 4. Backend (Firebase Functions)
- Huvudfil: `functions/index.js`. Funktionerna kors i `europe-west1`.
- Publika REST-endpoints for appflodet: `createRun`, `generateRoute`, `joinRun`, `submitAnswer`, `closeRun`.
- AI och fragor: `getAIStatus`, `generateAIQuestions`, `validateQuestionWithAI`, `batchValidateQuestions`, `regenerateQuestionEmoji`, `batchRegenerateEmojis`, `regenerateAllIllustrations`.
- Provider-installningar: `getProviderSettings`, `updateProviderSettings`.
- Betalningar: `createPaymentIntent`, `getStripeStatus`.
- Underhall: `updateQuestionsCreatedAt`, `migrateQuestionsToNewSchema`, `cleanupStuckTasks`, `deleteOldTasks`, `stopTask`, `deleteTask`, `bulkStopTasks`, `bulkDeleteTasks`.
- Schemalagd cron: `questionImport` (var 6:e timme) hamtar fragor, dubbelkollar dubletter och triggar AI-validering.
- Cloud Tasks-handlers: `runaigeneration`, `runaivalidation`, `runaibatchvalidation`, `runaimigration`, `runaibatchregenerateemojis`, `runaiemojiregeneration`.
- Hjalptjanster under `functions/services/` kapslar AI-anrop (Anthropic, OpenAI, Gemini), importsteg, validering och emoji-generering.

## 5. Firestore-data
- `runs`: metadata for rundor. Underkollektion `participants`.
- `questions`: fragobank inklusive sprakfalt, kategorier, AI-resultat, illustrationer och rapportstatus.
- `backgroundTasks`: status for koade jobb. `taskType`, `status`, `progress`, `result`, `error`.
- `users`: profilinfo. Faltet `isSuperUser` avgor admin-rattigheter.
- `analytics`: handelser per enhet (deviceId, eventType, deviceType, os, browser, metadata).
- `messages`: admin-meddelanden till anvandare/enheter.
- `notifications`: systemnotiser for superusers (t.ex. resultat av `questionImport`).
- `errorLogs`: felloggar med breadcrumbs, stacktrace och enhetsinfo.
- `aiProviderSettings/config`: valfri provider for syfte `generation`, `validation`, `migration`, `illustration`.
- Ovrigt: `serviceStatus`, `feedback`, `payments` om de ar aktiverade.

## 6. Koer och bakgrundsjobb
- Cloud Tasks-klienten skapar koer dynamiskt (`ensureQueue`). Standardregion ar `europe-west1`.
- Jobb loggas i Firestore innan Cloud Task kors, sa UI kan visa status direkt.
- `BackgroundTaskContext.registerTask(taskId, metadata)` later frontend bevaka jobb som skapades av AI-anrop.
- Slutstatus (`completed`, `failed`, `cancelled`) triggar toasts och markerar jobben som lasta.
- Superuser-sidan kan filtrera, stoppa och radera jobb samt se progress (antal validerade fragor, etc.).

## 7. Administration & superuser-vyer
- `SuperUserAllRunsPage`: listor och filter for alla rundor.
- `SuperUserUsersPage`: enkel oversikt over anvandardata.
- `SuperUserAnalyticsPage`: filter for eventtyp, enhetstyp, OS, webblasare; kan massmarkera enheter och skicka meddelande via `messageService`.
- `SuperUserMessagesPage`: skriver nya meddelanden (alla, per anvandare, per enhet) och visar skickade poster.
- `SuperUserNotificationsPage`: laser `notifications` och markerar som last.
- `SuperUserErrorLogsPage`: visar felloggar med breadcrumbs.
- `SuperUserTasksPage`: visar hela bakgrundskon, stod for bulk-stopp/rensning och statusstatistik senaste 24h.
- `AdminQuestionsPage`: full kontroll over fragobank (AI-generation, validering, manuella beslut, dublettpanel, rapporthantering).
- `AIProviderSettingsPage`: kryssrutor for att sla av/pa varje AI-leverantor per syfte.

## 8. Analys, loggar och kommunikation
- `AnalyticsTracker` i `App.js` kor `logVisit` pa sidvisning, runda-skapande m.m.
- `analyticsService.linkDeviceToUser` kopplar historik till anvandarkonto vid inloggning.
- Donationer loggas som analytics-event (`logDonation`).
- `MessagesDropdown` + `messageService` visar admin-notiser till enheten/anvandaren.
- `serviceStatusService` sparar senaste fellagen lokalt for snabb varning (Stripe, OpenRouteService, AI).
- `errorLogService` fangar globala fel, promise-rejections, GPS-debug och ruttgenerering for felsokning.

## 9. Konfiguration & drift
- Kopiera `.env.example` till `.env`. Viktiga nycklar: Firebase (`REACT_APP_FIREBASE_*`), OpenRouteService, Stripe (frontend), feature-flaggor for AI.
- Funktionen anvander hemligheter (`STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`) via Firebase config.
- Kommandon:
  - `npm install`
  - `npm start`
  - `npm test -- --watchAll=false`
  - `npm run build`
  - `cd functions && npm install && npm run serve`
- PM2-skript (`pm2:*`) finns for serverdrift men anvands framst i produktionsmiljo.

## 10. Ovrigt att kanna till
- PWA-stod: `public/manifest.json`, `public/sw.js`, extra assets i `public/logo*-maskable.png`.
- Native wrappers: `android/` och `ios/` innehaller capacitor-resurser om mobilappar behovs.
- `docs/AI-QUESTION-SYSTEM.md` beskriver prompts, floden och kanda buggar i AI-systemet.
- `docs/BACKEND_STRATEGI.md`, `docs/KODREFERENS.md`, `docs/RELEASE_CHECKLIST.md`, `docs/VERSIONSHANTERING.md` kompletterar denna guide.
- Scripts: `scripts/bump-version.js` och `update-questions-createdAt.js` anvands vid storre datafixar.

## 11. Senaste storre andringar (2025)
- Ny bakgrundsko med `BackgroundTaskProvider`, dropdown i header och superuser-oversikt.
- AI-systemet kan nu batch-validera fragor, regenerera illustrationer och kors via Cloud Tasks.
- Provider-installningar per syfte (`generation`, `validation`, `migration`, `illustration`) kan styras fran UI.
- Analytics loggar nu enhetstyp, OS, webblasare och tidszon och kan filtreras i granssnittet. Massutskick stods.
- Meddelande- och notifikationssystem for superuser ar pa plats (`messages`, `notifications` kollektioner).
- Felloggen har breadcrumbs och GPS/route-debug for snabbare felsokning.
- Service-statusikon och checkar mot Stripe, OpenRouteService och AI-funktioner overvakarn driftshalsa.

---

Behovs det mer djup i nagon del? Sok vidare i kallkoden - strukturen ovan ger startpunkterna.
