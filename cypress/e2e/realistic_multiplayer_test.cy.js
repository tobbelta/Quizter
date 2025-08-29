// cypress/e2e/realistic_multiplayer_test.cy.js

describe('Realistiskt multiplayer-spelflöde', () => {
  
  const player1 = { email: 'cypress@cypress.se', password: 'cypress' };
  const player2 = { email: 'cypress2@cypress.se', password: 'cypress' };
  const teamName = 'Test Multi';

  // Hjälpfunktion för att simulera Spelare 1:s rörelse (via UI)
  const simulateMovement = (gameId, start, end, steps = 5, duration = 2000) => {
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
    cy.wait(500); 
  };

  // Hjälpfunktion för att simulera Spelare 2:s rörelse (via backend)
  const simulatePlayer2Movement = (gameId, player2Id, start, end, steps = 5, duration = 2000) => {
    const latStep = (end.lat - start.lat) / steps;
    const lngStep = (end.lng - start.lng) / steps;

    for (let i = 1; i <= steps; i++) {
        const currentLat = start.lat + latStep * i;
        const currentLng = start.lng + lngStep * i;
        cy.task('updateGameState', {
            gameId,
            updateData: {
                [`playerPositions.${player2Id}`]: { lat: currentLat, lng: currentLng }
            }
        });
        cy.wait(duration / steps);
    }
  };

  it('kan slutföra ett spel där spelarna ser varandra och samarbetar', function () {
    let gameId;
    let player2Id;

    // STEG 0: Logga in och hämta Spelare 2:s ID
    cy.session('player1', () => {
        cy.visit('/login');
        cy.get('input[type="email"]').type(player1.email);
        cy.get('input[type="password"]').type(player1.password);
        cy.get('button[type="submit"]').click();
        cy.contains('Mina Lag').should('be.visible');
    }, { cacheAcrossSpecs: true });
    
    cy.visit('/teams');
    cy.task('getUserByEmail', player2.email).then(uid => {
      expect(uid, `Användaren ${player2.email} måste finnas`).to.be.a('string');
      player2Id = uid;
    });

    // STEG 1: Starta eller gå med i spelet från "Mina Lag"-sidan
    cy.contains('li', teamName).find('button').click();
    
    cy.url({ timeout: 10000 }).should('include', '/game/').then(url => {
        gameId = url.split('/game/')[1];
        cy.log(`Spel startat/anslutet med ID: ${gameId}`);
        
        // STEG 2: Hämta speldata direkt från databasen via en task
        cy.task('getGameData', gameId).then(gameData => {
            expect(gameData, "Kunde inte hämta speldata från databasen").to.not.be.null;
            cy.log('Hämtad Speldata:', JSON.stringify(gameData, null, 2));

            const { courseDetails, gameDetails } = gameData;
            
            // STEG 3: Båda spelarna rör sig till start
            const initialPos1 = { lat: courseDetails.start.lat + 0.0005, lng: courseDetails.start.lng + 0.0005 };
            const initialPos2 = { lat: courseDetails.start.lat + 0.0005, lng: courseDetails.start.lng - 0.0005 };

            cy.log('Spelare 1 rör sig till START...');
            simulateMovement(gameId, initialPos1, courseDetails.start);
            
            cy.log('Spelare 2 rör sig till START (via backend)...');
            simulatePlayer2Movement(gameId, player2Id, initialPos2, courseDetails.start);
            
            // STEG 4: Verifiera att båda spelarna syns på kartan
            cy.log('Laddar om sidan för Spelare 1 för att synka...');
            cy.reload();
            cy.log('Verifierar att Spelare 1 kan se Spelare 2...');
            cy.get('img.leaflet-marker-icon[src*="marker-icon.png"]', { timeout: 10000 }).should('have.length', 2);
            cy.wait(2000);

            // STEG 5: Spelare 1 löser första hindret (om det är olöst)
            if (!gameDetails.solvedObstacles[0]) {
                cy.log('Spelare 1 rör sig till hinder 1...');
                simulateMovement(gameId, courseDetails.start, courseDetails.obstacles[0].position);
                cy.contains('Gåta!', { timeout: 10000 }).should('be.visible');
                cy.get('.grid button').eq(courseDetails.obstacles[0].details.correctAnswer).click();
                cy.log('Spelare 1 har löst hinder 1.');
                cy.wait(1000);
            } else {
                cy.log('Hinder 1 är redan löst, hoppar över.');
            }

            // STEG 6: Spelare 2 löser andra hindret (om det är olöst)
            if (!gameDetails.solvedObstacles[1]) {
                cy.log('Simulerar att Spelare 2 rör sig till och löser hinder 2...');
                simulatePlayer2Movement(gameId, player2Id, courseDetails.start, courseDetails.obstacles[1].position);
                cy.task('updateGameState', { 
                    gameId, 
                    updateData: { 
                        solvedObstacles: [true, true],
                        solvedBy: { type: 'arrayUnion', value: { obstacleIndex: 1, userId: player2Id } }
                    }
                });
            } else {
                cy.log('Hinder 2 är redan löst, hoppar över.');
            }

            // STEG 7: Vänta på att mål-markören ska visas
            cy.log('Väntar på att mål-markören ska visas för Spelare 1...');
            cy.reload();
            cy.get('img[src*="marker-icon-2x-red.png"]', { timeout: 10000 }).should('be.visible');
            cy.wait(1000);

            // STEG 8: Båda spelarna går i mål
            cy.log(`Simulerar att Spelare 2 går i mål...`);
            simulatePlayer2Movement(gameId, player2Id, courseDetails.obstacles[1].position, courseDetails.finish);
            cy.task('updateGameState', {
                gameId,
                updateData: { 
                    playersAtFinish: { type: 'arrayUnion', value: player2Id }
                }
            });

            cy.log('Spelare 1 går till mål...');
            simulateMovement(gameId, courseDetails.obstacles[0].position, courseDetails.finish);

            // STEG 9: Verifiera resultatsidan
            cy.url({ timeout: 10000 }).should('include', '/report/');
            cy.contains('Spelrapport').should('be.visible');
            cy.log(`Testet för '${courseDetails.name}' slutfördes framgångsrikt!`);
        });
    });
  });
});
