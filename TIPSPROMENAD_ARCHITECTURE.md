# Tipspromenad 2.0 – Arkitektur och Implementationsplan

## Målbild
En modern, användarvänlig webapp för tipspromenader med fokus på enkelhet och tillgänglighet för både inloggade och oinloggade användare.

## Implementationsstatus (Uppdaterad 2025-09-30)
- **Genomfört**:
  - ✅ Förenklad startsida med två huvudval (Starta runda / Skapa runda)
  - ✅ Ny header med logotyp (frågetecken) och hamburger-meny
  - ✅ LocalStorage-hantering för oinloggade användare (endast ID:n sparas lokalt)
  - ✅ Automatisk migreringslogik vid login (lokala rundor förs över till Firebase)
  - ✅ Frivilliga donationer istället för obligatoriska betalningar (5 kr join, 10 kr skapa)
  - ✅ "Mina rundor"-sida som visar både lokala och Firebase-rundor
  - ✅ Komplett ruttgenereringssystem med OpenRouteService API-integration
  - ✅ RunContext/AuthContext med lokal persistens
  - ✅ Realtidsuppdateringar med heartbeat och statusflaggor
  - ✅ QR-koder och join-länkar
  - ✅ UI-flöden för skapa/generera/ansluta/spela/administrera
  - ✅ OpenTDB-import med svensk översättning
  - ✅ Förfinad spelkarta (autopan, visuell status)
  - ✅ Grundläggande jest-tester
  - ✅ Rollsystem borttaget - alla användare kan skapa/ansluta
  - ✅ SuperUser-roll för administration (sätts manuellt i Firebase)
  - ✅ Versionshantering implementerad (SemVer 2.0.0)
  - ✅ LocalStorage optimerad - endast ID:n sparas, data hämtas från Firebase

- **Pågående**:
  - 🔄 Dokumentation av alla ändringar
  - 🔄 Utökade manuella/GPS-flöden för specialfall

- **Kvar att bygga**:
  - ⏳ Riktig backend (Firestore) med säkerhetsregler
  - ⏳ Realtidsnotiser/push
  - ⏳ Offline/synk-stöd för komplex data
  - ⏳ Avancerad statistik/export
  - ⏳ End-to-end tester för båda scenarierna

- Modern webapp för tipspromenader med två huvudsakliga scenarier: organiserad runda och on-demand genererad runda.
- Stöd för både inloggade och anonyma deltagare (alias + valfri kontakt).
- Administrationsgränssnitt för att skapa rundor, generera QR-koder, följa resultat och exportera statistik.
- Mobil-först upplevelse med offline-tolerans (cache) och responsiv design.

## Roll & aktörer (Uppdaterad 2025-09-30)
| Roll | Beskrivning |
| --- | --- |
| **Alla användare** | Kan både skapa och ansluta till rundor. Ingen rollbaserad begränsning. |
| **SuperUser** | Särskild administrativ roll som sätts manuellt i Firebase (`isSuperUser: true`). Har tillgång till admin-funktioner: alla rundor, alla användare, fråghantering. |
| **Inloggad användare** | Loggar in med konto, kan se historik över slutförda rundor och sina poäng. Data sparas i Firebase och synkas mellan enheter. |
| **Oinloggad användare** | Ansluter via QR-kod eller join-kod utan konto. Endast run-ID:n sparas i localStorage. Full rundata hämtas från Firebase. Kan migrera data till konto senare. |

## Huvudflöden
1. **Organiserad runda (kod/QR)**
   - Admin loggar in, skapar runda, anger plats(er), tid, frågebank och målgrupp.
   - System genererar anslutningskod + QR.
   - Deltagare ansluter (inloggade eller anonyma), svarar på frågor i vald ordning.
   - Admin realtidsmonitorerar progression och ser resultatlista.
2. **On-demand genererad runda**
   - Skapare står på plats, anger önskad längd, svårighet (barn/vuxen/familj) och antal frågor.
   - Backend genererar runda genom att analysera kartdata: föreslagen slinga med fråga-checkpoints.
   - System plockar frågor från databasen anpassat till svårighetsprofilen.
   - Deltagare ansluter via QR-kod eller kod som genereras efter att rundan är skapad.

## Krav & funktioner
- **Läge**: Rundor fungerar både med och utan aktiv GPS.

### GPS och lägeshantering
- Deltagare kan slå på/av GPS-spårning i spelvyn. Valet sparas lokalt så att samma preferens används efter omladdning.
- Vid aktiv GPS används watchPosition för att uppdatera löparens markör och kontrollera när checkpoint uppnås; kartan centreras automatiskt kring senaste position och visar avstånd till nästa stopp.
- Vid avstängd eller nekad GPS visas rundan ändå på kartan och deltagaren startar varje fråga manuellt via knappar; inget positionsdata skickas.
- Systemet hanterar permission denied/unsupported genom att växla till manuellt läge och tydlig statusindikering i UI samt informera om avstånd uppdateras när GPS är på.

- **Frågebank** grupperad efter svårighet och kategori. Kan utökas av admin.
- **Rundor** har metadata (namn, beskrivning, starttid, typ, svårighet, längd, antal frågor).
- **Checkpoints** innehåller geografisk position, fråga, alternativ, facit och ev. media.
- **Deltagarlogg** sparar svar, tid per fråga, totalpoäng, alias/ID.
- **Realtime**: Firestore-subscriptions för rundstatus, men fallback med polling.
- **QR-kod** genereras via klient (canvas) eller backend endpoint (Cloud Functions).
- **Historik**: inloggade användare får vy över tidigare rundor med resultat.
- **Offline-stöd**: cachea senaste frågor och formulärsvar tills uppkoppling.

## Datamodell (Firestore)**
```
users/{uid}
  profile { displayName, email, roles }
  history { [ { runId, score, completedAt } ] }

runs/{runId}
  meta { name, type, difficulty, createdBy, createdAt, startsAt, lengthMeters }
  access { joinCode, qrSlug, allowAnonymous }
  checkpoints [{ order, location { lat, lng }, questionId }]
  state { status, activeParticipants }

runs/{runId}/participants/{participantId}
  info { alias, contact, isAnonymous, userId? }
  progress { currentOrder, score, startedAt, completedAt }
  answers [{ checkpointOrder, questionId, answer, correct, answeredAt }]

questions/{questionId}
  text, options[], correctOption, difficulty, audience (barn|vuxen|familj), categories[]
```

## Förenklad användarupplevelse (2025)

### Ny startsida
- **Design**: Två stora rutor istället för tre kolumner med formulär
  - 🎯 **Starta runda**: För att ansluta till befintlig runda
  - ✨ **Skapa runda**: För att skapa ny runda
- **Header**: Fast header med logotyp (?) och hamburger-meny
- **Dynamisk info**: Visar olika text beroende på om användaren är inloggad eller ej

### Hamburger-meny
- **Placering**: Uppe till höger i headern
- **Badge**: Visar antal lokala rundor för oinloggade användare
- **Innehåll**:
  - Användarinfo (om inloggad)
  - Mina rundor (både lokala och Firebase-rundor)
  - Admin-funktioner (om admin)
  - Login/Logout
- **Animation**: Smooth övergång vid öppning/stängning

### LocalStorage-system (Optimerad 2025-09-30)
- **Syfte**: Låta oinloggade användare spåra sina rundor lokalt
- **Designprincip**: Endast ID:n sparas i localStorage - Firebase är single source of truth
- **Data som sparas**:
  - `geoquest:local:createdRuns` - Array med `{ runId, createdAt, updatedAt }`
  - `geoquest:local:joinedRuns` - Array med `{ runId, participantId, joinedAt, updatedAt }`
  - `geoquest:local:migrated` - Boolean flagga för om data migrerats
  - `geoquest:version` - Applikationsversion för migrering
  - `geoquest:build_date` - Byggdatum
- **Fördelar**:
  - Minimal datalagring lokalt (endast ID:n)
  - Full rundata alltid uppdaterad från Firebase
  - Ingen risk för synkproblem eller föråldrad data
  - Mindre diskutrymme används
- **Funktioner**:
  - Automatisk tracking när användare skapar eller ansluter till rundor
  - MyLocalRunsPage hämtar full data från Firebase baserat på ID:n
  - Visas i "Mina rundor"-sidan med loading states
  - Uppmaning att skapa konto för att spara mellan enheter

### Migreringslogik
- **Trigger**: Aktiveras automatiskt när användare loggar in
- **Process**:
  1. Detekterar lokal data i localStorage
  2. Visar dialog med information om vad som kan migreras
  3. Användaren väljer att migrera eller hoppa över
  4. Vid migrering: data kopieras till Firebase under användarens ID
  5. Markerar data som migrerad för att förhindra dubbelmigrering
- **Engångsmigrering**: Data kan endast migreras till ett konto
- **Bevarande**: Lokal data finns kvar även efter migrering

### Frivilliga donationer
- **Tidigare**: Obligatorisk betalning för att ansluta/skapa
- **Nu**: Frivilliga donationer med tydlig "Fortsätt utan donation"-knapp
- **Belopp**:
  - 5 kr för att ansluta till runda
  - 10 kr för att skapa runda (ej implementerat i CreateRunPage än)
- **Språk**: "Stöd projektet" istället för "Betala"
- **Test-läge**: Fungerar utan riktig betalning

### Rollsystem borttaget (2025-09-30)
- **Tidigare**: Komplicerat rollsystem med admin/player/guest distinktioner
- **Nu**: Förenklat system där alla kan allt
- **Ändringar**:
  - Alla användare kan skapa och ansluta till rundor
  - Inga separata registrerings/login-sidor för olika roller
  - En enda `login()` och `register()` funktion i AuthContext
  - Borttagna: `loginAsAdmin()`, `loginAsRegistered()`, `registerPlayer()`, `registerAdmin()`
  - Borttagna: `isAdmin`, `roles` objekt i användardata
- **SuperUser-roll**:
  - Sätts manuellt i Firebase: `users/{uid}/profile/isSuperUser: true`
  - Ger tillgång till admin-funktioner via `RequireSuperUser` guard
  - Separerade routes: `/superuser/all-runs`, `/superuser/users`, `/admin/questions`
- **Implementation**:
  - `AuthContext.js`: Refaktorerad med ny `isSuperUser` boolean
  - `App.js`: `RequireSuperUser` komponent ersätter `RequireAdmin`
  - `RegisterPage.js`: En enda registreringssida för alla
  - `LoginPage.js`: Förenklad utan admin/player toggle

### Versionshantering (2025-09-30)
- **Fil**: `src/version.js`
- **Format**: Semantic Versioning (SemVer) - MAJOR.MINOR.PATCH
- **Nuvarande version**: 2.0.0
- **Features**:
  - `VERSION` - Versionsnummer
  - `BUILD_DATE` - Senaste byggdatum
  - `FEATURES` - Feature flags (localStorage, migration, donations, superuser, simplifiedUI)
  - `CHANGELOG` - Strukturerad ändringslogg per version
  - `checkLocalStorageVersion()` - Detekterar versionsändringar och triggar migrations
  - `getVersionInfo()` - Returnerar all versionsinformation
- **Användning**:
  - Automatisk versionskontroll vid app-start
  - LocalStorage sparar nuvarande version för att detektera uppdateringar
  - Möjliggör framtida datamigreringar mellan versioner

## Komponentstruktur (React) - Uppdaterad 2025-09-30
- `views/`
  - **`LandingPage`** - Förenklad startsida med två huvudval
  - **`LoginPage`** - En enda login-sida för alla användare
  - **`RegisterPage`** - En enda registreringssida för alla användare
  - **`MyLocalRunsPage`** - Visar alla rundor (hämtar data från Firebase baserat på localStorage-ID:n)
  - `CreateRunWizard` (flöde för alla användare)
  - `GenerateRunPage` (on-demand)
  - `JoinRunPage` (kod/QR-inmatning, integrerad med localStorage)
  - `RunLobby` (väntläge)
  - `RunPlay` (frågor + karta + progress)
  - `RunResults`
  - `MyRunsPage` (SuperUser - alla rundor i systemet)
  - `AdminQuestionsPage` (SuperUser - fråghantering)
- `components/`
  - **`layout/Header`** - Header med logotyp, hamburger-meny och badge för lokala rundor
  - **`migration/MigrationPrompt`** - Dialog för datamigrering
  - **`migration/MigrationHandler`** - Trigger för migrering vid login
  - **`payment/PaymentModal`** - Uppdaterad för donations-språk
  - Återanvändbara UI (QuestionCard, Timer, MapCourse, QRDisplay)
- `contexts/`
  - `RunContext` (live data för aktuell runda)
  - **`AuthContext`** - Refaktorerad utan rollsystem, med `isSuperUser` boolean
- `services/`
  - **`localStorageService`** - Hanterar lokal ID-lagring (endast runId/participantId)
  - **`migrationService`** - Migrerar ID:n till Firebase
  - **`paymentService`** - Hanterar Stripe-donationer
  - `routeService` - Ruttgenerering med OpenRouteService
- `hooks/`
  - `useRunSubscription`
  - `useQuestionNavigator`
  - `useRouteGenerator` (för on-demand scenario; pratar med backend)
- **`version.js`** - Versionshantering med SemVer och changelog

## Backendplan – Firestore/Cloud Functions
- Detaljerad design finns i docs/BACKEND_STRATEGI.md (arkitektur, datamodell, API, migrationssteg).
- Frontend ska läsa miljövariabler (REACT_APP_FIREBASE_*) och använda ett RunRepository-lager som kan prata både lokalt och mot Firestore.
- Cloud Functions täcker createRun, generateRoute, joinRun, submitAnswer, closeRun samt frågeimport; säkerhetsregler begränsar skrivningar och tokens hanterar anonyma deltagare.
- Cloud Function-skelett (functions/index.js) utlagt med TODO-markeringar för respektive endpoint.
- Kodbasen är städad från GeoQuest-rester; se docs/KODREFERENS.md för detaljerad funktionsöversikt.

## Ruttgenereringssystem (Implementerat)

### OpenRouteService API Integration
- **Tjänst**: `src/services/routeService.js` - Komplett implementation av ruttplanering
- **API**: OpenRouteService foot-walking med round_trip funktionalitet
- **Konfiguration**: API-nyckel via `.env` med fallback till hårdkodad nyckel
- **Global funktion**: Fungerar överallt, inte bara Kalmar

### Rutt-algoritm
```javascript
// Skapa cirkulära gångrutter med riktiga vägar
const generateWalkingRoute = async ({ origin, lengthMeters, checkpointCount })
```
- Använder OpenRouteService round_trip API för att skapa loopar som börjar och slutar på samma punkt
- Genererar konservativa waypoints för att undvika vatten och otillgänglig terräng
- Polyline-dekodning för att konvertera API-geometri till koordinater

### Robust Fallback-system
- **Rektangulär gatumönster-rutt**: När API misslyckas skapas en fyrkantig rutt som efterliknar stadsgator
- **Konservativ radie**: Maximalt 400m från centrum för att hålla sig nära gångbara områden
- **Varierad geometri**: Naturlig variation för att efterlikna riktiga gångvägar

### Checkpoint-placering längs faktiska rutter
- **Smart placering**: Checkpoints placeras längs den faktiska rutten istället för slumpmässiga positioner
- **Jämn fördelning**: Frågor sprids ut längs hela rutten baserat på routeIndex
- **Implementering i runFactory.js**: `buildHostedRun` och `buildGeneratedRun` använder route-data

### Debug och felhantering
- Omfattande loggning för API-anrop, route-generering och checkpoint-placering
- Tydlig felhantering med informativa meddelanden
- Utvecklingsläge med detaljerad debug-output

## Backend / molnfunktioner
- `createRun` (admin) – validerar, sparar i Firestore, genererar kod och ev. QR.
- ~~`generateRoute` (on-demand)~~ **IMPLEMENTERAT** – Komplett ruttgenerering med OpenRouteService API i `routeService.js`
- `submitAnswer` (säker uppdatering) – skriver svar och uppdaterar poäng.
- `closeRun` / `publishResults`.
- `createQuestion`, `updateQuestion` (admin).

## Säkerhet
- Firestore rules som skiljer på admin, autentiserad och anonym access.
- JoinCode / QR slug unika per aktiv runda + TTL.
- Anonyma deltagare får temporär token för att uppdatera sin participant doc.

## Migreringsplan från nuvarande GeoQuest
1. **Branch setup** (feature/tipspromenad-revamp)
2. **Städa upp**: Behåll auth, karta, debug utils.
3. **Introducera modulär struktur** (se ovan) – skapa nya routefiler samt lätta mallkomponenter.
4. **Datamodell** – skapa seeds för frågebank, migrationsskript.
5. **Scenario 1**: adminflöde + deltagande + resultat.
6. **Scenario 2**: on-demand generator (stubba backend → sedan riktiga API).
7. **Integrationer**: QR, epost/push (valfritt), offline.
8. **Testning**: Jest för hooks, Cypress/Playwright för flows.
9. **Deprecera gamla spelet** gradvis (feature flagg).

## Nästa steg i denna branch
- Skapa ny routinglayout (`/admin`, `/run/:id`, `/join/:code`, `/generate`).
- Bootstrapa RunContext + hook skeletons.
- Bygg CreateRunWizard skal (form + steg) utan backend.
- Modellera Firestore service-moduler (`services/runs.ts`, `services/questions.ts`).
- Skriv Mock data + fixtures för en runda.

@todo i kommande commits: implementera UI enligt plan samt backend stubbar.

## Nuläge & roadmap
| Område | Status | Kommentar |
| --- | --- | --- |
| **Användarupplevelse** | **Klar** | **Förenklad startsida, hamburger-meny, localStorage för oinloggade, migreringslogik, frivilliga donationer.** |
| Autentisering | Klar | Firebase-inloggning + localStorage för oinloggade med automatisk migrering. |
| **Ruttgenerering** | **Klar** | **Komplett OpenRouteService API-integration med fallback-system, global funktion, checkpoint-placering längs faktiska rutter.** |
| Rundskapande | Klar (lokalt) | Skapa/generera rundor fungerar mot localStorage med QR-kod/anslutningskod. |
| Spelvy | Pågående | Frågeflöde klart; GPS-karta med autopan/avståndskoll är på plats men kräver fler scenariotester. |
| Resultat/admin | Klar (lokalt) | Realtidsstatus, listor och exportvy finns; redo för Firestore-koppling. |
| Frågebank | Klar (lokalt) | Grundbank + OpenTDB-import med svenska texter. |
| **Betalningar** | **Klar** | **Stripe-integration med frivilliga donationer (5 kr join), test-läge stöd.** |
| Tester | Basnivå | runService-tester finns; UI-/hook- och e2e-tester återstår. |
| Infrastruktur | Pågående | Backendstrategi definierad; Cloud Functions-skelett + release-checklista på plats, Firestore-koppling och CI-deploy återstår. |


