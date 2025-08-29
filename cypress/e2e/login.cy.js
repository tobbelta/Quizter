// cypress/e2e/login.cy.js

describe('Inloggning', () => {
  it('kan logga in en befintlig användare', () => {
    // 1. Besök startsidan (som omdirigerar till /login)
    cy.visit('/');

    // 2. Hitta e-postfältet, skriv in e-post och verifiera
    // OBS: Byt ut mot en giltig testanvändare i din databas
    cy.get('input[type="email"]')
      .type('ditt-email@test.com')
      .should('have.value', 'ditt-email@test.com');

    // 3. Hitta lösenordsfältet, skriv in lösenord och verifiera
    cy.get('input[type="password"]')
      .type('ditt-lösenord')
      .should('have.value', 'ditt-lösenord');

    // 4. Klicka på "Logga in"-knappen
    cy.get('button[type="submit"]').click();

    // 5. Verifiera att vi har kommit vidare (t.ex. till "Mina Lag"-sidan)
    //    URL:en ska inte längre vara /login
    cy.url().should('not.include', '/login');
    // Sidan ska innehålla texten "Mina Lag"
    cy.contains('Mina Lag').should('be.visible');
  });
});
