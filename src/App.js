/**
 * Router-konfiguration för tipspromenaden samt auth-/run-provider.
 */
import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RunProvider } from './context/RunContext';
import { BackgroundTaskProvider } from './context/BackgroundTaskContext';
import { ToastProvider } from './context/ToastContext';
import { localStorageService } from './services/localStorageService';
import { analyticsService } from './services/analyticsService';
import { VERSION } from './version';

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
import SuperUserNotificationsPage from './views/SuperUserNotificationsPage';
import SuperUserErrorLogsPage from './views/SuperUserErrorLogsPage';
import SuperUserTasksPage from './views/SuperUserTasksPage';
import AIProviderSettingsPage from './views/AIProviderSettingsPage';
import MigrationHandler from './components/migration/MigrationHandler';
import LocalRunsImportDialog from './components/migration/LocalRunsImportDialog';
import InstallPrompt from './components/shared/InstallPrompt';
import ToastViewport from './components/shared/ToastViewport';
import ServiceStatusIcon from './components/shared/ServiceStatusIcon';
import { useBreadcrumbs } from './hooks/useBreadcrumbs';

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
    <Route
      path="/superuser/tasks"
      element={(
        <RequireSuperUser>
          <SuperUserTasksPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/superuser/notifications"
      element={(
        <RequireSuperUser>
          <SuperUserNotificationsPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/superuser/logs"
      element={(
        <RequireSuperUser>
          <SuperUserErrorLogsPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/superuser/ai-providers"
      element={(
        <RequireSuperUser>
          <AIProviderSettingsPage />
        </RequireSuperUser>
      )}
    />

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

/**
 * Kontrollerar version från URL query parameter
 * Blockerar hela appen om versionen inte matchar
 */
const VersionChecker = ({ children }) => {
  const [searchParams] = useSearchParams();
  const versionParam = searchParams.get('ver') || searchParams.get('version');
  const hasVersionMismatch = versionParam && versionParam !== VERSION;

  useEffect(() => {
    if (hasVersionMismatch) {
      console.error(`❌ Version mismatch! URL expects: ${versionParam}, Running: ${VERSION}`);
    }
  }, [hasVersionMismatch, versionParam]);

  // Om version mismatch, visa bara felmeddelande och ladda inte appen
  if (hasVersionMismatch) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-slate-900 border-2 border-red-500 rounded-2xl p-8 shadow-2xl">
          <div className="text-center space-y-6">
            <div className="text-6xl">⚠️</div>
            <h1 className="text-3xl font-bold text-red-400">Felaktig version!</h1>
            <div className="bg-slate-800 rounded-lg p-6 space-y-3">
              <p className="text-gray-300">
                URL:en förväntar sig version <span className="font-mono font-bold text-cyan-400">{versionParam}</span>
              </p>
              <p className="text-gray-300">
                Men du kör version <span className="font-mono font-bold text-amber-400">{VERSION}</span>
              </p>
            </div>
            <div className="space-y-3">
              <p className="text-gray-400 text-sm">
                Detta beror troligen på att din webbläsare har cachat en gammal version av sidan.
              </p>
              <button
                onClick={() => {
                  // Ta bort version-parametern från URL:en
                  const newUrl = new URL(window.location.href);
                  newUrl.searchParams.delete('ver');
                  newUrl.searchParams.delete('version');
                  window.location.href = newUrl.toString();
                }}
                className="w-full px-6 py-3 bg-cyan-500 text-black rounded-lg font-bold text-lg hover:bg-cyan-400 transition-colors"
              >
                Ladda utan versionskontroll
              </button>
              <button
                onClick={() => {
                  // Hård omladdning (Ctrl+Shift+R)
                  window.location.reload(true);
                }}
                className="w-full px-6 py-3 bg-slate-700 text-white rounded-lg font-semibold hover:bg-slate-600 transition-colors"
              >
                Tvinga omladdning (Ctrl+Shift+R)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Version OK eller ingen version angiven - rendera barnen
  return <>{children}</>;
};

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
  const { currentUser, isAuthInitialized, isSuperUser } = useAuth();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [localRunCount, setLocalRunCount] = useState(0);

  useEffect(() => {
    // Kontrollera om användaren precis loggat in och har lokala rundor
    if (isAuthInitialized && currentUser && !currentUser.isAnonymous) {
      // SuperUsers behöver aldrig importera
      if (isSuperUser) {
        return;
      }

      // Kolla om användaren redan har sett/hanterat importdialogen
      const importHandledKey = `geoquest:import:handled:${currentUser.id}`;
      const alreadyHandled = localStorage.getItem(importHandledKey) === 'true';

      if (alreadyHandled) {
        return;
      }

      const localRuns = localStorageService.getCreatedRuns();
      const count = localRuns?.length || 0;

      if (count > 0) {
        setLocalRunCount(count);
        setShowImportDialog(true);
      } else {
        // Även om användaren inte har några rundor, markera att vi har frågat
        // så att dialogen inte dyker upp varje gång vid F5
        localStorage.setItem(importHandledKey, 'true');
      }
    }
  }, [currentUser, isAuthInitialized, isSuperUser]);

  // Återställ när användaren loggar ut
  useEffect(() => {
    if (isAuthInitialized && !currentUser) {
      setShowImportDialog(false);
    }
  }, [currentUser, isAuthInitialized]);

  const handleImportComplete = (success) => {
    // Markera att användaren har hanterat importen (även om de hoppade över)
    if (currentUser && !currentUser.isAnonymous) {
      const importHandledKey = `geoquest:import:handled:${currentUser.id}`;
      localStorage.setItem(importHandledKey, 'true');
    }

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

/**
 * Breadcrumb tracker - loggar navigering automatiskt
 */
const BreadcrumbTracker = () => {
  useBreadcrumbs(); // Loggar automatiskt all navigering
  return null;
};

const SuperUserFeatures = () => {
  const { isSuperUser } = useAuth();

  if (!isSuperUser) {
    return null;
  }

  return (
    <>
      <ServiceStatusIcon />
    </>
  );
};

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BackgroundTaskProvider>
          <RunProvider>
            <VersionChecker>
              <div className="min-h-screen bg-slate-950 text-gray-100">
                <BreadcrumbTracker />
                <AnalyticsTracker />
                <MigrationHandler />
                <LocalRunsImportHandler />
                <InstallPrompt />
                <AppRoutes />
                <ToastViewport />
                <SuperUserFeatures />
              </div>
            </VersionChecker>
          </RunProvider>
        </BackgroundTaskProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
