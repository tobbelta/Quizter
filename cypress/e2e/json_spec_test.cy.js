// cypress/e2e/json_spec_test.cy.js

describe('Spelflöde baserat på JSON-specifikation', () => {
  
  // Ladda in testdata från fixture-filen innan testerna körs
  beforeEach(function () {
    cy.fixture('game_data.json').then((data) => {
      // Gör datan tillgänglig i hela testet via "this.data"
      this.data = data;
    });

    // Logga in användaren
    cy.visit('/');
    cy.get("h1:contains('Mina Lag'), h2:contains('Logga in på GeoQuest')", { timeout: 10000 }).should('be.visible');

    cy.get('body').then(($body) => {
      if (!$body.find(`p:contains('Välkommen, cypress!')`).length > 0) {
        cy.log('Loggar in testanvändare...');
        if ($body.find("h2:contains('Logga in på GeoQuest')").length === 0) {
            cy.contains('button', 'Logga ut').click();
        }
        cy.get('input[type="email"]').type('cypress@cypress.se');
        cy.get('input[type="password"]').type('cypress');
        cy.get('button[type="submit"]').click();
      } else {
          cy.log('Testanvändare är redan inloggad.');
      }
      cy.contains('Mina Lag').should('be.visible');
    });
  });

  it('kan spela igenom en bana från start till mål med data från fixture', function () {
    // Extrahera data från fixture för enklare åtkomst
    const teamName = this.data.teamDetails.name;
    const courseName = this.data.courseDetails.name;
    const START_COORDS = this.data.courseDetails.start;
    const OBSTACLE_1_COORDS = this.data.courseDetails.obstacles[0].position;
    const FINISH_COORDS = this.data.courseDetails.finish;
    const CORRECT_ANSWER_INDEX = this.data.courseDetails.obstacles[0].details.correctAnswer;

    // Hjälpfunktion för att simulera GPS
    const mockLocation = (latitude, longitude) => ({
      onBeforeLoad(win) {
        cy.stub(win.navigator.geolocation, 'watchPosition', (cb) => {
          cb({ coords: { latitude, longitude } });
        });
      },
    });

    // 1. Gå till lobbyn
    cy.contains('Laddar lag...').should('not.exist');
    cy.contains('li', teamName).find('button').click();
    cy.contains(`Lobby för ${teamName}`).should('be.visible');

    // 2. Starta spelet
    cy.get('body').then(($body) => {
      if ($body.find("button:contains('Starta Spel')").length > 0) {
        cy.log('Startar nytt spel...');
        if (this.data.gameDetails.isTestMode) {
            cy.get('#test-mode').check();
        }
        cy.contains('Starta Spel').click();
      } else {
        cy.log('Ansluter till pågående spel...');
      }
    });
    
    // 3. Gå till startpositionen
    cy.url().should('include', '/game/').then((url) => {
        const gameId = url.split('/game/')[1];
        cy.log(`Spel-ID: ${gameId}`);
        cy.log('Simulerar position vid START...');
        cy.visit(`/game/${gameId}`, mockLocation(START_COORDS.lat, START_COORDS.lng));
    });
    
    // 4. Verifiera att spelet har startat
    cy.get('.font-mono', { timeout: 10000 }).should('not.contain', '00:00:00');
    
    // 5. Gå till första hindret
    cy.url().should('include', '/game/').then((url) => {
        const gameId = url.split('/game/')[1];
        cy.log('Simulerar position vid HINDER 1...');
        cy.visit(`/game/${gameId}`, mockLocation(OBSTACLE_1_COORDS.lat, OBSTACLE_1_COORDS.lng));
    });

    // 6. Svara på gåtan (om den visas)
    cy.get('body').then(($body) => {
        if ($body.find("h2:contains('Gåta!')").length > 0) {
            cy.log(`Svarar på gåtan med alternativ index ${CORRECT_ANSWER_INDEX}...`);
            cy.get('.grid button').eq(CORRECT_ANSWER_INDEX).click();
            cy.contains('Gåta!').should('not.exist');
        } else {
            cy.log('Hindret verkar redan vara löst. Fortsätter direkt till mål.');
        }
    });

    // 7. Gå till målflaggan
    cy.url().should('include', '/game/').then((url) => {
        const gameId = url.split('/game/')[1];
        cy.log('Simulerar position vid MÅL...');
        cy.visit(`/game/${gameId}`, mockLocation(FINISH_COORDS.lat, FINISH_COORDS.lng));
    });

    // 8. Verifiera resultatsidan
    cy.url({ timeout: 10000 }).should('include', '/report/');
    cy.contains('Spelrapport').should('be.visible');
    cy.log(`Testet för '${courseName}' slutfördes framgångsrikt!`);
  });
});
