// cypress/e2e/gameplay.cy.js

describe('Spelflöde med simulerad GPS', () => {
  // Koordinater för testet (BYT UT DESSA!)
  const START_FLAG_COORDS = { latitude: 59.3293, longitude: 18.0686 };
  const OBSTACLE_1_COORDS = { latitude: 59.3295, longitude: 18.0690 };

  // Funktion för att simulera GPS-position
  const mockLocation = (latitude, longitude) => {
    return {
      onBeforeLoad(win) {
        cy.stub(win.navigator.geolocation, 'watchPosition', (cb) => {
          // Anropa callbacken direkt med den simulerade positionen
          cb({ coords: { latitude, longitude } });
        });
      },
    };
  };

  it('kan starta ett spel, nå startflaggan och lösa första gåtan', () => {
    // Steg 1: Logga in
    cy.visit('/');
    cy.get('input[type="email"]').type('cypress@cypress.se');
    cy.get('input[type="password"]').type('cypress');
    cy.get('button[type="submit"]').click();

    // Steg 2: Gå till lobbyn och starta spelet
    // OBS: Byt ut 'Testlaget' mot namnet på ett existerande lag
    cy.contains('cypress').click();
    cy.contains('Starta Spel').click();
    
    // Steg 3: Hämta spel-ID från URL:en och besök spelsidan med simulerad GPS
    cy.url().should('include', '/game/').then((url) => {
        const gameId = url.split('/game/')[1];
        cy.visit(`/game/${gameId}`, mockLocation(START_FLAG_COORDS.latitude, START_FLAG_COORDS.longitude));
    });
    
    // Verifiera att spelet har startat (timern är inte 00:00:00)
    cy.get('.font-mono').should('not.contain', '00:00:00');
    
    // Steg 4: Gå till första hindret (Simulera ny position)
     cy.url().should('include', '/game/').then((url) => {
        const gameId = url.split('/game/')[1];
        cy.visit(`/game/${gameId}`, mockLocation(OBSTACLE_1_COORDS.latitude, OBSTACLE_1_COORDS.longitude));
    });

    // Verifiera att gåtan dyker upp
    cy.contains('Gåta!').should('be.visible');
    
    // Steg 5: Svara på gåtan (klicka på det första alternativet, antag att det är rätt)
    cy.get('.grid button').first().click();

    // Verifiera att gåtan försvinner
    cy.contains('Gåta!').should('not.exist');
  });
});
