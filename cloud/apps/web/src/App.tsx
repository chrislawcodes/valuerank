import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/context';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Definitions } from './pages/Definitions';
import { Runs } from './pages/Runs';
import { Experiments } from './pages/Experiments';
import { Settings } from './pages/Settings';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/definitions"
            element={
              <ProtectedRoute>
                <Definitions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/runs"
            element={
              <ProtectedRoute>
                <Runs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/experiments"
            element={
              <ProtectedRoute>
                <Experiments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
