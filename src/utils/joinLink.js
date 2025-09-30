/**
 * Bygger länkar som deltagare kan använda för att ansluta till en runda.
 */
/**
 * Returnerar en absolut URL om vi kör i browsern, annars en relativ sökväg.
 */
export const buildJoinLink = (joinCode) => {
  if (!joinCode) return '';
  if (typeof window === 'undefined' || !window.location?.origin) {
    return `/join?code=${joinCode}`;
  }
  return `${window.location.origin}/join?code=${joinCode}`;
};