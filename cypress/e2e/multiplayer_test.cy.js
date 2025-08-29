// cypress/e2e/multiplayer_test.cy.js

describe('Dynamiskt multiplayer-spelflöde via JSON-endpoint', () => {
  
  const player1 = { email: 'cypress@cypress.se', password: 'cypress' };
  const player2 = { email: 'cypress2@cypress.se', password: 'cypress' };
  const gameIdToTest = '7NB3n3ipdjJyAms7SAZh'; // Byt ut mot ett giltigt spel-ID för testet

  // Hjälpfunktion för att simulera Spelare 1:s rörelse i steg
  const simulateMovement = (gameId, start, end, steps = 5, duration = 1500) => {
    const latStep = (end.lat - start.lat) / steps;
    const lngStep = (end.lng - start.lng) / steps;
    
    for (let i = 1; i <= steps; i++) {
        const currentLat = start.lat + latStep * i;
        const currentLng = start.lng + lngStep * i;
        cy.visit(`/game/${gameId}`, {
            onBeforeLoad(win) {
                cy.stub(win.navigator.geolocation, 'watchPosition', (cb) => {
                    cb({ coords: { latitude: currentLat, longitude: currentLng } });
                });
            },
        });
        cy.wait(duration / steps);
    }
  };

  beforeEach(() => {
    cy.session('player1', () => {
        cy.visit('/login');
        cy.get('input[type="email"]').type(player1.email);
        cy.get('input[type="password"]').type(player1.password);
        cy.get('button[type="submit"]').click();
        cy.contains('Mina Lag').should('be.visible');
    }, {
        cacheAcrossSpecs: true
    });
    cy.visit('/teams');
  });

  it('kan slutföra ett spel där spelarna ser varandra och löser varsitt hinder', function () {
    let gameId;
    let player2Id;

    // STEG 0: Hämta all data
    cy.task('getUserByEmail', player2.email).then(uid => {
      expect(uid, `Användaren ${player2.email} måste finnas`).to.be.a('string');
      player2Id = uid;
    });
    
    cy.visit(`/json/${gameIdToTest}`);
    cy.get('pre', { timeout: 20000 })
      .should('contain', '{')
      .invoke('text')
      .then((jsonText) => {
        const gameData = JSON.parse(jsonText);
        const { teamDetails, courseDetails, gameDetails } = gameData;

        // STEG 1: Starta spelet
        cy.visit('/teams');
        cy.contains('li', teamDetails.name).find('button').click();
        cy.url().should('include', Cypress.config().baseUrl);
        cy.get('body').then(($body) => {
          if ($body.find(`h1:contains('Lobby för ${teamDetails.name}')`).length > 0) {
            if (gameDetails.isTestMode) cy.get('#test-mode').check();
            cy.contains('Starta Spel').click();
          } else {
            cy.url().should('include', '/game/');
          }
        });
        
        cy.url().should('include', '/game/').then(url => {
            gameId = url.split('/game/')[1];
        });
        
        // STEG 2: Båda spelarna rör sig till start
        cy.then(() => {
          cy.log('Spelare 1 rör sig till START...');
          simulateMovement(gameId, {lat: 56.6630, lng: 16.3570}, courseDetails.start);
          
          cy.log('Spelare 2 rör sig till START (via backend)...');
          cy.task('updateGameState', {
              gameId,
              updateData: { [`playerPositions.${player2Id}`]: courseDetails.start }
          });
        });
        
        // **NYTT TESTSTEG: Ladda om sidan och verifiera att båda spelarna syns**
        cy.log('Laddar om sidan för Spelare 1 för att synka...');
        cy.wait(500); // Liten paus för att databasen ska hinna uppdateras
        cy.reload();
        cy.log('Verifierar att Spelare 1 kan se Spelare 2...');
        // Letar efter 2 vanliga spelarmarkörer (inte start/hinder/mål)
        cy.get('img.leaflet-marker-icon[src*="marker-icon.png"]', { timeout: 10000 }).should('have.length', 2);
        cy.wait(1000);

        // STEG 3: Spelare 1 löser första hindret
        cy.then(() => {
          cy.log('Spelare 1 rör sig till hinder 1...');
          simulateMovement(gameId, courseDetails.start, courseDetails.obstacles[0].position);
        });
        cy.contains('Gåta!', { timeout: 10000 }).should('be.visible');
        cy.get('.grid button').eq(courseDetails.obstacles[0].details.correctAnswer).click();
        cy.log('Spelare 1 har löst hinder 1.');
        cy.wait(1000);

        // STEG 4: Spelare 2 löser andra hindret
        cy.then(() => {
          cy.log('Simulerar att Spelare 2 rör sig till och löser hinder 2...');
          cy.task('updateGameState', { 
              gameId, 
              updateData: { 
                  [`playerPositions.${player2Id}`]: courseDetails.obstacles[1].position,
                  solvedObstacles: [true, true],
                  solvedBy: { type: 'arrayUnion', value: { obstacleIndex: 1, userId: player2Id } }
              }
          });
        });

        // STEG 5: Vänta på att mål-markören ska visas
        cy.log('Väntar på att mål-markören ska visas för Spelare 1...');
        cy.reload(); // Ladda om för att vara säker på att se den nya markören
        cy.get('img[src*="marker-icon-2x-red.png"]', { timeout: 10000 }).should('be.visible');
        cy.wait(1000);

        // STEG 6: Båda spelarna går i mål
        cy.then(() => {
          cy.log(`Simulerar att Spelare 2 går i mål...`);
          cy.task('updateGameState', {
              gameId,
              updateData: { 
                  [`playerPositions.${player2Id}`]: courseDetails.finish,
                  playersAtFinish: { type: 'arrayUnion', value: player2Id }
              }
          });

          cy.log('Spelare 1 går till mål...');
          simulateMovement(gameId, courseDetails.obstacles[0].position, courseDetails.finish);
        });

        // STEG 7: Verifiera resultatsidan
        cy.url({ timeout: 10000 }).should('include', '/report/');
        cy.contains('Spelrapport').should('be.visible');
        cy.log(`Testet för '${courseDetails.name}' slutfördes framgångsrikt!`);
    });
  });
});
