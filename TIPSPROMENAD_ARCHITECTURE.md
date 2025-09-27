# Tipspromenad 2.0 – Arkitektur och Implementationsplan

## Målbild
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
