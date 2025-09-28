# Tipspromenad 2.0 – Arkitektur och Implementationsplan

## Målbild
## Implementationsstatus
- **Genomfört**: Ny tipspromenadstruktur med RunContext/AuthContext, lokal körpersistens i runService, realtidsuppdateringar med heartbeat och statusflaggor, QR-koder och join-länkar, UI-flöden för skapa/generera/ansluta/spela/administrera, OpenTDB-import med svensk översättning, förfinad spelkarta (autopan, visuell status) samt grundläggande jest-tester.
- **Pågående**: Dokumentation av nuläget (detta arbete) och utökade manuella/GPS-flöden för specialfall.
- **Kvar att bygga**: Riktig backend (Firestore) med säkerhetsregler, automatisk ruttgenerering mot kart-API, realtidsnotiser/push, historikvy för inloggade spelare, offline/synk-stöd, avancerad statistik/export samt end-to-end tester för båda scenarierna.

- Modern webapp för tipspromenader med två huvudsakliga scenarier: organiserad runda och on-demand genererad runda.
- Stöd för både inloggade och anonyma deltagare (alias + valfri kontakt).
- Administrationsgränssnitt för att skapa rundor, generera QR-koder, följa resultat och exportera statistik.
- Mobil-först upplevelse med offline-tolerans (cache) och responsiv design.

## Roll & aktörer
| Roll | Beskrivning |
| --- | --- |
| Administratör/Skapare | Skapar rundor, väljer upplägg, frågebank, målgrupp och ser resultat. |
| Deltagare (inloggad) | Loggar in med konto, kan se historik över slutförda rundor och sina poäng. |
| Deltagare (anonym) | Ansluter via QR-kod, fyller alias + valfri kontakt, deltager i enstaka runda. |

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

## Komponentstruktur (React)
- `views/`
  - `CreateRunWizard` (flöde för admin)
  - `GenerateRunPage` (on-demand)
  - `JoinRunPage` (kod/QR-inmatning)
  - `RunLobby` (väntläge)
  - `RunPlay` (frågor + karta + progress)
  - `RunResults`
- `components/`
  - Återanvändbara UI (QuestionCard, Timer, MapCourse, QRDisplay).
- `contexts/`
  - `RunContext` (live data för aktuell runda)
  - `AuthContext`
- `hooks/`
  - `useRunSubscription`
  - `useQuestionNavigator`
  - `useRouteGenerator` (för on-demand scenario; pratar med backend).

## Backendplan – Firestore/Cloud Functions
- Detaljerad design finns i docs/BACKEND_STRATEGI.md (arkitektur, datamodell, API, migrationssteg).
- Frontend ska läsa miljövariabler (REACT_APP_FIREBASE_*) och använda ett RunRepository-lager som kan prata både lokalt och mot Firestore.
- Cloud Functions täcker createRun, generateRoute, joinRun, submitAnswer, closeRun samt frågeimport; säkerhetsregler begränsar skrivningar och tokens hanterar anonyma deltagare.
- Cloud Function-skelett (functions/index.js) utlagt med TODO-markeringar för respektive endpoint.
- Kodbasen är städad från GeoQuest-rester; se docs/KODREFERENS.md för detaljerad funktionsöversikt.

## Backend / molnfunktioner
- `createRun` (admin) – validerar, sparar i Firestore, genererar kod och ev. QR.
- `generateRoute` (on-demand) – tar lat/lng, längd, difficulty -> kör kartalgoritm (ex. Google Directions API eller OpenRouteService) och returnerar checkpoints.
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
| Autentisering | Delvis | Lokal mock-inloggning för admin/registrerad/gäst, riktig backend saknas. |
| Rundskapande | Klar (lokalt) | Skapa/generera rundor fungerar mot localStorage med QR-kod/anslutningskod. |
| Spelvy | Pågående | Frågeflöde klart; GPS-karta med autopan/avståndskoll är på plats men kräver fler scenariotester. |
| Resultat/admin | Klar (lokalt) | Realtidsstatus, listor och exportvy finns; redo för Firestore-koppling. |
| Frågebank | Klar (lokalt) | Grundbank + OpenTDB-import med svenska texter. |
| Tester | Basnivå | runService-tester finns; UI-/hook- och e2e-tester återstår. |
| Infrastruktur | Pågående | Backendstrategi definierad; Cloud Functions-skelett + release-checklista på plats, Firestore-koppling och CI-deploy återstår. |


