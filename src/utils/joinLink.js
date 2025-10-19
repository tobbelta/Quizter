/**
 * Bygger länkar som deltagare kan använda för att ansluta till en runda.
 */

// Använd alltid produktionsdomänen för delningslänkar
const PRODUCTION_URL = 'https://routequest.se';

/**
 * Returnerar en absolut URL med produktionsdomänen.
 * Detta säkerställer att länkar fungerar även från native-appen.
 */
export const buildJoinLink = (joinCode) => {
  if (!joinCode) return '';
  return `${PRODUCTION_URL}/join?code=${joinCode}`;
};