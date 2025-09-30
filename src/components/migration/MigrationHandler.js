/**
 * MigrationHandler - Hanterar migrering av lokal data efter login
 */
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { migrationService } from '../../services/migrationService';
import MigrationPrompt from './MigrationPrompt';

const MigrationHandler = () => {
  const { currentUser, isAuthenticated } = useAuth();
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Kontrollera om vi ska visa migreringsdialogren
    if (isAuthenticated && currentUser && !currentUser.isAnonymous) {
      const shouldPrompt = migrationService.shouldPromptMigration();
      if (shouldPrompt) {
        // Vänta lite så att användaren hinner se att de är inloggade
        setTimeout(() => {
          setShowPrompt(true);
        }, 500);
      }
    }
  }, [isAuthenticated, currentUser]);

  if (!showPrompt) return null;

  return <MigrationPrompt onClose={() => setShowPrompt(false)} />;
};

export default MigrationHandler;