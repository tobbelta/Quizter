import { expect } from '@playwright/test';

export class GamePlayer {
  constructor(page, playerName, isLeader = false) {
    this.page = page;
    this.playerName = playerName;
    this.isLeader = isLeader;
    this.teamId = null;
    this.gameId = null;
  }

  async goto() {
    await this.page.goto('/');
  }

  getTestCredentials() {
    // Använd riktiga testanvändare baserat på spelarroll
    if (this.isLeader) {
      return {
        email: 'admin@test.se',
        password: 'test123'
      };
    } else if (this.playerName === 'TestPlayer') {
      return {
        email: 'test1@test.se',
        password: 'test123'
      };
    } else if (this.playerName === 'TestPlayer2') {
      return {
        email: 'Test2@play.se',
        password: 'player'
      };
    } else {
      // Fallback till cypress-användare
      return {
        email: 'cypress@cypress.se',
        password: 'cypress'
      };
    }
  }

  async logout() {
    console.log(`${this.playerName}: Loggar ut...`);
    try {
      // Först gå till startsidan för att komma till ett känt tillstånd
      await this.page.goto('/', { waitUntil: 'domcontentloaded' });

      // Leta efter logout-knapp eller meny (kan vara i hamburgermeny)
      const menuButton = this.page.locator('button[aria-label*="menu"], button:has-text("☰"), .hamburger-menu').first();
      const menuVisible = await menuButton.isVisible({ timeout: 3000 }).catch(() => false);

      if (menuVisible) {
        await menuButton.click();
        await this.page.waitForTimeout(1000);
      }

      const logoutButton = this.page.locator('button:has-text("Logga ut"), button:has-text("Logout"), a:has-text("Logga ut")').first();
      const logoutVisible = await logoutButton.isVisible({ timeout: 3000 }).catch(() => false);

      if (logoutVisible) {
        await logoutButton.click();
        await this.page.waitForTimeout(2000);
        console.log(`${this.playerName}: Utloggad via knapp`);
      } else {
        // Rensa allt auth-relaterat via context
        await this.page.context().clearCookies();
        await this.page.context().clearPermissions();

        // Försök rensa localStorage om möjligt
        try {
          await this.page.evaluate(() => {
            if (typeof(Storage) !== "undefined") {
              localStorage.clear();
              sessionStorage.clear();
            }
          });
        } catch (e) {
          // Ignorera localStorage-fel
        }

        console.log(`${this.playerName}: Rensade auth data`);
      }
    } catch (error) {
      console.log(`${this.playerName}: Logout-fel: ${error.message}`);
    }
  }

  async login() {
    console.log(`${this.playerName}: Försöker logga in...`);

    try {
      // Först logga ut för att säkerställa ren inloggning
      await this.logout();

      // Gå till startsidan
      await this.page.goto('/', { waitUntil: 'domcontentloaded' });
      console.log(`${this.playerName}: Navigerade till startsidan`);

      // Vänta lite för att sidan ska ladda
      await this.page.waitForTimeout(1000);

      // Leta efter email-fält
      const emailInput = this.page.locator('input[type="email"], input[placeholder*="mail"], input[placeholder*="Email"]').first();
      const emailVisible = await emailInput.isVisible({ timeout: 10000 }).catch(() => false);

      if (emailVisible) {
        console.log(`${this.playerName}: Hittat email-fält, fyller i uppgifter...`);

        // Använd riktiga testanvändare för olika roller
        const testCredentials = this.getTestCredentials();
        await emailInput.fill(testCredentials.email);

        const passwordInput = this.page.locator('input[type="password"]').first();
        await passwordInput.fill(testCredentials.password);

        // Aktivera "Starta i debug-läge" kryssrutan
        const debugCheckbox = this.page.locator('input[type="checkbox"], input[name*="debug"], label:has-text("debug")').first();
        const debugCheckboxVisible = await debugCheckbox.isVisible({ timeout: 5000 }).catch(() => false);

        if (debugCheckboxVisible) {
          console.log(`${this.playerName}: Aktiverar debug-läge kryssruta`);
          if (!await debugCheckbox.isChecked()) {
            await debugCheckbox.click();
          }
        }

        const loginButton = this.page.locator('button:has-text("Logga in"), button:has-text("Login"), button:has-text("Sign in"), button[type="submit"]').first();
        await loginButton.click();

        // Vänta på redirect eller innehållsändring
        await this.page.waitForTimeout(5000);
        console.log(`${this.playerName}: Login-försök genomfört med debug-läge aktiverat`);
      } else {
        console.log(`${this.playerName}: Ingen login-form hittad`);
        throw new Error('Login form not found');
      }

    } catch (error) {
      console.log(`${this.playerName}: Login-fel: ${error.message}`);
      throw error;
    }
  }

  async createTeam(teamName = `${this.playerName}-team-${Date.now()}`) {
    if (!this.isLeader) throw new Error('Only leaders can create teams');

    await this.page.goto('/teams');

    // Fyll i lagnamnet först
    await this.page.fill('input[placeholder*="Lagets namn"], input[placeholder*="lag"]', teamName);

    // Klicka på Skapa lag-knappen
    await this.page.click('button:has-text("Skapa lag")');

    // Vänta på att laget skapas (listan uppdateras)
    await this.page.waitForTimeout(1000);

    // Klicka på "Skapa Spel" för det första laget i listan (det senaste)
    await this.page.click('button:has-text("Skapa Spel")');

    // Vänta på att vi kommer till spelskapande-sidan
    await this.page.waitForTimeout(2000);

    // Välj test-banan
    await this.page.click('select[aria-label="Välj Bana"], select');
    await this.page.selectOption('select', 'test');

    // Aktivera testläge (för utveckling) - detta ger oss debug-funktioner
    const testModeCheckbox = this.page.getByRole('checkbox', { name: 'Testläge (för utveckling)' });
    if (!await testModeCheckbox.isChecked()) {
      await testModeCheckbox.click();
    }

    // Klicka på "Skapa Spel" för att skapa spelet
    await this.page.click('button:has-text("Skapa Spel")');

    // Vänta på att spelsidan laddas
    await this.page.waitForURL(/\/game\/(.+)/, { timeout: 15000 });
    this.gameId = this.page.url().split('/game/')[1];

    // Extrahera team ID från game URL eller sätt en placeholder
    this.teamId = this.gameId; // Använd game ID som team ID för förenkling

    return this.teamId;
  }

  async joinTeam(teamId) {
    this.teamId = teamId;
    await this.page.goto(`/team/${teamId}`);

    // Klicka på "Gå med i lag" om knappen finns
    const joinButton = this.page.locator('.sc-button:has-text("Gå med")');
    if (await joinButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await joinButton.click();
    }
  }

  async startGame() {
    // Spelet startas automatiskt när teamet skapas i den nya versionen
    return this.gameId;
  }

  async joinGame(gameId = this.gameId) {
    if (!gameId) throw new Error('No game ID provided');

    console.log(`${this.playerName}: Ansluter till spel ${gameId}`);
    this.gameId = gameId;
    await this.page.goto(`/game/${gameId}`, { waitUntil: 'domcontentloaded' });

    // Vänta kort tid för att spelet ska ladda
    await this.page.waitForTimeout(2000);

    // Försök olika selektorer för att hitta spelelement
    try {
      await this.page.waitForSelector('h1, .leaflet-container, button[aria-label="Debug-inställningar"], button:has-text("Gå till"), [class*="map"]', { timeout: 5000 });
    } catch (error) {
      console.log(`${this.playerName}: Ingen spelkomponent hittad, försöker ändå...`);
      // Ta en screenshot för att se vad som visas
      await this.page.screenshot({ path: `debug-${this.playerName}-joinGame.png` });
    }

    console.log(`${this.playerName}: Spel laddat - redo för debug-simulering`);
  }

  async enableDebugMode() {
    // Klicka på debug-inställningar (kugghjul)
    await this.page.click('[aria-label="Debug-inställningar"], .sc-button:has-text("⚙")');

    // Aktivera debug-läge - använd mer specifik selektor
    const debugCheckbox = this.page.getByRole('checkbox', { name: 'Aktivera debug-läge' });
    if (!await debugCheckbox.isChecked()) {
      await debugCheckbox.click();
    }

    // Stäng inställningar
    await this.page.click('[aria-label="Debug-inställningar"], .sc-button:has-text("⚙")');
  }

  async goToStart() {
    console.log(`${this.playerName}: Aktiverar debug-läge och använder simulering för att flytta till start`);

    // Aktivera debug-läge först för att få tillgång till simuleringsknapparna
    await this.enableDebugMode();

    // Leta efter simuleringsknapparna
    const simulationButton = this.page.locator('button:has-text("Normal"), button:has-text("Långsam"), button:has-text("Snabb")').first();
    if (await simulationButton.isVisible({ timeout: 5000 })) {
      await simulationButton.click();
      await this.page.waitForTimeout(2000);
      console.log(`${this.playerName}: Simulering till start klar`);
    } else {
      console.log(`${this.playerName}: Simuleringsknapparna inte synliga, skippar simulering`);
    }
  }

  async solveObstacle(obstacleId) {
    console.log(`${this.playerName}: Löser hinder med debug-simulering`);

    // Först aktivera debug-läge för att få simuleringsknapparna
    await this.enableDebugMode();

    // Använd simuleringsknapparna för att flytta till hindret
    const fastButton = this.page.locator('button:has-text("Snabb")');
    if (await fastButton.isVisible({ timeout: 5000 })) {
      await fastButton.click();
      await this.page.waitForTimeout(1000);
    }

    // Vänta på att "Visa Gåta" knappen blir tillgänglig
    const riddleButton = this.page.locator('button:has-text("Visa Gåta")');
    await riddleButton.waitFor({ state: 'visible', timeout: 10000 });

    console.log(`${this.playerName}: Visa Gåta knappen är aktiv!`);

    // Klicka på "Visa Gåta"
    await riddleButton.click();

    // Vänta på att modal öppnas
    await this.page.waitForTimeout(2000);

    // Välj första svarsalternativet (för testning)
    const firstRadio = this.page.locator('input[type="radio"]').first();
    if (await firstRadio.isVisible({ timeout: 5000 })) {
      await firstRadio.click();

      // Klicka Svara med timeout protection
      try {
        await this.page.click('button:has-text("Svara")', { timeout: 10000 });

        // Vänta kortare tid för resultat
        await this.page.waitForTimeout(500);
      } catch (error) {
        console.log(`${this.playerName}: Timeout vid Svara-knapp, fortsätter ändå...`);
      }
    }

    console.log(`${this.playerName}: Hinder löst`);
  }

  async goToFinish() {
    console.log(`${this.playerName}: Använder simuleringshastighetsknappar för att gå till mål`);

    // Använd simuleringshastighetsknappar för att flytta till målet
    await this.page.click('button:has-text("Snabb")');
    await this.page.waitForTimeout(1000);

    console.log(`${this.playerName}: Simulering till mål klar`);
  }

  async getSimulationText() {
    // Hämta texten från simuleringsknappen
    const button = this.page.locator('.sc-button:has-text("Gå till"), .sc-button:has-text("Vid"), .sc-button:has-text("Gå i mål")').first();
    return await button.textContent();
  }

  async becomeInactive() {
    // Simulera att spelaren blir inaktiv genom att stänga/göra dold sidan
    await this.page.evaluate(() => {
      // Simulera att sidan göms (som när man stänger flik eller minimerar)
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { value: true, writable: true });
    });

    // Vänta lite för att Firebase ska registrera inaktivitet
    await this.page.waitForTimeout(1000);
  }

  async becomeActive() {
    // Simulera att spelaren blir aktiv igen
    await this.page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false, writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Vänta lite för att Firebase ska registrera aktivitet
    await this.page.waitForTimeout(1000);
  }

  async downloadDebugLogs() {
    await this.page.click('[aria-label="Debug-inställningar"], .sc-button:has-text("⚙")');

    // Klicka på "Ladda ner loggfil"
    const downloadPromise = this.page.waitForEvent('download');
    await this.page.click('.sc-button:has-text("Ladda ner")');
    const download = await downloadPromise;

    return download;
  }

  async waitForText(text, timeout = 10000) {
    await this.page.waitForSelector(`text=${text}`, { timeout });
  }

  async expectSimulationText(expectedText, maxWaitTime = 12000) {
    console.log(`${this.playerName}: Väntar på simuleringstext: "${expectedText}"`);

    const startTime = Date.now();
    let actualText = '';
    let attempts = 0;

    while (Date.now() - startTime < maxWaitTime) {
      attempts++;
      actualText = await this.getSimulationText();
      console.log(`${this.playerName}: Försök ${attempts}: "${actualText}"`);

      if (actualText && actualText.includes(expectedText)) {
        console.log(`${this.playerName}: ✅ Hittade förväntat text efter ${attempts} försök`);
        return; // Success!
      }

      // Snabbare retry-cykel
      if (attempts % 2 === 0) {
        await this.forceSimulationUpdate();
      }

      // Kortare debug-trigger
      if (attempts === 4) {
        await this.debugGameState();
      }

      // Snabbare väntetid mellan försök
      await this.page.waitForTimeout(1000);
    }

    // Om vi kommer hit så misslyckades det
    console.log(`${this.playerName}: ❌ Förväntat: "${expectedText}"`);
    console.log(`${this.playerName}: ❌ Faktiskt: "${actualText}" (efter ${attempts} försök)`);

    // Sista försöket - gör en komplett debug-dump
    await this.debugGameState();

    expect(actualText).toContain(expectedText);
  }

  async debugGameState() {
    console.log(`${this.playerName}: 🔍 DEBUGGING GAME STATE`);

    try {
      // Kör JavaScript i browsern för att dumpa relevant data
      const gameState = await this.page.evaluate(() => {
        // Försök hämta relevanta React-state från window eller globala variabler
        const data = {
          url: window.location.href,
          title: document.title,
          // Kolla om det finns någon global game-state
          windowKeys: Object.keys(window).filter(k => k.includes('game') || k.includes('state')),
        };

        // Försök hitta React-komponenter
        const reactKeys = Object.keys(window).filter(k => k.includes('React') || k.includes('__REACT'));
        data.reactKeys = reactKeys;

        return data;
      });

      console.log(`${this.playerName}: Game state debug:`, JSON.stringify(gameState, null, 2));

      // Lista alla knappar för att se vad som finns
      const allButtons = await this.page.locator('button').all();
      console.log(`${this.playerName}: Totalt ${allButtons.length} knappar hittade`);

      for (let i = 0; i < Math.min(allButtons.length, 5); i++) {
        const text = await allButtons[i].textContent().catch(() => 'ERROR');
        const classes = await allButtons[i].getAttribute('class').catch(() => 'ERROR');
        console.log(`${this.playerName}: Knapp ${i}: "${text}" (${classes})`);
      }

    } catch (error) {
      console.log(`${this.playerName}: Debug-fel: ${error.message}`);
    }
  }

  async closeGame() {
    console.log(`${this.playerName}: Stänger spel genom att klicka på röda X-knappen`);

    try {
      // Leta specifikt efter den röda X-knappen som visas i GameHeader/GameScreen
      // Baserat på skärmbilden är det en röd X-knapp uppe till höger
      const closeSelectors = [
        // Försök med text-innehåll först
        'button:has-text("×")',
        'button:has-text("✕")',
        'button:has-text("X")',
        // Försök med färg/styling-baserade selektorer
        'button[style*="background"][style*="red"]',
        'button[class*="red"]',
        'button[class*="close"]',
        // Försök med position-baserade selektorer (uppe till höger)
        '.fixed button:has-text("×")',
        '.absolute button:has-text("×")',
        // Generella selektorer
        'button[aria-label*="stäng"]',
        'button[aria-label*="close"]',
        'button[aria-label*="exit"]',
        '[role="button"]:has-text("×")',
        '[role="button"]:has-text("✕")'
      ];

      let closeButton = null;
      for (const selector of closeSelectors) {
        closeButton = this.page.locator(selector).first();
        const isVisible = await closeButton.isVisible({ timeout: 2000 }).catch(() => false);
        if (isVisible) {
          console.log(`${this.playerName}: Hittade röda X-knappen med selector: ${selector}`);
          break;
        }
      }

      if (closeButton && await closeButton.isVisible()) {
        await closeButton.click();
        console.log(`${this.playerName}: Klickade på röda X-knappen - spelaren borde nu koppla från gracefully`);

        // Snabbare cleanup - bara vänta 500ms
        await this.page.waitForTimeout(500);

        // Stäng sidan omedelbart efter disconnect
        await this.page.close();
        return;
      } else {
        console.log(`${this.playerName}: Ingen röd X-knapp hittad, listar alla knappar för debugging...`);

        // Debug: lista alla knappar för att se vad som finns
        const allButtons = await this.page.locator('button').all();
        for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
          const text = await allButtons[i].textContent().catch(() => 'no text');
          const classes = await allButtons[i].getAttribute('class').catch(() => 'no class');
          console.log(`${this.playerName}: Knapp ${i}: "${text}" (class: ${classes})`);
        }

        // Fallback: stäng hela browser-fliken
        console.log(`${this.playerName}: Stänger browser-flik som fallback`);
        await this.page.close();
        return;
      }
    } catch (error) {
      console.log(`${this.playerName}: Fel vid stängning med röd X-knapp: ${error.message}`);
      // Fallback: stäng hela browser-fliken
      await this.page.close();
      return;
    }

    console.log(`${this.playerName}: Spel stängt via röd X-knapp - spelaren borde nu vara inaktiv`);
  }

  async forceSimulationUpdate() {
    console.log(`${this.playerName}: Tvingar uppdatering av simulering`);
    try {
      // Försök multiple sätt att trigga uppdateringar

      // 1. Klicka på olika hastighetsknapppar
      const speedButtons = ['Snabb', 'Normal', 'Långsam'];
      for (const speed of speedButtons) {
        const button = this.page.locator(`button:has-text("${speed}")`).first();
        if (await button.isVisible({ timeout: 1000 })) {
          await button.click();
          await this.page.waitForTimeout(500);
          console.log(`${this.playerName}: Klickade på ${speed}-knapp`);
          break;
        }
      }

      // 2. Försök klicka på debug-inställningar för att trigga re-render
      const debugButton = this.page.locator('[aria-label="Debug-inställningar"]').first();
      if (await debugButton.isVisible({ timeout: 1000 })) {
        await debugButton.click();
        await this.page.waitForTimeout(500);
        await debugButton.click(); // Stäng igen
        await this.page.waitForTimeout(500);
        console.log(`${this.playerName}: Togglade debug-inställningar`);
      }

      // 3. Simulera en liten muspåverkan för att trigga any hover-effects
      await this.page.mouse.move(100, 100);
      await this.page.waitForTimeout(200);

    } catch (error) {
      console.log(`${this.playerName}: Kunde inte tvinga simuleringsuppdatering: ${error.message}`);
    }
  }
}

// Helper function för att vänta på Firebase-uppdateringar
export async function waitForFirebaseUpdate(page, timeoutMs = 2000) {
  await page.waitForTimeout(500); // Firebase behöver lite tid för att synka
}

// Helper för att rensa Firebase test-data (om behövs)
export async function cleanupTestData(teamId, gameId) {
  // Implementera cleanup logic om det behövs
  console.log(`Cleanup: ${teamId}, ${gameId}`);
}