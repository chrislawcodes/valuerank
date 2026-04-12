// NOTE: The term "Vignette" is used throughout the UI for user-friendliness.
// However, the underlying codebase, API, and database still use the term "Definition".
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'urql';
import { AuthProvider } from './auth/context';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { ValidationHome } from './pages/ValidationHome';
import { ArchiveHome } from './pages/ArchiveHome';
import { Definitions } from './pages/Definitions';
import { Domains } from './pages/Domains';
import { DomainsManage } from './pages/DomainsManage';
import { DomainStartBatches } from './pages/DomainStartBatches';
import { DomainStatus } from './pages/DomainStatus';
import { DomainAnalysis } from './pages/DomainAnalysis';
import { DomainCoverage } from './pages/DomainCoverage';
import { TempZeroEffectAssumptions } from './pages/TempZeroEffectAssumptions';
import { AnalysisAssumptions } from './pages/AnalysisAssumptions';
import { OrderEffectAssumptions } from './pages/OrderEffectAssumptions';
import { DomainAnalysisValueDetail } from './pages/DomainAnalysisValueDetail';
import { DefinitionDetail } from './pages/DefinitionDetail';
import { StartPairedBatchPage } from './pages/DefinitionDetail/StartPairedBatchPage';
import { Runs } from './pages/Runs';
import { RunDetail } from './pages/RunDetail';
import { Analysis } from './pages/Analysis';
import { AnalysisDetail } from './pages/AnalysisDetail';
import { AnalysisConditionDetail } from './pages/AnalysisConditionDetail';
import { AnalysisTranscripts } from './pages/AnalysisTranscripts';
import { Compare } from './pages/Compare';
import { Survey } from './pages/Survey';
import { SurveyResults } from './pages/SurveyResults';
import { SettingsAccount } from './pages/SettingsAccount';
import { SettingsSystemHealth } from './pages/SettingsSystemHealth';
import { SettingsModels } from './pages/SettingsModels';
import { SettingsInfrastructure } from './pages/SettingsInfrastructure';
import { SettingsApiKeys } from './pages/SettingsApiKeys';
import { Preambles } from './pages/Preambles';
import { LevelPresets } from './pages/LevelPresets';
import { DomainContexts } from './pages/DomainContexts';
import { ValueStatements } from './pages/ValueStatements';
import { PairedVignetteNew } from './pages/PairedVignetteNew';
import { StartRedirect } from './pages/StartRedirect';
import { StatusRedirect } from './pages/StatusRedirect';
import { NotFound } from './pages/NotFound';
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
              path="/status"
              element={
                <ProtectedLayout>
                  <StatusRedirect />
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
                <ProtectedLayout>
                  <DomainsManage />
                </ProtectedLayout>
              }
            />
            <Route
              path="/validation"
              element={
                <ProtectedLayout>
                  <ValidationHome />
                </ProtectedLayout>
              }
            />
            <Route
              path="/archive"
              element={
                <ProtectedLayout>
                  <ArchiveHome />
                </ProtectedLayout>
              }
            />
            <Route
              path="/domains/start/:domainId"
              element={
                <ProtectedLayout>
                  <DomainStartBatches />
                </ProtectedLayout>
              }
            />
            <Route
              path="/domains/start"
              element={
                <ProtectedLayout>
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
            <Route
              path="/assumptions"
              element={<Navigate to="/validation" replace />}
            />
            <Route
              path="/assumptions/temp-zero"
              element={<Navigate to="/assumptions/temp-zero-effect" replace />}
            />
            <Route
              path="/assumptions/temp-zero-effect"
              element={
                <ProtectedLayout fullWidth>
                  <TempZeroEffectAssumptions />
                </ProtectedLayout>
              }
            />
            <Route
              path="/assumptions/analysis"
              element={
                <ProtectedLayout fullWidth>
                  <AnalysisAssumptions />
                </ProtectedLayout>
              }
            />
            <Route
              path="/assumptions/analysis-v1"
              element={
                <ProtectedLayout fullWidth>
                  <OrderEffectAssumptions />
                </ProtectedLayout>
              }
            />
            <Route
              path="/assumptions/order-effect"
              element={<Navigate to="/assumptions/analysis-v1" replace />}
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
              path="/compare"
              element={
                <ProtectedLayout fullWidth>
                  <Compare />
                </ProtectedLayout>
              }
            />
            <Route
              path="/archive/surveys"
              element={
                <ProtectedLayout>
                  <Survey />
                </ProtectedLayout>
              }
            />
            <Route
              path="/archive/survey-results"
              element={
                <ProtectedLayout>
                  <SurveyResults />
                </ProtectedLayout>
              }
            />
            <Route path="/survey" element={<LegacyRouteRedirect to="/archive/surveys" />} />
            <Route path="/survey-results" element={<LegacyRouteRedirect to="/archive/survey-results" />} />
            <Route path="/experiments" element={<Navigate to="/archive" replace />} />
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
                <ProtectedLayout>
                  <SettingsSystemHealth />
                </ProtectedLayout>
              }
            />
            <Route
              path="/settings/models"
              element={
                <ProtectedLayout>
                  <SettingsModels />
                </ProtectedLayout>
              }
            />
            <Route
              path="/settings/infrastructure"
              element={
                <ProtectedLayout>
                  <SettingsInfrastructure />
                </ProtectedLayout>
              }
            />
            <Route
              path="/settings/api-keys"
              element={
                <ProtectedLayout>
                  <SettingsApiKeys />
                </ProtectedLayout>
              }
            />
            <Route
              path="/preambles"
              element={
                <ProtectedLayout>
                  <Preambles />
                </ProtectedLayout>
              }
            />
            <Route
              path="/level-presets"
              element={
                <ProtectedLayout>
                  <LevelPresets />
                </ProtectedLayout>
              }
            />
            <Route
              path="/domain-contexts"
              element={
                <ProtectedLayout>
                  <DomainContexts />
                </ProtectedLayout>
              }
            />
            <Route
              path="/value-statements"
              element={
                <ProtectedLayout>
                  <ValueStatements />
                </ProtectedLayout>
              }
            />
            {['/paired/new', '/paired/:id/edit'].map((path) => (
              <Route key={path} path={path} element={<ProtectedLayout><PairedVignetteNew /></ProtectedLayout>} />
            ))}
            <Route
              path="*"
              element={
                <ProtectedLayout>
                  <NotFound />
                </ProtectedLayout>
              }
            />
          </Routes>
        </AuthProvider>
      </Provider>
    </BrowserRouter>
  );
}

export default App;
