// NOTE: The term "Vignette" is used throughout the UI for user-friendliness.
// However, the underlying codebase, API, and database still use the term "Definition".
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'urql';
import { AuthProvider } from './auth/context';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { ArchiveHome } from './pages/ArchiveHome';
import { Definitions } from './pages/Definitions';
import { Domains } from './pages/Domains';
import { DomainsManage } from './pages/DomainsManage';
import { DomainStartBatches } from './pages/DomainStartBatches';
import { DomainStatus } from './pages/DomainStatus';
import { DomainAnalysis } from './pages/DomainAnalysis';
import { DomainCoverage } from './pages/DomainCoverage';
import { DomainAnalysisValueDetail } from './pages/DomainAnalysisValueDetail';
import { DomainValueShiftHeatmap } from './pages/DomainValueShiftHeatmap';
import { ModelsConsistency } from './pages/ModelsConsistency';
import { PressureSensitivity } from './pages/PressureSensitivity';
import { ModelsCircumplex } from './pages/ModelsCircumplex';
import { ModelsConfidence } from './pages/ModelsConfidence';
import { ModelsConfidenceValueDetail } from './pages/ModelsConfidenceValueDetail';
import { DefinitionDetail } from './pages/DefinitionDetail';
import { StartPairedBatchPage } from './pages/DefinitionDetail/StartPairedBatchPage';
import { Runs } from './pages/Runs';
import { RunDetail } from './pages/RunDetail';
import { Analysis } from './pages/Analysis';
import { AnalysisDetail } from './pages/AnalysisDetail';
import { AnalysisConditionDetail } from './pages/AnalysisConditionDetail';
import { AnalysisTranscripts } from './pages/AnalysisTranscripts';
import { Survey } from './pages/Survey';
import { SurveyResults } from './pages/SurveyResults';
import { SettingsAccount } from './pages/SettingsAccount';
import { SettingsSystemHealth } from './pages/SettingsSystemHealth';
import { SettingsModels } from './pages/SettingsModels';
import { SettingsInfrastructure } from './pages/SettingsInfrastructure';
import { SettingsApiKeys } from './pages/SettingsApiKeys';
import { SettingsUsers } from './pages/SettingsUsers';
import { Preambles } from './pages/Preambles';
import { LevelPresets } from './pages/LevelPresets';
import { DomainContexts } from './pages/DomainContexts';
import { ValueStatements } from './pages/ValueStatements';
import { PairedVignetteNew } from './pages/PairedVignetteNew';
import { StartRedirect } from './pages/StartRedirect';
import { Status } from './pages/Status';
import { StatusRedirect } from './pages/StatusRedirect';
import { NotFound } from './pages/NotFound';
import { client } from './api/client';
import { useHorizontalScrollOnWheel } from './hooks/useHorizontalScrollOnWheel';

// Protected layout wrapper
function ProtectedLayout({
  children,
  fullWidth = false,
  requiredRole,
}: {
  children: ReactNode;
  fullWidth?: boolean;
  requiredRole?: 'ADMIN';
}) {
  return (
    <ProtectedRoute requiredRole={requiredRole}>
      <Layout fullWidth={fullWidth}>{children}</Layout>
    </ProtectedRoute>
  );
}


function App() {
  useHorizontalScrollOnWheel();

  return (
    <BrowserRouter>
      <Provider value={client}>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />

            {/* Protected routes with layout */}
            <Route path="/" element={<Navigate to="/domains/analysis" replace />} />
            <Route
              path="/status"
              element={
                <ProtectedLayout>
                  <Status />
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
              path="/domains"
              element={
                <ProtectedLayout>
                  <Domains />
                </ProtectedLayout>
              }
            />
            <Route
              path="/domains/manage"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <DomainsManage />
                </ProtectedLayout>
              }
            />
            <Route
              path="/archive"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <ArchiveHome />
                </ProtectedLayout>
              }
            />
            <Route
              path="/domains/start/:domainId"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <DomainStartBatches />
                </ProtectedLayout>
              }
            />
            <Route
              path="/domains/start"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <StartRedirect />
                </ProtectedLayout>
              }
            />
            <Route
              path="/domains/status/:domainId"
              element={
                <ProtectedLayout>
                  <DomainStatus />
                </ProtectedLayout>
              }
            />
            <Route
              path="/domains/status"
              element={
                <ProtectedLayout>
                  <StatusRedirect />
                </ProtectedLayout>
              }
            />
            <Route
              path="/domains/analysis"
              element={
                <ProtectedLayout>
                  <DomainAnalysis />
                </ProtectedLayout>
              }
            />
            <Route
              path="/domains/coverage"
              element={
                <ProtectedLayout fullWidth>
                  <DomainCoverage />
                </ProtectedLayout>
              }
            />
            <Route path="/models" element={<Navigate to="/domains/analysis" replace />} />
            <Route
              path="/models/domain-shifts"
              element={
                <ProtectedLayout>
                  <DomainValueShiftHeatmap />
                </ProtectedLayout>
              }
            />
            <Route path="/models/consistency" element={<Navigate to="/archive/consistency" replace />} />
            <Route
              path="/archive/consistency"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <ModelsConsistency />
                </ProtectedLayout>
              }
            />
            <Route
              path="/models/pressure-sensitivity"
              element={
                <ProtectedLayout>
                  <PressureSensitivity />
                </ProtectedLayout>
              }
            />
            <Route path="/models/circumplex" element={<Navigate to="/archive/circumplex" replace />} />
            <Route
              path="/archive/circumplex"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <ModelsCircumplex />
                </ProtectedLayout>
              }
            />
            <Route
              path="/models/confidence"
              element={
                <ProtectedLayout>
                  <ModelsConfidence />
                </ProtectedLayout>
              }
            />
            <Route
              path="/models/confidence/detail"
              element={
                <ProtectedLayout fullWidth>
                  <ModelsConfidenceValueDetail />
                </ProtectedLayout>
              }
            />
            <Route
              path="/domains/analysis/value-detail"
              element={
                <ProtectedLayout fullWidth>
                  <DomainAnalysisValueDetail />
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
              path="/definitions/:id/start-paired-batch"
              element={
                <ProtectedLayout>
                  <StartPairedBatchPage />
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
              path="/analysis/:id/transcripts"
              element={
                <ProtectedLayout fullWidth>
                  <AnalysisTranscripts />
                </ProtectedLayout>
              }
            />
            <Route
              path="/analysis/:id/conditions/:conditionKey"
              element={
                <ProtectedLayout fullWidth>
                  <AnalysisConditionDetail />
                </ProtectedLayout>
              }
            />
            <Route
              path="/archive/surveys"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <Survey />
                </ProtectedLayout>
              }
            />
            <Route
              path="/archive/survey-results"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <SurveyResults />
                </ProtectedLayout>
              }
            />
            <Route path="/settings" element={<Navigate to="/settings/account" replace />} />
            <Route
              path="/settings/account"
              element={
                <ProtectedLayout>
                  <SettingsAccount />
                </ProtectedLayout>
              }
            />
            <Route
              path="/settings/system-health"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <SettingsSystemHealth />
                </ProtectedLayout>
              }
            />
            <Route
              path="/settings/models"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <SettingsModels />
                </ProtectedLayout>
              }
            />
            <Route
              path="/settings/infrastructure"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <SettingsInfrastructure />
                </ProtectedLayout>
              }
            />
            <Route
              path="/settings/api-keys"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <SettingsApiKeys />
                </ProtectedLayout>
              }
            />
            <Route
              path="/settings/users"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <SettingsUsers />
                </ProtectedLayout>
              }
            />
            <Route
              path="/preambles"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <Preambles />
                </ProtectedLayout>
              }
            />
            <Route
              path="/level-presets"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <LevelPresets />
                </ProtectedLayout>
              }
            />
            <Route
              path="/domain-contexts"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <DomainContexts />
                </ProtectedLayout>
              }
            />
            <Route
              path="/value-statements"
              element={
                <ProtectedLayout requiredRole="ADMIN">
                  <ValueStatements />
                </ProtectedLayout>
              }
            />
            {['/paired/new', '/paired/:id/edit', '/definitions/:id/start-paired-batch'].map((path) => (
              <Route key={path} path={path} element={<ProtectedLayout requiredRole="ADMIN"><PairedVignetteNew /></ProtectedLayout>} />
            ))}
            <Route path="*" element={<ProtectedLayout><NotFound /></ProtectedLayout>} />
          </Routes>
        </AuthProvider>
      </Provider>
    </BrowserRouter>
  );
}

export default App;
