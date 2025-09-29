/**
 * Router-konfiguration för tipspromenaden samt auth-/run-provider.
 */
import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RunProvider } from './context/RunContext';

import LandingPage from './views/LandingPage';
import CreateRunPage from './views/CreateRunPage';
import GenerateRunPage from './views/GenerateRunPage';
import JoinRunPage from './views/JoinRunPage';
import PlayRunPage from './views/PlayRunPage';
import RunAdminPage from './views/RunAdminPage';
import RunResultsPage from './views/RunResultsPage';
import RegisterPlayerPage from './views/RegisterPlayerPage';
import RegisterAdminPage from './views/RegisterAdminPage';
import MyRunsPage from './views/MyRunsPage';
import AdminQuestionsPage from './views/AdminQuestionsPage';

/**
 * Skyddar admin-rutter så att gäster hamnar på startsidan.
 */
const RequireAdmin = ({ children }) => {
  const { isAdmin, isAuthInitialized, currentUser } = useAuth();
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[Auth] RequireAdmin kontroll', {
      isAuthInitialized,
      isAdmin,
      userId: currentUser?.id || null,
      roles: currentUser?.roles || null
    });
  }
  if (!isAuthInitialized) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[Auth] RequireAdmin väntar på auth-initialisering');
    }
    return (
      <div className="p-8 text-center text-gray-300">
        Kontrollerar behörighet ...
      </div>
    );
  }
  if (!isAdmin) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[Auth] RequireAdmin saknar admin-roll, omdirigerar');
    }
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
    <Route path="/register/player" element={<RegisterPlayerPage />} />
    <Route path="/register/admin" element={<RegisterAdminPage />} />
    <Route
      path="/admin/create"
      element={(
        <RequireAdmin>
          <CreateRunPage />
        </RequireAdmin>
      )}
    />
    <Route
      path="/admin/my-runs"
      element={(
        <RequireAdmin>
          <MyRunsPage />
        </RequireAdmin>
      )}
    />
    <Route
      path="/admin/questions"
      element={(
        <RequireAdmin>
          <AdminQuestionsPage />
        </RequireAdmin>
      )}
    />
    <Route path="/generate" element={<GenerateRunPage />} />
    <Route path="/join" element={<JoinRunPage />} />
    <Route path="/run/:runId/play" element={<PlayRunPage />} />
    <Route
      path="/run/:runId/admin"
      element={(
        <RequireAdmin>
          <RunAdminPage />
        </RequireAdmin>
      )}
    />
    <Route path="/run/:runId/results" element={<RunResultsPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

function App() {
  return (
    <AuthProvider>
      <RunProvider>
        <div className="min-h-screen bg-slate-950 text-gray-100">
          <AppRoutes />
        </div>
      </RunProvider>
    </AuthProvider>
  );
}

export default App;
