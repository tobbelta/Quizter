/**
 * Router-konfiguration för tipspromenaden samt auth-/run-provider.
 */
import React, { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RunProvider } from './context/RunContext';
import { BackgroundTaskProvider } from './context/BackgroundTaskContext';
import { ToastProvider } from './context/ToastContext';
import { analyticsService } from './services/analyticsService';
import { VERSION } from './version';

import LandingPage from './views/LandingPage';
import LoginPage from './views/LoginPage';
import RegisterPage from './views/RegisterPage';
import VerifyEmailPage from './views/VerifyEmailPage';
import AccountSettingsPage from './views/AccountSettingsPage';
import GenerateRunPage from './views/GenerateRunPage';
import JoinRunPage from './views/JoinRunPage';
import PlayRunPage from './views/PlayRunPage';
import RunAdminPage from './views/RunAdminPage';
import RunResultsPage from './views/RunResultsPage';
import MyRunsPage from './views/MyRunsPage';
import AdminQuestionsPage from './views/AdminQuestionsPage';
import AdminDashboardPage from './views/AdminDashboardPage';
import AdminCategoriesPage from './views/AdminCategoriesPage';
import AdminAudienceSettingsPage from './views/AdminAudienceSettingsPage';
import AdminPaymentsPage from './views/AdminPaymentsPage';
import AdminEmailSettingsPage from './views/AdminEmailSettingsPage';
import AdminEmailLogsPage from './views/AdminEmailLogsPage';
import AdminAuditLogsPage from './views/AdminAuditLogsPage';
import SuperUserAllRunsPage from './views/SuperUserAllRunsPage';
import SuperUserUsersPage from './views/SuperUserUsersPage';
import SuperUserAnalyticsPage from './views/SuperUserAnalyticsPage';
import SuperUserMessagesPage from './views/SuperUserMessagesPage';
import SuperUserNotificationsPage from './views/SuperUserNotificationsPage';
import SuperUserErrorLogsPage from './views/SuperUserErrorLogsPage';
import SuperUserTasksPage from './views/SuperUserTasksPage';
import AIProviderSettingsPage from './views/AIProviderSettingsPage';
import AdminAIRulesPage from './views/AdminAIRulesPage';
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
    <Route path="/verify-email" element={<VerifyEmailPage />} />
    <Route path="/account" element={<AccountSettingsPage />} />
    <Route path="/my-runs" element={<MyRunsPage />} />

    {/* Alla användare kan skapa och ansluta */}
    <Route path="/generate" element={<GenerateRunPage />} />
    <Route path="/join" element={<JoinRunPage />} />
    <Route path="/run/:runId/play" element={<PlayRunPage />} />
    <Route path="/run/:runId/results" element={<RunResultsPage />} />
    <Route path="/run/:runId/admin" element={<RunAdminPage />} />

    {/* SuperUser-routes */}
    <Route
      path="/admin/all-runs"
      element={(
        <RequireSuperUser>
          <SuperUserAllRunsPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/admin/users"
      element={(
        <RequireSuperUser>
          <SuperUserUsersPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/admin/dashboard"
      element={(
        <RequireSuperUser>
          <AdminDashboardPage />
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
      path="/admin/categories"
      element={(
        <RequireSuperUser>
          <AdminCategoriesPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/admin/audiences"
      element={(
        <RequireSuperUser>
          <AdminAudienceSettingsPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/admin/analytics"
      element={(
        <RequireSuperUser>
          <SuperUserAnalyticsPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/admin/messages"
      element={(
        <RequireSuperUser>
          <SuperUserMessagesPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/admin/tasks"
      element={(
        <RequireSuperUser>
          <SuperUserTasksPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/admin/notifications"
      element={(
        <RequireSuperUser>
          <SuperUserNotificationsPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/admin/logs"
      element={(
        <RequireSuperUser>
          <SuperUserErrorLogsPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/admin/ai-providers"
      element={(
        <RequireSuperUser>
          <AIProviderSettingsPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/admin/ai-rules"
      element={(
        <RequireSuperUser>
          <AdminAIRulesPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/admin/payments"
      element={(
        <RequireSuperUser>
          <AdminPaymentsPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/admin/email"
      element={(
        <RequireSuperUser>
          <AdminEmailSettingsPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/admin/email-logs"
      element={(
        <RequireSuperUser>
          <AdminEmailLogsPage />
        </RequireSuperUser>
      )}
    />
    <Route
      path="/admin/audit-logs"
      element={(
        <RequireSuperUser>
          <AdminAuditLogsPage />
        </RequireSuperUser>
      )}
    />

    <Route path="/superuser/all-runs" element={<Navigate to="/admin/all-runs" replace />} />
    <Route path="/superuser/users" element={<Navigate to="/admin/users" replace />} />
    <Route path="/superuser/analytics" element={<Navigate to="/admin/analytics" replace />} />
    <Route path="/superuser/messages" element={<Navigate to="/admin/messages" replace />} />
    <Route path="/superuser/tasks" element={<Navigate to="/admin/tasks" replace />} />
    <Route path="/superuser/notifications" element={<Navigate to="/admin/notifications" replace />} />
    <Route path="/superuser/logs" element={<Navigate to="/admin/logs" replace />} />
    <Route path="/superuser/ai-providers" element={<Navigate to="/admin/ai-providers" replace />} />
    <Route path="/superuser/ai-rules" element={<Navigate to="/admin/ai-rules" replace />} />
    <Route path="/superuser/categories" element={<Navigate to="/admin/categories" replace />} />
    <Route path="/superuser/audiences" element={<Navigate to="/admin/audiences" replace />} />
    <Route path="/superuser/payments" element={<Navigate to="/admin/payments" replace />} />
    <Route path="/superuser/email" element={<Navigate to="/admin/email" replace />} />
    <Route path="/superuser/email-logs" element={<Navigate to="/admin/email-logs" replace />} />
    <Route path="/superuser/audit-logs" element={<Navigate to="/admin/audit-logs" replace />} />

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
  // Konfigurera status bar för native appar
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/status-bar').then(({ StatusBar }) => {
        StatusBar.setBackgroundColor({ color: '#0d1117' }).catch(() => {});
        StatusBar.setStyle({ style: 'DARK' }).catch(() => {});
        StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
      }).catch(() => console.log('StatusBar plugin not available'));
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const PERMISSION_FLAG = 'routequest:permissionPrompted';

    const promptPermissions = async () => {
      try {
        if (window.localStorage?.getItem(PERMISSION_FLAG) === 'true') {
          return;
        }

        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            () => {},
            () => {},
            { enableHighAccuracy: true, timeout: 10000 }
          );
        }

        if (Capacitor.isNativePlatform()) {
          try {
            const notifModule = await import('@capacitor/local-notifications');
            const LocalNotifications = notifModule.LocalNotifications || notifModule.default?.LocalNotifications || notifModule;
            if (LocalNotifications?.checkPermissions && LocalNotifications?.requestPermissions) {
              const permission = await LocalNotifications.checkPermissions();
              if (permission.display !== 'granted') {
                const result = await LocalNotifications.requestPermissions();
                if (result.display !== 'granted') {
                  console.warn('[Permissions] Notifications still not granted after request');
                }
              }
            } else {
              console.warn('[Permissions] LocalNotifications plugin saknas eller är inkompatibel');
            }
          } catch (error) {
            console.warn('[Permissions] Kunde inte hantera native-notiser', error);
          }
        } else if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {});
        }

        window.localStorage?.setItem(PERMISSION_FLAG, 'true');
      } catch (error) {
        console.warn('[Permissions] Kunde inte begära behörigheter', error);
      }
    };

    promptPermissions();
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>
        <BackgroundTaskProvider>
          <RunProvider>
            <VersionChecker>
              <div className="min-h-screen bg-slate-950 text-gray-100">
                <BreadcrumbTracker />
                <AnalyticsTracker />
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
