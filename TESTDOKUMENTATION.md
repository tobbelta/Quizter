# GeoQuest Testdokumentation

En komplett guide för att testa GeoQuest-appen både manuellt och automatiskt, inklusive mobiltestning med ngrok.

## 📱 Snabbstart för Mobiltestning med ngrok

### Installation av ngrok

1. **Ladda ner ngrok** från https://ngrok.com/
2. **Registrera ett konto** (gratis) för autentisering
3. **Installera ngrok** globalt:
   ```bash
   npm install -g ngrok
   ```

   Eller ladda ner binären direkt från hemsidan.

4. **Autentisera ngrok** med din token:
   ```bash
   ngrok authtoken [din-token-från-ngrok-dashboard]
   ```

### Starta appen för mobiltestning

1. **Starta React-appen lokalt:**
   ```bash
   npm start
   ```
   Appen körs på http://localhost:3000

2. **Öppna ngrok-tunnel i nytt terminalfönster:**
   ```bash
   ngrok http 3000
   ```

3. **Anteckna den publika URL:en** som ngrok visar:
   ```
   Forwarding: https://abc123.ngrok.io -> http://localhost:3000
   ```

4. **Öppna appen på mobilen** genom att navigera till ngrok-URL:en
5. **Aktivera GPS-tillstånd** när webbläsaren frågar

### Fördelar med ngrok för mobiltestning

- ✅ **Riktig GPS-data** - använder telefonens faktiska position
- ✅ **Touch-interaktioner** - testa pekskärm och gester
- ✅ **Mobil prestanda** - se hur appen beter sig på riktiga enheter
- ✅ **Nätverksförhållanden** - testa med mobildata/WiFi
- ✅ **Olika skärmstorlekar** - iPhone, Android, surfplattor

### Tips för ngrok-testning

- **Säker HTTPS:** ngrok ger automatiskt HTTPS, vilket krävs för GPS-funktioner
- **Delning:** Du kan dela ngrok-URL:en med andra för grupptestning
- **Inspektering:** Besök http://localhost:4040 för att se HTTP-trafik
- **Stabil session:** Använd `ngrok http 3000 --region eu` för europeiska servrar

---

## 🧪 Manuell Testning

### Förberedelser

1. **Starta applikationen:**
   ```bash
   npm start
   ```

2. **Öppna flera webbläsarfönster/flikar** för att simulera flera spelare:
   - Fönster 1: Lagledare
   - Fönster 2: Spelare 1
   - Fönster 3: Spelare 2 (vid behov)

3. **Aktivera GPS-simulering** (för desktop-testning):
   - Chrome: F12 → Console → Settings → Sensors → Custom location
   - Firefox: F12 → Settings → Advanced Settings → Override geolocation

### Grundläggande Funktionstest

#### Test 1: Laghantering
- [ ] Skapa nytt lag som lagledare
- [ ] Kopiera lag-ID
- [ ] Anslut spelare till laget med lag-ID
- [ ] Verifiera att lagmedlemmar visas korrekt
- [ ] Testa att ändra spelarnamn

#### Test 2: Spelstart och navigation
- [ ] Starta spel som lagledare
- [ ] Kontrollera att alla spelare ser startposition på kartan
- [ ] Testa simuleringsknapparna (Långsam/Normal/Snabb)
- [ ] Verifiera att positionsuppdateringar fungerar
- [ ] Kontrollera att alla ser samma spelstatus

#### Test 3: Gåtlösning
- [ ] Navigera till första hindret
- [ ] Öppna gåtan som lagledare
- [ ] Kontrollera att spelare kan se samma gåta
- [ ] Lös gåtan korrekt
- [ ] Verifiera att alla får notifikation om korrekt svar
- [ ] Fortsätt till nästa hinder

### Avancerade Testscenarios

#### Scenario 1: Spelare blir inaktiv och återansluter
**Syfte:** Testa systemets hantering av inaktiva spelare

1. **Setup:**
   - Lagledare skapar lag
   - Spelare ansluter och startar spel

2. **Test:**
   - Båda löser första gåtan
   - Simulera att spelare blir inaktiv (stäng webbläsare)
   - Lagledare navigerar vidare
   - Kontrollera att systemet markerar spelare som inaktiv
   - Spelare återansluter (öppna ny flik)
   - Verifiera att spelare synkroniseras korrekt

3. **Förväntad output:**
   - [x] Inaktiv spelare markeras tydligt i UI
   - [x] Lagledare kan fortsätta spelet
   - [x] Återanslutning fungerar sömlöst
   - [x] All data synkroniseras korrekt

#### Scenario 2: Spelare ansluter mitt i pågående spel
**Syfte:** Testa att nya spelare kan ansluta efter spelstart

1. **Setup:**
   - Lagledare startar spel ensam
   - Löser första hindret

2. **Test:**
   - Spelare ansluter efter första hindret är löst
   - Kontrollera att spelare får korrekt spelstatus
   - Verifiera att simulering visar rätt hinder
   - Båda löser nästa hinder tillsammans

3. **Förväntad output:**
   - [x] Spelare får aktuell spelposition
   - [x] Simuleringstext är korrekt ("Gå till X hindret")
   - [x] Inga konflikter i spellogiken

#### Scenario 3: Simultana gåtlösningar
**Syfte:** Testa hantering av flera spelare som löser gåtor samtidigt

1. **Test:**
   - Båda spelare öppnar samma gåta
   - Båda försöker svara samtidigt
   - Verifiera att endast första korrekta svar registreras

2. **Förväntad output:**
   - [x] Inga duplicerade poäng
   - [x] Korrekt tidsstämplar
   - [x] Båda spelare ser rätt status

### Felhanteringstest

#### Test: Nätverksavbrott
- [ ] Simulera nätverksavbrott mitt i spel
- [ ] Kontrollera felhantering och återanslutning
- [ ] Verifiera att data inte går förlorad

#### Test: Ogiltiga inputs
- [ ] Testa ogiltiga lag-ID:n
- [ ] Försök ansluta till fullt lag
- [ ] Testa extremt långa spelarnamn

#### Test: GPS-problem
- [ ] Testa utan GPS-tillåtelse
- [ ] Simulera GPS-fel
- [ ] Kontrollera fallback-funktionalitet

---

## 🤖 Automatisk Testning med Playwright

### Installation och Setup

```bash
# Installera dependencies
npm install

# Installera Playwright browsers
npx playwright install
```

### Köra Automatiska Tester

#### Alla tester
```bash
npm run test:e2e
```

#### Visualiserad testning (rekommenderas för första körningen)
```bash
npm run test:e2e:ui
```

#### Debug-läge (steg-för-steg)
```bash
npm run test:e2e:debug
```

#### Specifika scenarion
```bash
npm run test:scenarios
```

#### Enskilda tester
```bash
# Kör bara Scenario 4 (kritiskt)
npx playwright test --grep "Scenario 4"

# Kör bara i Chrome
npx playwright test --project=chromium
```

### Automatiserade Testscenarios

Playwright-testerna automatiserar exakt samma scenarior som de manuella testerna:

#### ✅ Scenario 1: Spelare blir inaktiv och återansluter
- Automatiserar hela flödet från laghantering till målgång
- Simulerar nätverksavbrott och återanslutning
- Verifierar korrekt datasynkronisering

#### ✅ Scenario 2: Spelare ansluter efter spelstart
- Testar sent-joining funktionalitet
- Kontrollerar korrekt spelstatus för nya spelare
- Verifierar rapportgenerering

#### ✅ Scenario 4: Spelare ansluter mitt i spel (KRITISKT)
- **Viktigt test** som kontrollerar simuleringstext
- Säkerställer att "Gå till tredje hindret" visas korrekt
- Tidigare bug: visade "Gå till andra hindret" felaktigt

#### ✅ Scenario 5: Lagledare blir inaktiv
- Testar omvänd inaktivitet (lagledare istället för spelare)
- Kontrollerar spellogik när lagledare disconnectar
- Verifierar omvalidering av gåtor

### Testrapporter

#### HTML-rapport (detaljerad)
```bash
npx playwright show-report
```

#### Automatisk textrapport
Testerna genererar automatiskt en textfil med samma format som manuella testresultat:
```
SCENARIO 1: Spelare blir inaktiv och återansluter
  1. lagledare skapar ett lag - funkar
  2. spelare 1 ansluter till laget - funkar
  3. lagledare startar spel - funkar
  ...
=== ALLA TESTER KLARADE ===
=== VERSION TESTAD: v2.8.35 ===
=== STATUS: [KOMPLETT] ===
```

### Fördelar med Automatisk Testning

- **⚡ Snabbhet:** 5 minuter vs 30+ minuter manuellt
- **🔄 Repeterbarhet:** Exakt samma steg varje gång
- **🎥 Dokumentation:** Video och screenshots vid fel
- **📊 Trendanalys:** Spårning av buggar över tid
- **🌐 Multi-browser:** Chrome, Firefox, Safari automatiskt

---

## 📊 Teststrategier och Best Practices

### När använder du vilken testmetod?

#### Manuell testning är bäst för:
- **🎨 UX/UI-feedback** - känslan av interaktioner
- **🐛 Explorativ testning** - hitta oväntade problem
- **📱 Device-specifik testning** - verkliga enheter med ngrok
- **🆕 Ny funktionalitet** - första testen av features

#### Automatisk testning är bäst för:
- **🔄 Regressionstest** - säkerställa att gamla features fungerar
- **⚡ Snabb feedback** - vid varje kodändring
- **📈 CI/CD-integration** - automatisk kvalitetskontroll
- **📊 Performance tracking** - mäta förbättringar över tid

### Testfrekvens

#### Dagligen (vid utveckling):
```bash
# Snabb smoke test
npm run test:e2e --grep "Scenario 1"
```

#### Före release:
```bash
# Fullständig testsvit
npm run test:e2e
```

#### Vid bugfixar:
```bash
# Specifikt scenario som påverkats
npx playwright test --grep "din-bug-fix"
```

### Testmiljöer

#### Lokal utveckling
- Använd `localhost:3000`
- Snabb iteration och debugging

#### Staging/testmiljö
- Använd ngrok för delad testning
- Realistiska nätverksförhållanden

#### Produktion
- Kontinuerlig övervakningar
- Real user monitoring

---

## 🔧 Troubleshooting

### Vanliga Problem och Lösningar

#### Problem: Playwright-tester fastnar på login
```javascript
// Lösning: Uppdatera gameHelpers.js med korrekt auth
await page.goto('/');
await page.waitForSelector('[data-testid="login-button"]');
```

#### Problem: GPS fungerar inte i webbläsare
```javascript
// Lösning: Aktivera location permissions
await context.grantPermissions(['geolocation']);
```

#### Problem: ngrok-session avslutas för tidigt
```bash
# Lösning: Använd gratis persistent tunnel
ngrok http 3000 --region eu
```

#### Problem: Firebase-timeouts i tester
```javascript
// Lösning: Öka timeout-värden
await waitForFirebaseUpdate(page, 30000); // 30 sekunder
```

### Debug-tips

#### För manuell testning:
1. **Använd browser dev tools** - Network tab för Firebase-anrop
2. **Console logs** - `console.log` för spelstatus
3. **React Developer Tools** - komponentstatus
4. **Firebase console** - realtidsdata

#### För automatisk testning:
1. **Playwright trace viewer:**
   ```bash
   npx playwright test --trace on
   npx playwright show-trace trace.zip
   ```

2. **Headful mode** (se webbläsaren):
   ```bash
   npx playwright test --headed
   ```

3. **Slow motion:**
   ```bash
   npx playwright test --slow-mo=1000
   ```

---

## 📈 Nästa Steg

### Förbättringar av testsystemet

1. **🔄 CI/CD-integration:**
   - Automatiska tester vid varje commit
   - Deploy endast om alla tester passerar

2. **📊 Performance testing:**
   - Lasttest med många samtidiga spelare
   - Mätning av responstider

3. **📱 Utökad mobiltestning:**
   - Automated mobile testing med Device Farm
   - Cross-platform kompatibilitet

4. **🎯 A/B-testning:**
   - Testa olika UI-varianter
   - Mäta användarengagemang

### Övervakningsintegration

```javascript
// Exempel: Lägg till performance metrics
const performanceMetrics = {
  gameLoadTime: Date.now() - startTime,
  riddlesSolved: totalRiddles,
  averageResponseTime: avgTime
};
```

---

## 📝 Sammanfattning

### Quick Reference

```bash
# Mobiltestning med ngrok
npm start
ngrok http 3000

# Manuell testning
npm start
# Öppna flera webbläsarflikar

# Automatisk testning
npm run test:e2e:ui  # Första gången
npm run test:e2e     # Vanliga körningar

# Debug specifikt scenario
npx playwright test --grep "Scenario X" --debug
```

### Testchecklista

Innan release, kontrollera att:

- [ ] ✅ Alla automatiska tester passerar
- [ ] 📱 Mobiltestning med ngrok genomförd
- [ ] 🐛 Alla kritiska scenarion testade manuellt
- [ ] 📊 Performance inom acceptabla gränser
- [ ] 🔐 Säkerhetstester utförda
- [ ] 📈 Testrapporter genererade och sparade

Med denna dokumentation har du en komplett guide för att säkerställa kvaliteten på din GeoQuest-app både under utveckling och i produktion!