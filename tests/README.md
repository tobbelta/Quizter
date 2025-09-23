# GeoQuest E2E Testing med Playwright

## Installation

1. Installera Playwright:
```bash
npm install
npx playwright install
```

## Kör tester

### Alla scenarion
```bash
npm run test:e2e
```

### Specifika scenarion
```bash
npm run test:scenarios
```

### Med UI (visuell testning)
```bash
npm run test:e2e:ui
```

### Debug-läge (steg-för-steg)
```bash
npm run test:e2e:debug
```

## Testscenarier

Testerna automatiserar exakt samma flöde som i din manuella testfil:

### ✅ Scenario 1: Spelare blir inaktiv och återansluter
- Lagledare skapar lag, spelare ansluter
- Båda löser gåtor, spelare blir inaktiv
- Lagledare måste lösa om gåta
- Spelare kommer tillbaka och alla går i mål

### ✅ Scenario 2: Spelare ansluter efter att lagledare löst gåta
- Lagledare startar spel ensam och löser gåta 1
- Spelare ansluter och ska kunna gå till gåta 2
- Verifierar korrekt rapportering

### ✅ Scenario 4: Spelare ansluter mitt i spel
- **KRITISKT TEST**: Verifierar att simulationstext visar rätt hinder
- Lagledare löser gåta 1, spelare ansluter och löser gåta 2
- **Kontrollerar att det står "Gå till tredje hindret" och INTE "Gå till andra hindret"**

### ✅ Scenario 5: Lagledare blir inaktiv
- Lagledare blir inaktiv efter att ha löst gåta
- Spelare måste lösa om lagledares gåta
- Verifierar korrekt omvalidering

## Testresultat

Testerna genererar automatiskt:

### 📊 HTML-rapport
```bash
npx playwright show-report
```

### 📋 Automatisk testfil (samma format som din manuella)
Genereras som: `[timestamp]-automated-test-results.txt`

Exempel:
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

## Fördelar

### 🚀 Snabbt
- Kör alla 5 scenarion på ~5 minuter istället för 30+ minuter manuellt

### 🔄 Repeterbart
- Exakt samma steg varje gång
- Inga mänskliga fel

### 📱 Multi-browser
- Testar automatiskt i Chrome, Firefox och Safari

### 🎥 Video & Screenshots
- Automatiska videos vid fel
- Screenshots av varje steg

### 📈 Trendanalys
- Spara testresultat över tid
- Se vilka områden som förbättras/försämras

## Exempel: Kör bara Scenario 4 (kritiskt test)

```bash
npx playwright test --grep "Scenario 4"
```

## Troubleshooting

### Authentication
Om testerna fastnar på login, uppdatera `gameHelpers.js` med korrekt auth-mekanism.

### Timing Issues
Justera `waitForFirebaseUpdate` timeouts om Firebase är långsamt.

### Selectors
Om UI ändras, uppdatera selectors i `gameHelpers.js`.

## Nästa steg

1. **Kör testerna första gången** för att se att allt fungerar
2. **Integrera i CI/CD** för automatisk testning vid varje deploy
3. **Lägg till fler scenarion** efter behov
4. **Performance testing** med många samtidiga spelare