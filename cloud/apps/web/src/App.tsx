import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'urql';
import { AuthProvider } from './auth/context';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Definitions } from './pages/Definitions';
import { DefinitionDetail } from './pages/DefinitionDetail';
import { Runs } from './pages/Runs';
import { RunDetail } from './pages/RunDetail';
import { Analysis } from './pages/Analysis';
import { AnalysisDetail } from './pages/AnalysisDetail';
import { Compare } from './pages/Compare';
import { Experiments } from './pages/Experiments';
import { Settings } from './pages/Settings';
import { client } from './api/client';

// Protected layout wrapper
function ProtectedLayout({ children, fullWidth = false }: { children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <ProtectedRoute>
      <Layout fullWidth={fullWidth}>{children}</Layout>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Provider value={client}>
        <AuthProvider>
          <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />

          {/* Protected routes with layout */}
          <Route
            path="/"
            element={
              <ProtectedLayout>
                <Dashboard />
              </ProtectedLayout>
            }
          />
          <Route
            path="/definitions"
            element={
              <ProtectedLayout>
                <Definitions />
              </ProtectedLayout>
            }
          />
          <Route
            path="/definitions/:id"
            element={
              <ProtectedLayout>
                <DefinitionDetail />
              </ProtectedLayout>
            }
          />
          <Route
            path="/runs"
            element={
              <ProtectedLayout>
                <Runs />
              </ProtectedLayout>
            }
          />
          <Route
            path="/runs/:id"
            element={
              <ProtectedLayout>
                <RunDetail />
              </ProtectedLayout>
            }
          />
          <Route
            path="/analysis"
            element={
              <ProtectedLayout>
                <Analysis />
              </ProtectedLayout>
            }
          />
          <Route
            path="/analysis/:id"
            element={
              <ProtectedLayout>
                <AnalysisDetail />
              </ProtectedLayout>
            }
          />
          <Route
            path="/compare"
            element={
              <ProtectedLayout fullWidth>
                <Compare />
              </ProtectedLayout>
            }
          />
          <Route
            path="/experiments"
            element={
              <ProtectedLayout>
                <Experiments />
              </ProtectedLayout>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedLayout>
                <Settings />
              </ProtectedLayout>
            }
          />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </Provider>
    </BrowserRouter>
  );
}

export default App;
