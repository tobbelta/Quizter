// cypress/e2e/json_spec_test.cy.js

describe('Spelflöde baserat på JSON-specifikation', () => {
  // --- Testdata extraherad från din JSON ---
  const testUser = {
    email: 'cypress@cypress.se',
    password: 'cypress',
    displayName: 'cypress'
  };
  const teamName = 'Korrupt Testlag';
  const courseName = 'Cypress korrupt'; // Används för loggning och verifiering

  // Koordinater från JSON-data
  const START_COORDS = { latitude: 59.330064664410315, longitude: 18.069504239737157 };
  const OBSTACLE_1_COORDS = { latitude: 59.329900483319925, longitude: 18.069020970373746 };
  const FINISH_COORDS = { latitude: 59.329873119727736, longitude: 18.069954697261636 };
  
  // Svarsindex från JSON-data (0 = första alternativet)
  const CORRECT_ANSWER_INDEX = 0;

  /**
   * En hjälpfunktion som "mockar" (simulerar) webbläsarens GPS-position.
   * @param {number} latitude - Simulerad latitud.
   * @param {number} longitude - Simulerad longitud.
   */
  const mockLocation = (latitude, longitude) => {
    return {
      onBeforeLoad(win) {
        cy.stub(win.navigator.geolocation, 'watchPosition', (cb) => {
          cb({ coords: { latitude, longitude } });
        });
      },
    };
  };

  // Körs före varje test för att säkerställa inloggning
  beforeEach(() => {
    cy.visit('/');
    cy.get("h1:contains('Mina Lag'), h2:contains('Logga in på GeoQuest')", { timeout: 10000 }).should('be.visible');

    cy.get('body').then(($body) => {
      if (!$body.find(`p:contains('Välkommen, ${testUser.displayName}!')`).length > 0) {
        cy.log('Loggar in testanvändare...');
        if ($body.find("h2:contains('Logga in på GeoQuest')").length === 0) {
            cy.contains('button', 'Logga ut').click();
        }
        cy.get('input[type="email"]').type(testUser.email);
        cy.get('input[type="password"]').type(testUser.password);
        cy.get('button[type="submit"]').click();
      } else {
          cy.log('Testanvändare är redan inloggad.');
      }
      cy.contains('Mina Lag').should('be.visible');
      cy.contains(`Välkommen, ${testUser.displayName}!`).should('be.visible');
    });
  });

  it(`kan spela igenom banan '${courseName}' från start till mål`, () => {
    // 1. Vänta på att laglistan laddas
    cy.contains('Laddar lag...').should('not.exist');

    // 2. Gå till lobbyn för det specificerade laget
    cy.contains('li', teamName).find('button').click();
   // cy.contains(`Lobby för ${teamName}`).should('be.visible');

    // 3. Starta spelet i testläge
    cy.get('body').then(($body) => {
      if ($body.find("button:contains('Starta Spel')").length > 0) {
        cy.log('Startar nytt spel i testläge...');
        cy.get('#test-mode').check();
        cy.contains('Starta Spel').click();
      } else {
        cy.log('Ansluter till pågående spel...');
      }
    });
    
    // 4. Hämta spel-ID och gå till startpositionen
    cy.url().should('include', '/game/').then((url) => {
        const gameId = url.split('/game/')[1];
        cy.log(`Spel-ID är: ${gameId}`);
        cy.log('Simulerar position vid START...');
        cy.visit(`/game/${gameId}`, mockLocation(START_COORDS.latitude, START_COORDS.longitude));
    });
    
    // 5. Verifiera att spelet har startat
    cy.get('.font-mono', { timeout: 10000 }).should('not.contain', '00:00:00');
    
    // 6. Gå till första hindret
    cy.url().should('include', '/game/').then((url) => {
        const gameId = url.split('/game/')[1];
        cy.log('Simulerar position vid HINDER 1...');
        cy.visit(`/game/${gameId}`, mockLocation(OBSTACLE_1_COORDS.latitude, OBSTACLE_1_COORDS.longitude));
    });

    // 7. Svara på gåtan, ELLER gå direkt till mål om den redan är löst
    cy.get('body').then(($body) => {
        // Om gåtan dyker upp...
        if ($body.find("h2:contains('Gåta!')").length > 0) {
            cy.log(`Svarar på gåtan med alternativ index ${CORRECT_ANSWER_INDEX}...`);
            cy.get('.grid button').eq(CORRECT_ANSWER_INDEX).click();
            cy.contains('Gåta!').should('not.exist');
        } else {
            // Om gåtan INTE dyker upp, betyder det att den redan är löst
            cy.log('Hindret verkar redan vara löst. Fortsätter direkt till mål.');
        }
    });

    // 8. Gå till målflaggan
    cy.url().should('include', '/game/').then((url) => {
        const gameId = url.split('/game/')[1];
        cy.log('Simulerar position vid MÅL...');
        cy.visit(`/game/${gameId}`, mockLocation(FINISH_COORDS.latitude, FINISH_COORDS.longitude));
    });

    // 9. Verifiera att vi har kommit till resultatsidan
    cy.url({ timeout: 10000 }).should('include', '/report/');
    cy.contains('Spelrapport').should('be.visible');
    cy.log('Testet slutfördes framgångsrikt!');
  });
});
