# GeoQuest2 / RouteQuest - Komplett Systemanalys

## 1. PROJEKTÖVERSIKT

**RouteQuest** (tidigare GeoQuest2) är en modern Progressive Web Application (PWA) för att skapa och genomföra interaktiva GPS-baserade tipspromenader. Applikationen kombinerar geolokalisering, kartvisning, quiz-funktionalitet och realtidsuppdateringar för att skapa en engagerande utomhusupplevelse.

### Kärnfunktionalitet
- **Skapa rundor**: Automatisk generering av cirkulära gångrutter med strategiskt placerade frågor
- **Delta i rundor**: Anslut via QR-kod eller 6-siffrig kod
- **GPS-spårning**: Real-time position tracking med Leaflet kartor
- **Quiz-system**: Flervalsfrågor med poängberäkning och feedback
- **Leaderboard**: Realtidsuppdaterad ställning mellan deltagare
- **Offline-first**: Fungerar både med och utan Firebase-anslutning

### Teknisk Stack
- **Frontend**: React 18 med React Router 6
- **Styling**: TailwindCSS med custom dark theme
- **Backend**: Firebase (Firestore, Auth, Functions)
- **Kartor**: Leaflet + React-Leaflet med OpenStreetMap tiles
- **Routing**: OpenRouteService API för ruttplanering
- **Betalningar**: Stripe integration
- **AI**: Anthropic Claude & OpenAI för frågegenerering
- **PWA**: Service Worker, manifest, offline support

---

## 2. PROJEKTSTRUKTUR

```
geoquest2/
├── src/
│   ├── components/          # React-komponenter
│   │   ├── admin/          # Admin-panelen
│   │   ├── layout/         # Header & Footer
│   │   ├── migration/      # Datamigrering
│   │   ├── payment/        # Stripe-integration
│   │   ├── run/           # Rund-specifika komponenter
│   │   └── shared/        # Återanvändbara komponenter
│   ├── context/           # React Context providers
│   │   ├── AuthContext.js # Autentisering
│   │   └── RunContext.js  # Rund-state management
│   ├── data/             # Statisk data
│   │   └── questions.js  # Inbyggd frågebank
│   ├── gateways/         # Databas-abstraktioner
│   │   ├── firestoreRunGateway.js
│   │   └── firestoreQuestionGateway.js
│   ├── hooks/            # Custom React hooks
│   │   ├── useQRCode.js
│   │   └── useRunLocation.js
│   ├── repositories/     # Data access layer
│   │   ├── runRepository.js
│   │   └── questionRepository.js
│   ├── services/         # Business logic
│   │   ├── analyticsService.js
│   │   ├── feedbackService.js
│   │   ├── localStorageService.js
│   │   ├── messageService.js
│   │   ├── migrationService.js
│   │   ├── opentdbService.js
│   │   ├── paymentService.js
│   │   ├── questionService.js
│   │   ├── routeService.js
│   │   ├── runFactory.js
│   │   └── translationService.js
│   ├── utils/            # Hjälpfunktioner
│   │   ├── constants.js
│   │   ├── geo.js
│   │   ├── joinLink.js
│   │   ├── participantStatus.js
│   │   └── questionLanguage.js
│   ├── views/            # Sidor/vyer
│   │   ├── LandingPage.js
│   │   ├── GenerateRunPage.js
│   │   ├── JoinRunPage.js
│   │   ├── PlayRunPage.js
│   │   ├── RunResultsPage.js
│   │   ├── MyRunsPage.js
│   │   └── [SuperUser-sidor]
│   ├── App.js           # Huvudapp med routing
│   ├── index.js         # Entry point
│   ├── firebaseClient.js # Firebase-konfiguration
│   └── index.css        # Global CSS
├── functions/           # Firebase Cloud Functions
│   ├── index.js        # HTTP endpoints & scheduled functions
│   ├── services/       # AI-generatorer
│   └── package.json
├── public/             # Statiska filer
│   ├── manifest.json   # PWA manifest
│   ├── sw.js          # Service Worker
│   └── logo-compass.svg
├── firestore.rules     # Säkerhetsregler
├── firebase.json       # Firebase-konfiguration
└── package.json        # Projektberoenden
```

---

## 3. ARKITEKTUR & DESIGNMÖNSTER

### 3.1 Lagerad Arkitektur

**Presentationslager (Views/Components)**
- React-komponenter i `views/` för fullständiga sidor
- Återanvändbara komponenter i `components/`
- Layout-komponenter (Header, Footer)

**Business Logic Layer (Services)**
- `runFactory.js`: Skapar run-objekt med frågor och checkpoints
- `routeService.js`: Genererar gångrutter med OpenRouteService API
- `questionService.js`: Hanterar frågebanken med caching
- `analyticsService.js`: Spårar besök och användarinteraktioner

**Data Access Layer (Repositories/Gateways)**
- **Repository Pattern**: Abstraherar datakällan
  - `runRepository.js`: Interface för run-operationer
  - `questionRepository.js`: Interface för fråge-operationer
- **Gateway Pattern**: Konkreta implementationer
  - `firestoreRunGateway.js`: Firebase Firestore-implementering
  - `firestoreQuestionGateway.js`: Firestore för frågor

**Data Layer**
- Firebase Firestore för persistent data
- localStorage för offline-funktionalitet

### 3.2 State Management

**Context API-baserad arkitektur**

**AuthContext** (`src/context/AuthContext.js`)
```javascript
Ansvar:
- Användarautentisering (email/password, anonym)
- Session management
- SuperUser-roller
- Offline/online-hybridläge

Exponerade metoder:
- login({ email, password, name })
- register({ name, email, password, contact })
- loginAsGuest({ alias, contact })
- logout()

State:
- currentUser (användarobjekt)
- isAuthenticated (boolean)
- isSuperUser (boolean)
- isAuthInitialized (boolean)
```

**RunContext** (`src/context/RunContext.js`)
```javascript
Ansvar:
- Aktiv runda och deltagare
- Real-time updates via Firebase subscriptions
- Heartbeat för aktiva deltagare
- Session persistence i localStorage

Exponerade metoder:
- createHostedRun(input, creator)
- generateRun(options, creator)
- loadRunById(id)
- joinRunByCode(joinCode, participantData)
- submitAnswer({ questionId, answerIndex })
- completeRunForParticipant()
- updateRun(updates)
- deleteRun(runId)

State:
- currentRun (run-objekt)
- currentParticipant (deltagare-objekt)
- questions (array av frågor)
- participants (array av alla deltagare)

Optimeringar:
- Memoized callbacks (useCallback)
- Lazy loading av frågor
- Automatisk cleanup av subscriptions
- 15-sekunders heartbeat för activity tracking
```

### 3.3 Firebase Integration

**Firestore Collections**

```javascript
// runs - Huvudcollection för rundor
runs/{runId}
  - id: string (UUID)
  - name: string
  - type: 'hosted' | 'generated'
  - difficulty: 'kid' | 'family' | 'adult'
  - audience: 'kid' | 'family' | 'adult'
  - questionCount: number
  - lengthMeters: number
  - joinCode: string (6 chars, uppercase)
  - qrSlug: string (lowercase joinCode)
  - checkpoints: array [{
      order: number,
      location: { lat, lng },
      questionId: string,
      title: string,
      routeIndex?: number
    }]
  - route: array [{ lat, lng }] (polyline)
  - startPoint: { lat, lng }
  - questionIds: array [string]
  - status: 'active' | 'closed'
  - allowAnonymous: boolean
  - language: 'sv' | 'en'
  - createdBy: string (userId)
  - createdByName: string
  - createdAt: timestamp
  - closedAt?: timestamp

// runs/{runId}/participants - Subcollection för deltagare
participants/{participantId}
  - id: string (UUID)
  - runId: string
  - userId: string | null (null för anonyma)
  - alias: string (visningsnamn)
  - contact: string | null
  - isAnonymous: boolean
  - joinedAt: timestamp (ISO string)
  - completedAt: timestamp | null
  - currentOrder: number (nästa fråga, 1-indexed)
  - score: number (antal rätt)
  - answers: array [{
      questionId: string,
      answerIndex: number,
      correct: boolean,
      answeredAt: timestamp
    }]
  - lastSeen: timestamp (för activity tracking)

// questions - Frågebank
questions/{questionId}
  - id: string
  - difficulty: 'kid' | 'family' | 'adult'
  - audience: 'kid' | 'family' | 'adult'
  - category: string
  - languages: {
      sv: { text, options: array, explanation },
      en: { text, options: array, explanation }
    }
  - correctOption: number (0-indexed)

// users - Användarprofiler
users/{userId}
  - profile: {
      displayName: string,
      contact: string | null
    }
  - isSuperUser: boolean
  - createdAt: timestamp

// analytics - Besöksstatistik
analytics/{eventId}
  - deviceId: string (persistent device identifier)
  - userId?: string (länkas när användare loggar in)
  - eventType: string ('page_view', 'create_run', 'join_run', 'donation')
  - timestamp: timestamp
  - deviceType: string ('mobile', 'tablet', 'desktop')
  - os: string ('Windows', 'macOS', 'Linux', 'Android', 'iOS')
  - browser: string ('Chrome', 'Safari', 'Firefox', 'Edge')
  - timezone: string (Intl timezone)
  - metadata: object

// messages - Admin-meddelanden
messages/{messageId}
  - title: string
  - body: string
  - type: 'info' | 'warning' | 'success' | 'error'
  - targetType: 'all' | 'user' | 'device'
  - targetId?: string
  - adminId: string
  - createdAt: timestamp
  - read: boolean
  - deleted: boolean
```

**Security Rules** (`firestore.rules`)
```javascript
Huvudregler:
- Alla kan läsa aktiva rundor (status == 'active')
- Alla kan skapa rundor (även anonyma användare)
- Endast ägare eller SuperUser kan uppdatera/radera
- Validering av run-data (questionCount 1-50, lengthMeters 500-10000)
- Frågor: läsas av alla, skrivas endast av SuperUser
- Users: användare kan läsa/skriva egen data (ej role utan SuperUser)
- Messages: alla kan läsa (filtrering i kod)
```

---

## 4. KÄRNFUNKTIONALITET

### 4.1 Ruttgenerering (RouteService)

**Algoritm för cirkulär rutt med faktiska gångvägar**

```javascript
Steg 1: Generera waypoints i cirkel
- Beräknar konservativ radie (max 500m)
- Skapar 4-8 waypoints runt startpunkt
- Variation i radie för naturligare form

Steg 2: API-anrop till OpenRouteService
- Endpoint: /directions/foot-walking (eller foot-hiking)
- Round-trip API med önskad längd
- Polyline-encoding för kompakt data

Steg 3: Dekoda polyline-geometri
- Google Polyline Algorithm
- Konverterar till { lat, lng } punkter
- Typiskt 50-200 punkter för en 2-3 km rutt

Steg 4: Placera checkpoints längs rutt
- Fördelar jämnt längs route-array
- Sparar routeIndex för varje checkpoint
- Kopplar frågor till checkpoints

Fallback (om API misslyckas):
- Genererar rektangulär rutt som följer gatumönster
- Interpolerar punkter mellan hörn
- Lägger till slumpmässig variation
```

**Optimeringar**
- **localStorage-cache**: 24 timmars TTL
- **Cache-nyckel**: `${lat}_${lng}_${lengthMeters}_${checkpointCount}_${seed}`
- **Automatisk rensning**: 10% chans vid varje anrop
- **Offline-fallback**: Cirkulär approximation

### 4.2 Run Factory (runFactory.js)

**buildHostedRun** - Manuellt skapade rundor
```javascript
Input:
  - name, description
  - difficulty, audience
  - questionCount (3-20)
  - categories (valfritt filter)
  - lengthMeters (500-10000)
  - origin (GPS-position)

Process:
  1. pickQuestions() - väljer frågor baserat på kriterier
  2. generateWalkingRoute() - skapar faktisk rutt
  3. Placera checkpoints längs rutten
  4. Generera 6-siffrig joinCode (utan förväxlande tecken)
  5. Stampera metadata (createdBy, createdAt, status)

Output:
  - Fullständigt run-objekt redo för Firestore
```

**buildGeneratedRun** - AI-genererade rundor
```javascript
Liknande flow men med:
  - Automatiskt namn om inget anges
  - Seed-baserad ruttvariation (reproducerbar randomness)
  - preferGreenAreas-flagga för parkrutter
```

**Frågeurval (pickQuestions)**
```javascript
Filtrering:
  1. difficulty/audience match
     - 'family': blandar barn och vuxenfrågor
     - 'kid': endast barnfrågor
     - 'adult': endast vuxenfrågor

  2. category filter (om vald)

  3. Shuffling för variation

  4. Återanvändning om för få frågor
     - Skapar nya ID:n för att undvika React key-kollisioner

Felhantering:
  - Kastar fel om 0 matchande frågor
  - Specificerar vilka filter som orsakade problemet
```

### 4.3 Real-time Updates

**Firebase Subscriptions**

```javascript
// RunContext.js - Lyssnar på rundändringar
useEffect(() => {
  if (!runId) return () => {};

  const unsubscribe = runRepository.subscribeRuns((runs) => {
    const updatedRun = runs.find((run) => run.id === runId);
    if (updatedRun) {
      setCurrentRun(updatedRun);
      setQuestions(mapRunQuestions(updatedRun));
    }
  });

  return unsubscribe;
}, [runId]);

// Deltagare-subscription
useEffect(() => {
  if (!runId) return () => {};

  const unsubscribe = runRepository.subscribeParticipants(runId, (participantSnapshot) => {
    setParticipants(participantSnapshot);

    // Synkronisera aktuell deltagare
    const trackedId = participantIdRef.current;
    if (trackedId) {
      const updatedParticipant = participantSnapshot.find((entry) => entry.id === trackedId);
      if (updatedParticipant) {
        setCurrentParticipant(updatedParticipant);
      }
    }
  });

  return unsubscribe;
}, [runId]);
```

**Heartbeat System**
```javascript
// 15-sekunders interval
// Optimerad med Visibility API för batteribesparning
useEffect(() => {
  if (!runId || !participantId) return undefined;

  const sendHeartbeat = () => {
    runRepository.heartbeatParticipant(runId, participantId)
      .catch((error) => console.warn('[RunContext] Heartbeat misslyckades:', error));
  };

  sendHeartbeat(); // Initial
  const heartbeatInterval = setInterval(sendHeartbeat, 15000);

  // Extra heartbeat när användaren återvänder
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      sendHeartbeat();
    }
  };

  // Final heartbeat innan avslut
  const handleBeforeUnload = () => sendHeartbeat();

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    clearInterval(heartbeatInterval);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}, [runId, participantId]);
```

### 4.4 GPS & Proximity Detection

**useRunLocation Hook**
```javascript
Features:
- Geolocation API wrapper
- watchPosition för continuous tracking
- High accuracy mode (enableHighAccuracy: true)
- 30-sekunders timeout
- Error handling (denied, unsupported, unavailable, timeout)
- Enable/disable tracking

Status states:
- 'idle': Inte aktiverat
- 'pending': Väntar på position
- 'active': Aktiv spårning
- 'denied': Åtkomst nekad
- 'unsupported': Ej tillgängligt
- 'unavailable': Tillfälligt otillgänglig
- 'timeout': Timeout
- 'error': Okänt fel

Returnerar:
  - coords: { lat, lng } | null
  - status: string
  - trackingEnabled: boolean
  - enableTracking()
  - disableTracking()
```

**Proximity Logic (PlayRunPage)**
```javascript
const PROXIMITY_THRESHOLD_METERS = 25;

// Beräkna avstånd till nästa checkpoint
useEffect(() => {
  if (!coords || !nextCheckpoint) {
    setDistanceToCheckpoint(null);
    return;
  }
  const distance = calculateDistanceMeters(coords, nextCheckpoint.location);
  setDistanceToCheckpoint(distance);
}, [coords, nextCheckpoint]);

// Visa fråga om nära checkpoint
const nearCheckpoint = trackingEnabled &&
                       distanceToCheckpoint != null &&
                       distanceToCheckpoint <= PROXIMITY_THRESHOLD_METERS;

const shouldShowQuestion =
  (manualMode && questionVisible) ||  // Manuell start
  (!manualMode && nearCheckpoint);    // GPS-läge och nära
```

**Haversine-formel för distansberäkning**
```javascript
// utils/geo.js
export const calculateDistanceMeters = (pos1, pos2) => {
  const R = 6371000; // Jordens radie i meter
  const φ1 = pos1.lat * Math.PI / 180;
  const φ2 = pos2.lat * Math.PI / 180;
  const Δφ = (pos2.lat - pos1.lat) * Math.PI / 180;
  const Δλ = (pos2.lng - pos1.lng) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // meter
};
```

### 4.5 Quiz-system

**Svar-flöde**
```javascript
// PlayRunPage.js
const handleSubmit = async (event) => {
  event.preventDefault();
  if (selectedOption === null || !currentQuestion) return;

  // 1. Skicka svar till backend
  const { correct } = await submitAnswer({
    questionId: currentQuestion.id,
    answerIndex: selectedOption
  });

  // 2. Visa feedback
  setFeedback(correct ? 'Rätt svar!' : 'Tyvärr fel svar.');
  setSelectedOption(null);

  // 3. Rensa feedback efter 2 sekunder
  setTimeout(() => setFeedback(null), 2000);

  // 4. Dölj fråga i manuellt läge
  if (manualMode) {
    setTimeout(() => setQuestionVisible(false), 2000);
  }
};

// RunContext.js - submitAnswer
const submitAnswer = useCallback(async ({ questionId, answerIndex }) => {
  // Validera state
  if (!currentRun || !currentParticipant) {
    throw new Error('Ingen aktiv runda eller deltagare.');
  }

  // Hämta fråga och kontrollera svar
  const question = questionService.getById(questionId);
  const correct = question.correctOption === answerIndex;

  // Uppdatera i Firestore
  const updatedParticipant = await runRepository.recordAnswer(
    currentRun.id,
    currentParticipant.id,
    { questionId, answerIndex, correct }
  );

  // Uppdatera lokal state
  setCurrentParticipant(updatedParticipant);
  await refreshParticipants();

  return { participant: updatedParticipant, correct };
}, [currentRun, currentParticipant, refreshParticipants]);
```

**Poängberäkning (firestoreRunGateway.js)**
```javascript
const recordAnswer = async (runId, participantId, { questionId, answerIndex, correct }) => {
  const participantRef = doc(collection(db, 'runs', runId, 'participants'), participantId);
  const snap = await getDoc(participantRef);
  const participant = { id: participantId, ...snap.data() };

  // Uppdatera eller lägg till svar
  const answers = Array.isArray(participant.answers) ? [...participant.answers] : [];
  const now = new Date().toISOString();
  const existingIndex = answers.findIndex((entry) => entry.questionId === questionId);

  if (existingIndex >= 0) {
    // Uppdatera befintligt svar
    answers[existingIndex] = { ...answers[existingIndex], answerIndex, correct, answeredAt: now };
  } else {
    // Lägg till nytt svar
    answers.push({ questionId, answerIndex, correct, answeredAt: now });
  }

  // Beräkna poäng
  const score = answers.filter((entry) => entry.correct).length;

  // Kontrollera om alla frågor besvarade
  const runSnap = await getDoc(doc(db, 'runs', runId));
  const questionCount = runSnap.data().questionIds?.length || 0;
  const completedAt = (questionCount > 0 && answers.length === questionCount)
    ? now
    : participant.completedAt;

  // Uppdatera participant
  const updated = {
    ...participant,
    answers,
    score,
    currentOrder: answers.length + 1,
    completedAt,
    lastSeen: now
  };

  await setDoc(participantRef, updated, { merge: true });
  return updated;
};
```

---

## 5. ANVÄNDARFLÖDEN

### 5.1 Skapa Runda (GenerateRunPage)

```
1. Användare fyller i formulär:
   - Namn på runda
   - Svårighetsgrad (barn/familj/vuxen)
   - Kategorier (valfritt)
   - Längd i meter (500-10000)
   - Antal frågor (3-20)
   - Föredra parker (checkbox)

2. handleSubmit():
   - Validera input
   - generateRun() från RunContext
     → runFactory.buildGeneratedRun()
     → routeService.generateWalkingRoute()
     → questionService pickQuestions()
   - Spara till Firestore
   - Visa förhandsgranskning av karta

3. Användare granskar rutt:
   - Kan regenerera med ny seed
   - Kan justera parametrar

4. handleSaveRun():
   - Visa PaymentModal (donation)
   - Tillåt skip
   - Spara lokalt för anonyma användare

5. Vid betalning/skip:
   - Visa QR-kod
   - Visa joinCode
   - Tillhandahåll nedladdning och delningslänkar
```

### 5.2 Ansluta till Runda (JoinRunPage)

```
1. Användare anger joinCode:
   - Manuell input (6 tecken)
   - Eller via QR-länk (?code=ABC123)
   - Eller via delad länk

2. Om ej inloggad:
   - Fyll i alias
   - Valfri kontaktinfo
   - loginAsGuest() skapar anonym användare

3. handleJoin():
   - joinRunByCode(joinCode, participantData)
     → Hitta runda i Firestore
     → Registrera deltagare
     → Spara i localStorage (om anonym)
   - Visa PaymentModal (5 kr donation)

4. handlePaymentSuccess():
   - Spara betalningsstatus i localStorage
   - Logga analytics
   - Navigera till /run/{runId}/play
```

### 5.3 Spela Runda (PlayRunPage)

```
1. Initial laddning:
   - Kontrollera betalningsstatus
   - Ladda runda och deltagare
   - Starta GPS (om aktiverat)
   - Aktivera heartbeat

2. GPS-läge (default):
   - Visa karta med position
   - Beräkna avstånd till nästa checkpoint
   - Visa fråga när inom 25 meter
   - Vänta på svar → visa feedback
   - Nästa checkpoint aktiveras automatiskt
   - Upprepa tills alla frågor besvarade
   - Gå tillbaka till start för att avsluta

3. Manuellt läge (GPS avstängt):
   - Knapp "Starta fråga X"
   - Visa fråga direkt
   - Svara → feedback → dölj fråga
   - Klicka igen för nästa fråga
   - Avsluta när alla besvarade

4. Hamburger-meny:
   - Spelinformation (poäng, fråga X/Y)
   - GPS-kontroller (på/av)
   - Språkval (svenska/engelska)
   - Position-info
   - Avsluta runda

5. handleFinish():
   - Markera som completed
   - Navigera till resultat-sida
```

### 5.4 Resultat & Ställning (RunResultsPage)

```
1. Visa deltagarens resultat:
   - Totalt poäng (X/Y rätt)
   - Placering i leaderboard
   - Tid för genomförande

2. Leaderboard:
   - Sorterad efter poäng (desc), sedan tid (asc)
   - Visa alla deltagare
   - Highlighta aktiv användare
   - Real-time updates via subscription

3. Actionsknappar:
   - Se admin-vy (om ägare)
   - Spela igen
   - Gå till startsidan
```

---

## 6. ADMIN & SUPERUSER

### 6.1 Rollsystem

**Roller**
- **Anonym användare**: Kan skapa och delta i rundor (data i localStorage)
- **Registrerad användare**: Persistent data i Firestore
- **SuperUser**: Full åtkomst till admin-panel, frågebank, användarhantering

**SuperUser-bestämning**
```javascript
// AuthContext.js
const mapFirebaseUser = async (firebaseUser) => {
  const docRef = doc(db, 'users', firebaseUser.uid);
  const docSnap = await getDoc(docRef);
  const data = docSnap.exists() ? docSnap.data() : {};

  // isSuperUser sätts ENDAST manuellt i Firestore
  const isSuperUser = data.isSuperUser === true;

  return {
    id: firebaseUser.uid,
    name: profile.displayName || firebaseUser.displayName,
    email: firebaseUser.email,
    isAnonymous: firebaseUser.isAnonymous,
    isSuperUser,
    profile: data.profile
  };
};
```

**Manuell tilldelning**
```javascript
// Firestore Console eller Firebase Admin SDK
db.collection('users').doc(userId).set({
  isSuperUser: true
}, { merge: true });
```

### 6.2 SuperUser-funktioner

**Tillgängliga sidor** (via hamburger-menyn)
1. **Alla rundor** (`/superuser/all-runs`)
   - Lista alla aktiva rundor
   - Radera rundor
   - Se detaljer

2. **Alla användare** (`/superuser/users`)
   - Lista alla registrerade användare
   - Visa användarinfo
   - Hantera roller (framtida)

3. **Frågebank** (`/admin/questions`)
   - Visa alla frågor (bundlade + Firestore)
   - Lägg till manuella frågor
   - Generera frågor med AI (Anthropic/OpenAI)
   - Radera frågor (ej bundlade)
   - Importera från OpenTDB

4. **Besöksstatistik** (`/superuser/analytics`)
   - Aggregerad statistik (totalt, filtrerad)
   - Events per typ
   - Unika enheter med detaljerad info
   - Filter för:
     - Tidsperiod (idag, 7 dagar, 30 dagar, all tid)
     - Händelsetyp (page_view, create_run, join_run, etc.)
     - Enhetstyp (mobile, tablet, desktop)
     - Operativsystem (Windows, macOS, Linux, Android, iOS)
     - Webbläsare (Chrome, Safari, Firefox, Edge)
   - Enhetslista med checkbox-val
   - Skicka meddelande till valda enheter direkt från statistiksidan
   - Donationer

5. **Meddelanden** (`/superuser/messages`)
   - Skicka meddelanden till:
     - Alla användare
     - Specifik användare (user ID)
     - Specifik enhet (device ID)
   - Typer: info, warning, success, error
   - Visa alla skickade meddelanden

6. **Systemnotiser** (`/superuser/notifications`)
   - Visa notifikationer för SuperUsers
   - Filter: alla, olästa, lyckade, fel
   - Markera som läst (individuellt eller bulk)
   - Automatiska notiser från questionImport

### 6.3 Frågehantering

**Frågebanken kombinerar två källor:**

1. **Bundlade frågor** (`src/data/questions.js`)
   - 8 hårdkodade frågor
   - Kan ej raderas
   - Multilingual (sv/en)

2. **Firestore-frågor**
   - Manuellt tillagda via admin-panel
   - AI-genererade (Anthropic Claude, OpenAI, eller Google Gemini)
   - Kan raderas av SuperUser

**AI-generering (Cloud Functions)**
```javascript
// functions/index.js - generateAIQuestions endpoint
exports.generateAIQuestions = createHttpsHandler(async (req, res) => {
  const { amount = 10, category, difficulty } = req.body;

  // Tri-tier fallback: Anthropic → OpenAI → Gemini
  const anthropicKey = anthropicApiKey.value();
  if (anthropicKey) {
    try {
      const { generateQuestions } = require('./services/aiQuestionGenerator');
      questions = await generateQuestions({ amount, category, difficulty }, anthropicKey);
      usedProvider = 'anthropic';
    } catch (error) {
      // Fallback till OpenAI eller Gemini
    }
  }

  // Spara till Firestore
  const batch = db.batch();
  questions.forEach(question => {
    const docRef = db.collection('questions').doc(question.id);
    batch.set(docRef, question);
  });
  await batch.commit();

  return { success: true, count: questions.length, provider: usedProvider };
});
```

**Schemalagd import** (varje 6:e timme)
```javascript
exports.questionImport = onSchedule({
  schedule: "every 6 hours",
  region: REGION
}, async (event) => {
  // Genererar 20 frågor automatiskt
  // Tri-tier fallback: Anthropic → OpenAI → Gemini
  // Sparar till Firestore
  // Skickar notifikation till SuperUsers om status
});
```

---

## 7. OFFLINE & DATAMIGRERING

### 7.1 localStorage-strategi

**Sparad data för anonyma användare**
```javascript
// geoquest:local:createdRuns
[
  {
    runId: "uuid",
    createdAt: timestamp,
    updatedAt: timestamp
  }
]

// geoquest:local:joinedRuns
[
  {
    runId: "uuid",
    participantId: "uuid",
    joinedAt: timestamp,
    updatedAt: timestamp
  }
]

// geoquest:local:migrated
boolean (flagga för migrering)

// geoquest:payment:{runId}
{
  paymentIntentId: string,
  testMode: boolean,
  skipped: boolean,
  timestamp: string
}

// geoquest:deviceId
string (persistent device identifier)

// geoquest:language
'sv' | 'en'
```

**Viktigt**: Endast ID:n sparas lokalt - all faktisk rundata finns i Firestore

### 7.2 Datamigreringsflöde

**MigrationHandler** (`src/components/migration/MigrationHandler.js`)
```
1. useEffect när användare loggar in (ej anonym)
2. Kontrollera om localStorage innehåller data
3. Kontrollera om redan migrerat (flagga)
4. Visa MigrationPrompt om data finns

MigrationPrompt:
  - Visa antal skapade rundor
  - Visa antal deltagna rundor
  - Knappar: "Migrera nu" | "Påminn senare" | "Aldrig"

Om användare väljer migrera:
  - migrationService.migrateLocalData(currentUser.id)
    → Uppdaterar createdBy i Firestore för skapade rundor
    → Länkar userId till participants för deltagna rundor
  - Markera som migrerat (localStorage flagga)
  - Visa bekräftelse
  - Refresh runs
```

**LocalRunsImportDialog** (`src/components/migration/LocalRunsImportDialog.js`)
```
Alternativ migreringsväg vid inloggning:
- Visas direkt efter login om lokala rundor finns
- Mer aggressiv än MigrationHandler
- Kan hoppa över eller migrera direkt
```

---

## 8. BETALNINGAR & MONETISERING

### 8.1 Stripe Integration

**Frontend (paymentService.js)**
```javascript
Funktioner:
- createPaymentIntent({ runId, participantId, amount })
- confirmPayment({ clientSecret, stripe, elements })
- getTestMode() / setTestMode(enabled)

Test-läge:
  - Aktiveras via REACT_APP_PAYMENT_TEST_MODE=true
  - Eller localStorage 'geoquest:paymentTestMode'
  - Simulerar framgångsrik betalning utan Stripe-anrop
```

**Backend (functions/index.js)**
```javascript
exports.createPaymentIntent = createHttpsHandler(async (req, res) => {
  const { runId, participantId, amount, currency = "sek" } = req.body;

  // Validera amount (100-100000 öre = 1-1000 kr)
  if (amount < 100 || amount > 100000) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  const stripe = require("stripe")(stripeSecretKey.value());

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency,
    metadata: { runId, participantId },
    automatic_payment_methods: { enabled: true }
  });

  return res.json({
    client_secret: paymentIntent.client_secret,
    payment_intent_id: paymentIntent.id
  });
});
```

**PaymentModal** (`src/components/payment/PaymentModal.js`)
```javascript
Props:
  - isOpen: boolean
  - runName: string
  - amount: number (öre)
  - allowSkip: boolean
  - onSuccess(result)
  - onCancel()

Funktionalitet:
  - Visa Stripe Card Element
  - Visa belopp i SEK (amount/100)
  - "Donera" knapp → confirmPayment()
  - "Hoppa över" knapp (om allowSkip)
  - Test-läge indikator
  - Loading states
  - Error handling

Användningsfall:
  1. GenerateRunPage: 10 kr (1000 öre) vid skapande
  2. JoinRunPage: 5 kr (500 öre) vid anslutning
```

### 8.2 Analytics & Tracking

**analyticsService.js**
```javascript
Spårade events:
- page_view: Varje sidbesök
- create_run: Runda skapad
- join_run: Anslutning till runda
- complete_run: Runda avslutad
- donation: Betalning genomförd
- device_linked: Device kopplad till användare

Device ID:
  - Genereras vid första besöket
  - Sparas i localStorage
  - Format: device_${timestamp}_${random}
  - Kopplas till userId när användare loggar in

Enhetsdetektering:
  - getDeviceType(): 'mobile' | 'tablet' | 'desktop'
  - getOS(): 'Windows' | 'macOS' | 'Linux' | 'Android' | 'iOS'
  - getBrowser(): 'Chrome' | 'Safari' | 'Firefox' | 'Edge'
  - getTimezone(): Intl timezone string
  - Allt sparas automatiskt vid varje logVisit()

Funktioner:
- logVisit(eventType, metadata)
- getAnalytics(filters)
- getDeviceStats(deviceId)
- linkDeviceToUser(userId)
- logDonation(amount, paymentIntentId, metadata)
- hasDonated()
- getAggregatedStats()
```

**Aggregerad statistik**
```javascript
{
  totalVisits: number,
  uniqueDevices: number,
  eventsByType: {
    'page_view': count,
    'create_run': count,
    'join_run': count,
    'donation': count
  },
  devicesByDate: {
    '2024-10-02': Set(deviceIds)
  },
  donations: {
    count: number,
    total: number (öre)
  }
}
```

---

## 9. UI/UX & STYLING

### 9.1 Design System

**Färgpalett** (index.css)
```css
--bg-color: #0d1117;              /* Djup svart bakgrund */
--card-bg: #161b22;               /* Kort-bakgrund */
--text-primary: #c9d1d9;          /* Ljusgrå primärtext */
--text-secondary: #8b949e;        /* Mellangrå sekundärtext */
--accent-cyan: #30b6c4;           /* Cyan accent */
--accent-blue: #58a6ff;           /* Blå accent */
--accent-yellow: #e3b341;         /* Gul accent */
--accent-red: #f85149;            /* Röd accent */
--border-color: #30363d;          /* Border-färg */
--glow-color: rgba(48, 182, 196, 0.5); /* Glow-effekt */
```

**Animerad bakgrund**
```css
body {
  background: linear-gradient(-45deg, #0d1117, #111522, #0d1117, #1a1f2c);
  background-size: 400% 400%;
  animation: gradient-animation 25s ease infinite;
}

@keyframes gradient-animation {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
```

**TailwindCSS Utilities**
- Custom classes: `.sc-card`, `.sc-button`, `.sc-input`
- Responsive design (mobile-first)
- Dark mode endast (inga ljusa varianter)

### 9.2 Kartvisualisering

**RunMap** (`src/components/run/RunMap.js`)
```javascript
Props:
  - checkpoints: array (med order, location, questionId)
  - userPosition: { lat, lng } | null
  - activeOrder: number (nuvarande fråga, 0-indexed)
  - answeredCount: number
  - route: array [{ lat, lng }] (polyline)
  - startPoint: { lat, lng }

Funktionalitet:
  - Leaflet map med OpenStreetMap tiles
  - Grayscale filter för dark theme
  - Checkpoints som numrerade markers
    - Grön: besvarade
    - Cyan: aktiv
    - Grå: obesvarade
  - Route polyline (blå linje)
  - User position marker (pulsande)
  - Auto-zoom till bounds
  - Responsive höjd (100% av parent)

Optimeringar:
  - useMemo för marker-komponenter
  - Conditional rendering
  - React-Leaflet optimizations
```

**Kart-styling** (index.css)
```css
.leaflet-tile {
  filter: grayscale(1) brightness(0.5) contrast(1.5);
}

.leaflet-popup-content-wrapper {
  background-color: var(--card-bg) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 8px !important;
}
```

### 9.3 Mobil-optimering

**Touch-optimizations**
```css
body {
  touch-action: manipulation;
  -webkit-text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.sc-button {
  min-height: 44px;  /* Apples rekommendation */
  min-width: 44px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

input {
  font-size: 16px;  /* Förhindrar zoom på iOS */
  min-height: 44px;
}
```

**Responsive breakpoints**
```css
@media (max-width: 768px) {
  /* Mobilanpassningar */
  .leaflet-container {
    height: 50vh !important;
    min-height: 300px;
  }

  .sc-button {
    padding: 1rem 1.25rem;
    font-size: 0.875rem;
    min-height: 48px;
  }
}

@media (max-width: 480px) {
  /* Ultra små skärmar */
  .flex.gap-2 {
    flex-direction: column;
  }
}

@media (max-width: 768px) and (orientation: landscape) {
  /* Landscape-läge */
  .leaflet-container {
    height: 40vh !important;
  }
}
```

**PWA-manifest** (public/manifest.json)
```json
{
  "short_name": "RouteQuest",
  "name": "RouteQuest - Skapa & Spela Tipspromenader",
  "start_url": "/?utm_source=pwa",
  "display": "standalone",
  "theme_color": "#30b6c4",
  "background_color": "#1a1a1a",
  "orientation": "portrait-primary",
  "categories": ["lifestyle", "entertainment", "education", "health"],
  "shortcuts": [
    { "name": "Gå på tipspromenad", "url": "/join" },
    { "name": "Skapa tipspromenad", "url": "/generate" },
    { "name": "Mina rundor", "url": "/my-runs" }
  ]
}
```

### 9.4 Komponenter

**Återanvändbara komponenter**

1. **Header** (`components/layout/Header.js`)
   - Fixed top-bar
   - Logotyp (navigerar till /)
   - Dynamisk titel (prop)
   - Hamburger-meny
   - Badge för olästa meddelanden/lokala rundor
   - SuperUser-indikator

2. **Footer** (`components/layout/Footer.js`)
   - Version-info
   - Build-datum
   - Minimal design

3. **QRCodeDisplay** (`components/shared/QRCodeDisplay.js`)
   - Visar QR-kod från data URL
   - Loading state
   - Error handling
   - Klickbar för fullscreen

4. **FullscreenQRCode** (`components/shared/FullscreenQRCode.js`)
   - Modal overlay
   - Stor QR-kod
   - Stäng-knapp
   - Dark backdrop

5. **FullscreenMap** (`components/shared/FullscreenMap.js`)
   - Modal med karta
   - Alla checkpoints & route
   - Stäng-knapp
   - Responsive

6. **Pagination** (`components/shared/Pagination.js`)
   - Sidonumrering för listor
   - Föregående/Nästa
   - Page numbers
   - Disabled states

7. **MessagesDropdown** (`components/shared/MessagesDropdown.js`)
   - Dropdown från Header
   - Real-time meddelanden
   - Markera som läst
   - Radera meddelanden
   - Typad styling (info/warning/success/error)

8. **AboutDialog** (`components/shared/AboutDialog.js`)
   - Modal med app-info
   - Version
   - Beskrivning
   - Länkar

9. **FeedbackDialog** (`components/shared/FeedbackDialog.js`)
   - Användare kan skicka feedback
   - Formulär med namn, email, meddelande
   - Sparas till Firestore

10. **InstallPrompt** (`components/shared/InstallPrompt.js`)
    - PWA install-prompt
    - Visas om inte installerad
    - beforeinstallprompt event
    - Kan stängas permanent

---

## 10. SÄKERHET & BEST PRACTICES

### 10.1 Firebase Security Rules

**Huvudprinciper**
```javascript
1. Least privilege: Användare får bara access till det de behöver
2. Validering: All input valideras på serversidan (Firestore rules)
3. SuperUser-kontroll: isSuperUser måste vara true i Firestore users-collection
4. Anonyma användare: Tillåts skapa och delta i rundor
```

**Exempel på validering**
```javascript
// firestore.rules
function isValidRun(data) {
  return (!('questionCount' in data.keys()) ||
          (data.questionCount is int && data.questionCount >= 1 && data.questionCount <= 50)) &&
         (!('lengthMeters' in data.keys()) ||
          (data.lengthMeters is int && data.lengthMeters >= 500 && data.lengthMeters <= 10000)) &&
         (!('type' in data.keys()) || data.type in ['hosted', 'generated']) &&
         (!('difficulty' in data.keys()) || data.difficulty in ['kid', 'family', 'adult']);
}

match /runs/{runId} {
  allow create: if isValidRun(request.resource.data) &&
                   request.resource.data.createdAt is timestamp &&
                   (!isAuthenticated() || request.resource.data.createdBy == request.auth.uid);
}
```

### 10.2 Environment Variables

**.env.example**
```bash
# Firebase Configuration
REACT_APP_FIREBASE_API_KEY=din-nyckel-här
REACT_APP_FIREBASE_AUTH_DOMAIN=din-app.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=ditt-projekt-id
REACT_APP_FIREBASE_STORAGE_BUCKET=ditt-projekt-id.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=1234567890
REACT_APP_FIREBASE_APP_ID=1:1234567890:web:abc123def456
REACT_APP_FIREBASE_MEASUREMENT_ID=G-XYZ1234567

# OpenRouteService API (valfritt)
REACT_APP_OPENROUTE_API_KEY=din-openroute-nyckel-här

# Stripe (valfritt)
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Test-läge för betalningar (development)
REACT_APP_PAYMENT_TEST_MODE=true
```

**Firebase Functions Environment** (functions/.env)
```bash
STRIPE_SECRET_KEY=sk_test_...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### 10.3 Error Handling

**Centraliserad felhantering**
```javascript
// firestoreRunGateway.js
const getRun = async (runId) => {
  try {
    const docSnap = await getDoc(doc(db, 'runs', runId));
    let run = mapperaRundeDokument(docSnap);

    // Automatisk retroaktiv route-generering
    if (run && run.type === 'generated' && !run.route && run.checkpoints?.length > 0) {
      try {
        const { generateWalkingRoute } = await import('../services/routeService');
        const routeData = await generateWalkingRoute({
          origin: run.checkpoints[0]?.location || FALLBACK_POSITION,
          lengthMeters: run.lengthMeters || 2500,
          checkpointCount: run.checkpoints.length
        });

        if (routeData.route && routeData.route.length > 0) {
          run = { ...run, route: routeData.route };
          await setDoc(doc(db, 'runs', run.id), run);
        }
      } catch (error) {
        console.warn('[FirestoreGateway] Kunde inte generera route-data retroaktivt:', error);
      }
    }

    return run;
  } catch (error) {
    console.error('[FirestoreGateway] Fel vid hämtning av run:', error);
    throw error;
  }
};
```

**User-facing error messages**
```javascript
// PlayRunPage.js
useEffect(() => {
  try {
    if (!currentRun || currentRun.id !== runId) {
      loadRunById(runId);
    }
  } catch (loadError) {
    setError(loadError.message);
  }
}, [currentRun, loadRunById, runId]);

if (error || !paymentVerified) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4">
        {!paymentVerified ? 'Betalning krävs' : 'Något gick fel'}
      </h1>
      <p className="text-red-300 mb-4">
        {!paymentVerified
          ? 'Du måste betala för att delta i denna runda.'
          : error
        }
      </p>
    </div>
  );
}
```

### 10.4 Performance Optimizations

**React Optimizations**
```javascript
// RunContext.js - Memoized callbacks
const submitAnswer = useCallback(async ({ questionId, answerIndex }) => {
  // ...implementation
}, [currentRun, currentParticipant, refreshParticipants]);

// Memoized context value
const contextValue = useMemo(() => ({
  currentRun,
  questions,
  participants,
  currentParticipant,
  createHostedRun,
  generateRun,
  // ...
}), [
  currentRun,
  questions,
  participants,
  currentParticipant,
  createHostedRun,
  generateRun,
  // ...
]);
```

**Firebase Optimizations**
```javascript
// Batch writes
const batch = db.batch();
questions.forEach(question => {
  const docRef = db.collection('questions').doc(question.id);
  batch.set(docRef, question);
});
await batch.commit();

// Query filtering
const q = query(
  collection(db, 'runs'),
  where('status', '==', 'active')
);
```

**Caching strategies**
```javascript
// routeService.js - localStorage cache
const CACHE_KEY_PREFIX = 'routequest_route_cache_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 timmar

const getCachedRoute = (cacheKey) => {
  const cached = localStorage.getItem(cacheKey);
  if (!cached) return null;

  const { data, timestamp } = JSON.parse(cached);
  const age = Date.now() - timestamp;

  if (age > CACHE_TTL_MS) {
    localStorage.removeItem(cacheKey);
    return null;
  }

  return data;
};
```

---

## 11. DEPLOYMENT & INFRASTRUKTUR

### 11.1 Build & Deploy

**Scripts** (package.json)
```json
{
  "scripts": {
    "start": "react-scripts start",      // Dev server på port 3000
    "build": "react-scripts build",      // Production build → build/
    "test": "react-scripts test",        // Jest test runner
    "eject": "react-scripts eject"       // Eject från CRA (ej rekommenderat)
  }
}
```

**Firebase Hosting** (firebase.json)
```json
{
  "hosting": {
    "public": "build",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "/api/create-payment-intent",
        "function": "createPaymentIntent"
      },
      {
        "source": "**",
        "destination": "/index.html"  // SPA routing
      }
    ]
  }
}
```

**Deploy-process**
```bash
# 1. Build frontend
npm run build

# 2. Deploy till Firebase Hosting
firebase deploy --only hosting

# 3. Deploy Cloud Functions
cd functions
npm install
cd ..
firebase deploy --only functions

# 4. Deploy Firestore rules
firebase deploy --only firestore:rules
```

### 11.2 Environment-specific Configuration

**Development**
- `npm start` → localhost:3000
- Använder `.env` för Firebase-konfiguration
- Hot module replacement
- Source maps

**Production**
- Build med `npm run build`
- Minifierad och optimerad kod
- Tree-shaking av oanvänd kod
- Service Worker för offline-support
- Firebase Hosting CDN

### 11.3 Monitoring & Logging

**Frontend Logging**
```javascript
if (process.env.NODE_ENV !== 'production') {
  console.debug('[RouteService] Cache hit:', {
    cacheKey,
    ageHours: (age / (60 * 60 * 1000)).toFixed(1),
    routePoints: data.coordinates?.length || 0
  });
}
```

**Backend Logging** (Firebase Functions)
```javascript
const logger = require("firebase-functions/logger");

logger.info("createPaymentIntent called", { runId, participantId, amount });
logger.warn("Anthropic failed, trying OpenAI fallback", { error: error.message });
logger.error("Error creating PaymentIntent", { error: error.message });
```

**Firebase Console**
- Real-time visitor count
- Cloud Function logs
- Firestore usage
- Authentication logs
- Hosting analytics

---

## 12. FRAMTIDA UTVECKLING & FÖRBÄTTRINGAR

### 12.1 Planerade Features

**Spelmekanik**
- [ ] Team-läge (flera deltagare per lag)
- [ ] Tidsbaserade utmaningar
- [ ] Hints-system (kosta poäng för ledtråd)
- [ ] Foto-utmaningar vid checkpoints
- [ ] Achievements/badges

**Social Features**
- [ ] Vänner och följare
- [ ] Dela resultat på sociala medier
- [ ] Kommentarer på rundor
- [ ] Rating-system för rundor

**Content Management**
- [ ] Användar-genererade frågor (modererade)
- [ ] Tema-baserade rundor (historia, natur, kultur)
- [ ] Import från CSV/Excel
- [ ] Bulk-redigering av frågor

**Tekniska Förbättringar**
- [ ] WebSocket för ännu snabbare real-time
- [ ] Push-notifications (PWA)
- [ ] Offline-först arkitektur med sync
- [ ] Native apps (React Native)
- [ ] A/B-testing framework
- [ ] Advanced analytics dashboard

### 12.2 Kända Begränsningar

**OpenRouteService API**
- Gratis tier: 2000 requests/dag
- Rate limit: 40 requests/minut
- Kräver registrering och API-nyckel

**Firebase Quotas**
- Firestore: 50K reads/dag (gratis tier)
- Functions: 2M invocations/månad (gratis tier)
- Hosting: 10GB bandwidth/månad (gratis tier)

**Browser-support**
- Geolocation API: Kräver HTTPS (ej localhost)
- Service Workers: Ej Internet Explorer
- PWA install: Varierar per browser

### 12.3 Optimeringsmöjligheter

**Backend**
- Implementera Cloud Functions för run-creation (minska client-load)
- Batch-processing av analytics events
- CDN för statiska karttiles
- Server-side rendering för SEO

**Frontend**
- Code splitting per route
- Image optimization (WebP, lazy loading)
- Virtual scrolling för stora listor
- Prefetching av nästa checkpoint-data

**Database**
- Composite indexes för komplexa queries
- Firestore subcollections för bättre skalning
- Denormalisering för read-heavy operations

---

## 13. SAMMANFATTNING

**RouteQuest** är en fullfjädrad Progressive Web Application som kombinerar:

✅ **Modern React-arkitektur** med Context API och hooks
✅ **Firebase-backend** för real-time data och autentisering
✅ **Intelligent ruttgenerering** med OpenRouteService API
✅ **GPS-baserad gameplay** med proximity detection
✅ **Offline-först approach** med localStorage fallback
✅ **Monetisering** via Stripe-integration
✅ **AI-driven content** med Anthropic Claude och OpenAI
✅ **Responsive design** optimerad för mobil
✅ **PWA-capabilities** för native-liknande upplevelse

### Teknisk Styrka
- **Skalbar arkitektur**: Lagerad design med separation of concerns
- **Type-safe**: Tydliga datamodeller och validering
- **Performance**: Memoization, caching, lazy loading
- **Security**: Firestore rules, input validation, role-based access
- **Maintainability**: Modulär kod, dokumentation, enhetliga patterns

### Användarvärde
- **Enkel onboarding**: QR-kod eller 6-siffrig kod
- **Flexibel gameplay**: GPS eller manuellt läge
- **Social**: Multiplayer med real-time leaderboard
- **Pedagogisk**: Lär ut lokal historia/geografi
- **Tillgänglig**: Fungerar offline, mobil-optimerad

---

---

## 14. SENASTE UPPDATERINGAR

### 2025-10-02 - Analytics & Device Tracking Enhancement

**Nya funktioner:**

1. **Utökad enhetsdata i analyticsService.js**
   - Device type detection (mobile/tablet/desktop) baserat på user agent
   - OS detection (Windows/macOS/Linux/Android/iOS)
   - Browser detection (Chrome/Safari/Firefox/Edge)
   - Timezone detection (Intl API)
   - All data sparas automatiskt vid varje `logVisit()` anrop

2. **Förbättrad SuperUserAnalyticsPage**
   - Filter för enhetstyp, OS och webbläsare
   - "Visa unika enheter" knapp som visar detaljerad enhetslista
   - Checkbox-urval av enheter
   - Skicka meddelande direkt från statistiksidan till valda enheter
   - Enhanced event display med enhetsinfo (typ, OS, browser)

3. **Meddelandefunktion från analytics**
   - Markera enheter med checkbox
   - "Markera alla" / "Avmarkera alla" knappar
   - Meddelandedialog med titel och meddelande
   - Bulk-utskick till valda enheter
   - Integration med messageService

**Tekniska förändringar:**
- Uppdaterad analytics-datamodell med deviceType, os, browser, timezone
- Nya filter i SuperUserAnalyticsPage (deviceTypeFilter, osFilter, browserFilter)
- Ny UI för enhetslista med selekterbar lista
- Modal för meddelandekomposition

---

**Systemdokumentation skapad:** 2025-10-02
**Senast uppdaterad:** 2025-10-02
**Version:** 0.1.2
**Plattform:** React 18 + Firebase
**Språk:** Svenska (primär), Engelska (sekundär)
