// cypress/e2e/gameplay.cy.js

describe('Spelflöde med simulerad GPS', () => {
  // --- Konfiguration för testet ---
  // ANPASSNING: Byt ut dessa värden mot dina egna.
  const testUser = {
    email: 'cypress@cypress.se',
    password: 'cypress',
    displayName: 'cypress' // Lade till visningsnamn för tydlighet
  };
  const teamName = 'Testlaget'; // Namnet på laget som testanvändaren är med i.
  const corruptCourseTeamName = 'Korrupt Testlag'; // Ett separat lag för att testa den korrupta banan.
  
  // ANPASSNING: Byt ut mot koordinaterna för din testbana.
  const START_FLAG_COORDS = { latitude: 59.3293, longitude: 18.0686 };
  const OBSTACLE_1_COORDS = { latitude: 59.3295, longitude: 18.0690 };
  const OBSTACLE_2_COORDS = { latitude: 59.3297, longitude: 18.0695 }; // Används för den korrupta banan
  const FINISH_COORDS = { latitude: 59.3300, longitude: 18.0700 }; // Byt ut!


  /**
   * En hjälpfunktion som "mockar" (simulerar) webbläsarens GPS-position.
   * När spelet frågar efter positionen, ger Cypress tillbaka de värden vi anger här.
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

  // Denna funktion körs före varje enskilt test i denna fil.
  // Den säkerställer att rätt testanvändare är inloggad.
  beforeEach(() => {
    // Besök startsidan.
    cy.visit('/');

    // Vänta på att antingen inloggningssidan eller "Mina Lag"-sidan laddas.
    // Detta hanterar race condition vid appens initiala laddning.
    cy.get("h1:contains('Mina Lag'), h2:contains('Logga in på GeoQuest')", { timeout: 10000 }).should('be.visible');

    // Använd en `then` för att kunna använda if/else-logik baserat på sidans innehåll.
    cy.get('body').then(($body) => {
      // Fall 1: Vi är redan inloggade (ser "Mina Lag"-sidan).
      if ($body.find("h1:contains('Mina Lag')").length > 0) {
        // Kolla om vi är inloggade som RÄTT användare genom att leta efter visningsnamnet.
        if ($body.find(`p:contains('Välkommen, ${testUser.displayName}!')`).length > 0) {
          // Rätt användare är redan inloggad, gör ingenting.
          cy.log('Rätt användare är redan inloggad.');
        } else {
          // FEL användare är inloggad, logga ut och logga in på nytt.
          cy.log('Fel användare inloggad, loggar ut...');
          cy.contains('button', 'Logga ut').click();
          
          // Verifiera att vi är utloggade (tillbaka på inloggningssidan).
          cy.contains('Logga in på GeoQuest').should('be.visible');

          // Logga in som rätt användare.
          cy.get('input[type="email"]').type(testUser.email);
          cy.get('input[type="password"]').type(testUser.password);
          cy.get('button[type="submit"]').click();
        }
      } 
      // Fall 2: Vi är INTE inloggade (ser inloggningsformuläret).
      else {
        cy.log('Ingen användare inloggad, loggar in...');
        cy.get('input[type="email"]').type(testUser.email);
        cy.get('input[type="password"]').type(testUser.password);
        cy.get('button[type="submit"]').click();
      }

      // Oavsett vilket flöde vi tog, verifiera att vi nu är inloggade som rätt användare
      // och är på "Mina Lag"-sidan.
      cy.contains('Mina Lag').should('be.visible');
      cy.contains(`Välkommen, ${testUser.displayName}!`).should('be.visible');
    });
  });

  it('kan spela igenom en hel bana från start till mål', () => {
    // Vänta på att "Laddar lag..." försvinner, vilket indikerar att datan har laddats.
    cy.contains('Laddar lag...').should('not.exist');

    // Leta upp listelementet som innehåller lagets namn och klicka sedan på knappen inuti det.
    cy.contains('li', teamName).find('button').click();

    // Kontrollera om spelet redan är startat.
    cy.get('body').then(($body) => {
      // Om knappen "Starta Spel" finns...
      if ($body.find("button:contains('Starta Spel')").length > 0) {
        // ...aktivera testläget och klicka på den för att starta ett nytt spel.
        cy.get('#test-mode').check();
        cy.contains('Starta Spel').click();
      }
      // Om knappen inte finns, antar vi att vi redan har omdirigerats till ett pågående spel.
    });
    
    // Hämta spel-ID från URL:en och besök spelsidan med simulerad GPS vid starten.
    cy.url().should('include', '/game/').then((url) => {
        const gameId = url.split('/game/')[1];
        cy.visit(`/game/${gameId}`, mockLocation(START_FLAG_COORDS.latitude, START_FLAG_COORDS.longitude));
    });
    
    // Verifiera att spelet har startat (timern är inte 00:00:00).
    cy.get('.font-mono').should('not.contain', '00:00:00');
    
    // Gå till första hindret (Simulera ny position).
     cy.url().should('include', '/game/').then((url) => {
        const gameId = url.split('/game/')[1];
        cy.visit(`/game/${gameId}`, mockLocation(OBSTACLE_1_COORDS.latitude, OBSTACLE_1_COORDS.longitude));
    });

    // Vänta på att sidan laddas klart (spinnern försvinner)
    cy.get('.animate-spin').should('not.exist');

    // Verifiera att gåtan dyker upp och svara.
    cy.contains('Gåta!').should('be.visible');
    cy.get('.grid button').first().click();
    cy.contains('Gåta!').should('not.exist');

    // Gå till målflaggan.
    cy.url().should('include', '/game/').then((url) => {
        const gameId = url.split('/game/')[1];
        cy.visit(`/game/${gameId}`, mockLocation(FINISH_COORDS.latitude, FINISH_COORDS.longitude));
    });

    // Verifiera att vi har kommit till resultatsidan.
    cy.url().should('include', '/report/');
    cy.contains('Spelrapport').should('be.visible');
  });

  it('hoppar över ett hinder med felaktig data och slutför sedan banan', () => {
    // Vänta på att "Laddar lag..." försvinner, vilket indikerar att datan har laddats.
    cy.contains('Laddar lag...').should('not.exist');

    // Förutsättning: Du måste manuellt ha skapat en bana som heter "Korrupt Testbana"
    // där det första hindret saknar en fråga eller svarsalternativ i databasen.
    cy.contains('li', corruptCourseTeamName).find('button').click();
    
    cy.get('body').then(($body) => {
      if ($body.find("button:contains('Starta Spel')").length > 0) {
        cy.get('#test-mode').check();
        cy.contains('Starta Spel').click();
      }
    });

    // Sätt upp en "interceptor" som lyssnar på nätverksanrop till Firestore.
    cy.intercept('POST', '**/google.firestore.v1.Firestore/Write/**').as('firestoreWrite');

    // Hämta spel-ID och besök spelsidan med simulerad GPS vid starten
    cy.url().should('include', '/game/').then((url) => {
        const gameId = url.split('/game/')[1];
        cy.visit(`/game/${gameId}`, mockLocation(START_FLAG_COORDS.latitude, START_FLAG_COORDS.longitude));
    });

    // Gå till det korrupta hindret
    cy.url().should('include', '/game/').then((url) => {
        const gameId = url.split('/game/')[1];
        cy.visit(`/game/${gameId}`, mockLocation(OBSTACLE_1_COORDS.latitude, OBSTACLE_1_COORDS.longitude));
    });
    
    // Vänta på att appen ska skicka uppdateringen till databasen (när den hoppar över hindret).
    cy.wait('@firestoreWrite');

    // Verifiera att gåtan INTE dyker upp
    cy.contains('Gåta!').should('not.exist');

    // Hitta den nya orangea hinder-markören och klicka på den för att öppna popupen
    cy.get('img.leaflet-marker-icon[src*="orange"]').click({ force: true });

    // Verifiera att spelet har gått vidare genom att läsa texten i den nu öppna popupen
    cy.get('.leaflet-popup-content').should('contain', 'Hinder 2');

    // Gå till andra (giltiga) hindret
    cy.url().should('include', '/game/').then((url) => {
        const gameId = url.split('/game/')[1];
        cy.visit(`/game/${gameId}`, mockLocation(OBSTACLE_2_COORDS.latitude, OBSTACLE_2_COORDS.longitude));
    });

    // Vänta på att sidan laddas klart (spinnern försvinner)
    cy.get('.animate-spin').should('not.exist');

    // Verifiera att gåtan dyker upp och svara
    cy.contains('Gåta!').should('be.visible');
    cy.get('.grid button').first().click();
    cy.contains('Gåta!').should('not.exist');

    // Gå till målflaggan
    cy.url().should('include', '/game/').then((url) => {
        const gameId = url.split('/game/')[1];
        cy.visit(`/game/${gameId}`, mockLocation(FINISH_COORDS.latitude, FINISH_COORDS.longitude));
    });

    // Verifiera att vi har kommit till resultatsidan.
    cy.url().should('include', '/report/');
    cy.contains('Spelrapport').should('be.visible');
  });
});
