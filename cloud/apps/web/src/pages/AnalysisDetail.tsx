/**
 * AnalysisDetail Page
 *
 * Displays detailed analysis for a single run with full AnalysisPanel.
 */

import { useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from 'urql';
import { ArrowLeft } from 'lucide-react';
import { formatTrialSignature } from '@valuerank/shared/trial-signature';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { AnalysisPanel } from '../components/analysis/AnalysisPanel';
import { useAnalysis } from '../hooks/useAnalysis';
import { useRun } from '../hooks/useRun';
import { getRunDefinitionContent } from '../utils/runDefinitionContent';
import type { AnalysisTab } from '../components/analysis/tabs';
import { ANALYSIS_BASE_PATH, buildAnalysisDetailPath, isAggregateAnalysis } from '../utils/analysisRouting';
import { getDefinitionMethodology, getDefinitionMethodologyLabel } from '../utils/methodology';
import { LLM_MODELS_QUERY, type LlmModelsQueryResult } from '../api/operations/llm';
import {
  AnalysisDetailHeader,
  COVERAGE_CONTEXT_QUERY_KEYS,
} from './AnalysisDetailHeader';

function parseAnalysisTab(value: string | null): AnalysisTab {
  if (value === 'overview' || value === 'decisions' || value === 'scenarios') {
    return value;
  }
  return 'overview';
}

type AnalysisDetailMode = 'single' | 'paired';

function parseAnalysisDetailMode(value: string | null): AnalysisDetailMode {
  return value === 'paired' ? 'paired' : 'single';
}

function parseCoverageCountParam(value: string | null): number | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function formatLaunchModeLabel(launchMode: string | null | undefined): string | null {
  switch (launchMode) {
    case 'AD_HOC_BATCH':
      return 'Ad Hoc Batch';
    case 'PAIRED_BATCH':
      return 'Paired Batch';
    case 'PAIRED_BATCH_TOPUP':
      return 'Paired batch top-up';
    case 'STANDARD':
    case null:
    case undefined:
      return null;
    default:
      return null;
  }
}

function buildAnalysisDetailParams(
  searchParams: URLSearchParams,
  tab: AnalysisTab,
  mode: AnalysisDetailMode,
  options: { preserveCoverageContext?: boolean } = {},
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  next.set('tab', tab);
  next.set('mode', mode);
  if (!options.preserveCoverageContext) {
    for (const key of COVERAGE_CONTEXT_QUERY_KEYS) {
      next.delete(key);
    }
  }
  return next;
}

export function AnalysisDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const activeTab = parseAnalysisTab(searchParams.get('tab'));
  const coverageBatchCount = parseCoverageCountParam(searchParams.get('coverageBatchCount'));
  const coveragePairedBatchCount = parseCoverageCountParam(searchParams.get('coveragePairedBatchCount'));
  const analysisMode = parseAnalysisDetailMode(searchParams.get('mode'));

  useEffect(() => {
    const currentTab = searchParams.get('tab');
    const currentMode = searchParams.get('mode');
    if (currentTab === activeTab && currentMode === analysisMode) {
      return;
    }

    const nextSearch = buildAnalysisDetailParams(searchParams, activeTab, analysisMode, {
      preserveCoverageContext: true,
    }).toString();
    if (searchParams.toString() !== nextSearch) {
      navigate({
        pathname: buildAnalysisDetailPath(ANALYSIS_BASE_PATH, id || ''),
        search: nextSearch.length > 0 ? `?${nextSearch}` : '',
      }, { replace: true });
    }
  }, [activeTab, analysisMode, id, navigate, searchParams]);

  const handleTabChange = (tab: AnalysisTab) => {
    if (tab === activeTab) {
      return;
    }

    const next = buildAnalysisDetailParams(searchParams, tab, analysisMode, {
      preserveCoverageContext: true,
    });
    navigate({
      pathname: buildAnalysisDetailPath(ANALYSIS_BASE_PATH, id || ''),
      search: next.toString().length > 0 ? `?${next.toString()}` : '',
    });
  };

  const { run, loading, error } = useRun({
    id: id || '',
    pause: !id,
    enablePolling: true,
  });

  const [llmModelsResult] = useQuery<LlmModelsQueryResult>({
    query: LLM_MODELS_QUERY,
  });
  // Pass null while fetching so useAnalysisState knows to defer model filtering
  // (an empty array would look like "no defaults configured" and cause the filter
  // to fall back to showing all transcript models before the query resolves).
  const globalDefaultModelIds = useMemo(
    () => llmModelsResult.fetching
      ? null
      : (llmModelsResult.data?.llmModels ?? [])
          .filter((m) => m.isDefault)
          .map((m) => m.modelId),
    [llmModelsResult.fetching, llmModelsResult.data],
  );

  const { analysis } = useAnalysis({
    runId: id || '',
    pause: !id || !run?.analysisStatus,
    enablePolling: false,
    analysisStatus: run?.analysisStatus ?? null,
  });
  // Paired analysis has its own page at /vignette/:definitionId/paired.
  // We keep companionAnalysis/companionRun as null here so AnalysisPanel
  // never enters paired-mode rendering on the run-centric view.
  const companionAnalysis = null;
  const companionRun = null;

  // Legacy ?mode=paired URL handling — paired analysis lives at /vignette/:definitionId/paired now.
  // Run as effect (always called, regardless of run state) to satisfy hook ordering rules.
  const earlyDefinitionContent = run != null ? getRunDefinitionContent(run) : null;
  const earlyMethodology = earlyDefinitionContent != null ? getDefinitionMethodology(earlyDefinitionContent) : null;
  const earlyPairedDefinitionId =
    earlyMethodology?.pair_key != null ? run?.definition?.id ?? null : null;
  const requestedPairedMode = analysisMode === 'paired';
  useEffect(() => {
    if (!requestedPairedMode) {
      return;
    }
    if (earlyPairedDefinitionId != null) {
      navigate(`/vignette/${earlyPairedDefinitionId}/paired`, { replace: true });
    }
  }, [navigate, earlyPairedDefinitionId, requestedPairedMode]);

  // Loading state
  if (loading && !run) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/analysis')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <Loading size="lg" text="Loading analysis..." />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/analysis')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <ErrorMessage message={`Failed to load analysis: ${error.message}`} />
      </div>
    );
  }

  // Not found
  if (!run) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/analysis')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <ErrorMessage message="Trial not found" />
      </div>
    );
  }

  const isAggregate = isAggregateAnalysis(
    run.tags?.some((tag) => tag.name === 'Aggregate') ?? false,
    analysis?.analysisType,
  );

  const config = run.config as {
    definitionSnapshot?: { _meta?: { definitionVersion?: unknown }, version?: unknown };
    temperature?: unknown;
  } | null;

  const runDefinitionVersion = typeof config?.definitionSnapshot?._meta?.definitionVersion === 'number'
    ? config.definitionSnapshot._meta.definitionVersion
    : typeof config?.definitionSnapshot?.version === 'number'
      ? config.definitionSnapshot.version
      : typeof run.definitionVersion === 'number'
        ? run.definitionVersion
        : null;

  const runTemperature = typeof config?.temperature === 'number' ? config.temperature : null;
  const trialSignature = formatTrialSignature(runDefinitionVersion, runTemperature);

  const latestDefinitionVersion = run.definition?.version;
  const isOldVersion = (
    runDefinitionVersion !== null
    && runDefinitionVersion !== undefined
    && latestDefinitionVersion !== null
    && latestDefinitionVersion !== undefined
    && runDefinitionVersion !== latestDefinitionVersion
  );
  const definitionContent = getRunDefinitionContent(run);
  const methodologyLabel = getDefinitionMethodologyLabel(
    definitionContent,
    run.definition?.domain?.name ?? null,
  );
  const methodology = getDefinitionMethodology(definitionContent);
  const runLaunchMode = run.config?.jobChoiceLaunchMode;
  const launchModeLabel = methodology?.pair_key != null ? formatLaunchModeLabel(runLaunchMode) : null;
  const pairedDefinitionId = methodology?.pair_key != null ? run.definition?.id ?? null : null;
  const legacyCompanionRunId = typeof run.companionRunId === 'string' && run.companionRunId.length > 0
    ? run.companionRunId
    : (typeof run.config?.companionRunId === 'string' && run.config.companionRunId.length > 0
      ? run.config.companionRunId
      : null);
  const handleSingleVignetteChange = (nextRunId: string) => {
    if (!nextRunId || nextRunId === run.id) {
      return;
    }

    const next = buildAnalysisDetailParams(searchParams, activeTab, 'single', {
      preserveCoverageContext: false,
    });
    navigate({
      pathname: buildAnalysisDetailPath(ANALYSIS_BASE_PATH, nextRunId),
      search: next.toString().length > 0 ? `?${next.toString()}` : '',
    });
  };

  const showOrphanedPairedAlert =
    requestedPairedMode && methodology?.pair_key != null && pairedDefinitionId == null;
  const showLegacyCompanionRunAlert =
    requestedPairedMode && methodology?.pair_key == null && legacyCompanionRunId != null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <AnalysisDetailHeader
          runId={run.id}
          definitionId={run.definition?.id}
          definitionName={run.definition?.name}
          methodologyLabel={methodologyLabel}
          launchModeLabel={launchModeLabel}
          isAggregate={isAggregate}
          currentSignature={trialSignature}
        />
      </div>
      {pairedDefinitionId != null && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
          <p className="text-sm text-teal-900">
            Paired analysis for this vignette has moved to its own page.{' '}
            <Link
              to={`/vignette/${pairedDefinitionId}/paired`}
              className="font-medium text-teal-700 underline hover:text-teal-900"
            >
              View paired analysis
            </Link>
            .
          </p>
        </div>
      )}
      {showOrphanedPairedAlert && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900">
            A paired analysis for this run may exist, but this run is not linked to a vignette,
            so we cannot navigate there automatically. Search for the vignette by name on the
            vignettes page to open the paired view.
          </p>
        </div>
      )}
      {showLegacyCompanionRunAlert && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900">
            Legacy paired analysis URLs without canonical pair metadata are deprecated. The new
            paired report is organized by vignette — search for this vignette by name to open it.
          </p>
        </div>
      )}

      {!run.analysisStatus ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Analysis Available
          </h3>
          <p className="text-gray-500 mb-4">
            This trial does not have analysis data.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnalysisPanel
            runId={run.id}
            analysisStatus={run.analysisStatus}
            analysisBasePath={ANALYSIS_BASE_PATH}
            analysisSearchParams={searchParams}
            analysisMode={analysisMode}
            coverageBatchCount={coverageBatchCount}
            coveragePairedBatchCount={coveragePairedBatchCount}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onSingleVignetteChange={handleSingleVignetteChange}
            companionAnalysis={companionAnalysis}
            currentRun={run}
            companionRun={companionRun}
            definitionContent={definitionContent}
            transcripts={run.transcripts}
            isOldVersion={isOldVersion}
            isAggregate={isAggregate}
            pendingSince={run.completedAt}
            globalDefaultModelIds={globalDefaultModelIds}
          />
        </div>
      )}
    </div>
  );
}
