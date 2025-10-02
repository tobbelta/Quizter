/**
 * Router-konfiguration för tipspromenaden samt auth-/run-provider.
 */
import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RunProvider } from './context/RunContext';
import { localStorageService } from './services/localStorageService';
import { analyticsService } from './services/analyticsService';

import LandingPage from './views/LandingPage';
import LoginPage from './views/LoginPage';
import RegisterPage from './views/RegisterPage';
import GenerateRunPage from './views/GenerateRunPage';
import JoinRunPage from './views/JoinRunPage';
import PlayRunPage from './views/PlayRunPage';
import RunAdminPage from './views/RunAdminPage';
import RunResultsPage from './views/RunResultsPage';
import MyRunsPage from './views/MyRunsPage';
import AdminQuestionsPage from './views/AdminQuestionsPage';
import SuperUserAllRunsPage from './views/SuperUserAllRunsPage';
import SuperUserUsersPage from './views/SuperUserUsersPage';
import SuperUserAnalyticsPage from './views/SuperUserAnalyticsPage';
import SuperUserMessagesPage from './views/SuperUserMessagesPage';
import MigrationHandler from './components/migration/MigrationHandler';
import LocalRunsImportDialog from './components/migration/LocalRunsImportDialog';
import InstallPrompt from './components/shared/InstallPrompt';

/**
 * Skyddar SuperUser-rutter
 */
const RequireSuperUser = ({ children }) => {
  const { isSuperUser, isAuthInitialized } = useAuth();

  if (!isAuthInitialized) {
    return (
      <div className="p-8 text-center text-gray-300">
        Kontrollerar behörighet ...
      </div>
    );
  }

  if (!isSuperUser) {
    return <Navigate to="/" replace />;
  }

  return children;
};

/**
 * Samlar alla routes så att <App /> blir enkel.
 */
const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/my-runs" element={<MyRunsPage />} />

    {/* Alla användare kan skapa och ansluta */}
    <Route path="/generate" element={<GenerateRunPage />} />
    <Route path="/join" element={<JoinRunPage />} />
    <Route path="/run/:runId/play" element={<PlayRunPage />} />
    <Route path="/run/:runId/results" element={<RunResultsPage />} />
    <Route path="/run/:runId/admin" element={<RunAdminPage />} />

    {/* SuperUser-routes */}
    <Route
      path="/superuser/all-runs"
      element={(
        <RequireSuperUser>
          <SuperUserAllRunsPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/superuser/users"
      element={(
        <RequireSuperUser>
          <SuperUserUsersPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/admin/questions"
      element={(
        <RequireSuperUser>
          <AdminQuestionsPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/superuser/analytics"
      element={(
        <RequireSuperUser>
          <SuperUserAnalyticsPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/superuser/messages"
      element={(
        <RequireSuperUser>
          <SuperUserMessagesPage />
        </RequireSuperUser>
      )}
    />

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

/**
 * Spårar sidvisningar och länkar device till användare
 */
const AnalyticsTracker = () => {
  const location = useLocation();
  const { currentUser, isAuthInitialized } = useAuth();

  // Logga sidvisningar
  useEffect(() => {
    analyticsService.logVisit('page_view', {
      path: location.pathname
    });
  }, [location.pathname]);

  // Länka device till användare när de loggar in
  useEffect(() => {
    if (isAuthInitialized && currentUser && !currentUser.isAnonymous) {
      analyticsService.linkDeviceToUser(currentUser.id);
    }
  }, [currentUser, isAuthInitialized]);

  return null;
};

/**
 * Komponent som hanterar import av localStorage-rundor vid inloggning
 */
const LocalRunsImportHandler = () => {
  const { currentUser, isAuthInitialized } = useAuth();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [localRunCount, setLocalRunCount] = useState(0);
  const [hasCheckedImport, setHasCheckedImport] = useState(false);

  useEffect(() => {
    // Kontrollera om användaren precis loggat in och har lokala rundor
    if (isAuthInitialized && currentUser && !currentUser.isAnonymous && !hasCheckedImport) {
      const localRuns = localStorageService.getCreatedRuns();
      const count = localRuns?.length || 0;

      console.log('[LocalRunsImportHandler] Användare inloggad, kontrollerar lokala rundor:', count);

      if (count > 0) {
        setLocalRunCount(count);
        setShowImportDialog(true);
      }

      setHasCheckedImport(true);
    }
  }, [currentUser, isAuthInitialized, hasCheckedImport]);

  // Återställ när användaren loggar ut
  useEffect(() => {
    if (isAuthInitialized && !currentUser) {
      setHasCheckedImport(false);
      setShowImportDialog(false);
    }
  }, [currentUser, isAuthInitialized]);

  const handleImportComplete = (success) => {
    console.log('[LocalRunsImportHandler] Import slutförd:', success);
    setShowImportDialog(false);
  };

  if (!showImportDialog) {
    return null;
  }

  return (
    <LocalRunsImportDialog
      localRunCount={localRunCount}
      currentUser={currentUser}
      onComplete={handleImportComplete}
    />
  );
};

function App() {
  return (
    <AuthProvider>
      <RunProvider>
        <div className="min-h-screen bg-slate-950 text-gray-100">
          <AnalyticsTracker />
          <MigrationHandler />
          <LocalRunsImportHandler />
          <InstallPrompt />
          <AppRoutes />
        </div>
      </RunProvider>
    </AuthProvider>
  );
}

export default App;