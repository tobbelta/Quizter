// Stub: MigrationService is now disabled. All logic moved to Cloudflare API endpoints.
// Stub: MigrationService is now disabled. All logic moved to Cloudflare API endpoints.
export const migrateLocalDataToFirebase = async () => {
  return { success: false, error: 'MigrationService disabled' };
};

/**
 * Kontrollerar om användaren har lokal data som kan migreras
 */
export const shouldPromptMigration = () => {
  // Stub: Replace with API/local logic if needed
  return false;
};

export const migrationService = {
  migrateLocalDataToFirebase,
  shouldPromptMigration
};