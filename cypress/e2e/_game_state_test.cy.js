// cypress/e2e/game_state_test.cy.js

describe('Test av spelstatus via JSON-endpoint', () => {
  
  // --- Konfiguration för testet ---
  // ANPASSNING: Byt ut dessa värden mot en giltig användare och ett aktivt spel-ID
  const testUser = {
    email: 'cypress@cypress.se',
    password: 'cypress',
  };
  const gameId = 'gchJdkYvLNbLT7PPYtnl'; // Byt ut mot ett giltigt spel-ID från din databas

  beforeEach(() => {
    // Logga in programmatiskt för snabbhet och stabilitet
    cy.visit('/');
    cy.get('body').then(($body) => {
        if (!$body.find(`p:contains('Välkommen, cypress!')`).length > 0) {
          cy.log('Loggar in testanvändare...');
          if ($body.find("h2:contains('Logga in på GeoQuest')").length === 0) {
              cy.contains('button', 'Logga ut').click();
          }
          cy.get('input[type="email"]').type(testUser.email);
          cy.get('input[type="password"]').type(testUser.password);
          cy.get('button[type="submit"]').click();
        }
    });
    cy.contains('Mina Lag').should('be.visible');
  });

  it('kan hämta speldata och verifiera dess status', () => {
    cy.log(`Besöker JSON-endpoint för spel: ${gameId}`);
    cy.visit(`/json/${gameId}`);

    // Hämta texten från <pre>-taggen, som innehåller vår JSON
    cy.get('pre').invoke('text').then((jsonText) => {
      // Försök att parsa texten till ett JavaScript-objekt
      const parsedData = JSON.parse(jsonText);
      
      // Använd cy.wrap() för att kunna använda Cypress-assertions på objektet
      cy.wrap(parsedData).as('gameData');
    });

    // Nu kan vi köra assertions på den hämtade datan
    cy.get('@gameData').its('gameDetails').should('have.property', 'status');
    cy.get('@gameData').its('teamDetails').should('have.property', 'name');
    cy.get('@gameData').its('courseDetails').should('have.property', 'name');

    // Exempel på en mer specifik assertion:
    cy.get('@gameData').its('gameDetails.status').should('eq', 'pending');
    
    cy.log('JSON-data verifierad framgångsrikt!');
  });
});
