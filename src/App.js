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

const RequireAdmin = ({ children }) => {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route
      path="/admin/create"
      element={(
        <RequireAdmin>
          <CreateRunPage />
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
