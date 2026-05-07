/**
 * PairedRunComparisonCard
 *
 * Renders the blended paired summary for the current run's vignette pair.
 *
 * The numbers come from the server-side `pressureSensitivity(definitionId: ...)`
 * query, which:
 *   - resolves the companion vignette by canonical pair_key (no run-proximity
 *     heuristic)
 *   - includes ALL completed runs of both directions, not just one slice
 *   - blends the two directions with equal weight (no count-additive pooling)
 *
 * The companion run shown in the header is still resolved client-side via the
 * existing legacy heuristic (run-proximity) so the user can navigate to a
 * specific A-first / B-first batch. That navigation aid does not affect the
 * blended numbers below.
 */

import { useRef } from 'react';
import { useQuery } from 'urql';
import { Link } from 'react-router-dom';
import type { AnalysisResult } from '../../api/operations/analysis';
import type { Run } from '../../api/operations/runs';
import {
  PRESSURE_SENSITIVITY_QUERY,
  type PressureSensitivityQueryResult,
  type PressureSensitivityQueryVariables,
} from '../../api/operations/pressureSensitivity';
import { buildAnalysisDetailPath, type AnalysisBasePath } from '../../utils/analysisRouting';
import { getPairedOrientationLabels } from '../../utils/methodology';
import { CopyVisualButton } from '../ui/CopyVisualButton';

type PairedRunComparisonCardProps = {
  currentRun: Run;
  currentAnalysis: AnalysisResult | null;
  companionRun: Run | null;
  companionAnalysis: AnalysisResult | null;
  analysisBasePath: AnalysisBasePath;
  analysisSearch: string;
  embedded?: boolean;
};

const PAIR_KEY_COMPANION_COLLISION = 'pair_key_companion_collision';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getDefinitionPairKey(run: Run): string | null {
  const raw = run.definition?.content;
  if (!isRecord(raw) || !isRecord(raw.methodology)) return null;
  const value = raw.methodology.pair_key;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getRunConfigBatchGroupId(run: Run): string | null {
  if (typeof run.pairedBatchGroupId === 'string' && run.pairedBatchGroupId.trim().length > 0) {
    return run.pairedBatchGroupId;
  }
  const raw = run.config?.jobChoiceBatchGroupId;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

function getRunCompanionRunId(run: Run): string | null {
  const raw = run.companionRunId ?? run.config?.companionRunId;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

/**
 * Legacy run-proximity companion lookup. Used ONLY to populate the navigation
 * aid in the card header (so the user can jump to a specific A-first or B-first
 * batch). Not used for any blended numbers — those come from the server query.
 */
export function findCompanionPairedRun(currentRun: Run, candidateRuns: Run[]): Run | null {
  const batchGroupId = getRunConfigBatchGroupId(currentRun);
  const pairKey = getDefinitionPairKey(currentRun);

  const candidates = candidateRuns
    .filter((candidate) => candidate.id !== currentRun.id)
    .filter((candidate) => {
      if (batchGroupId) {
        return getRunConfigBatchGroupId(candidate) === batchGroupId;
      }
      if (pairKey) {
        return getDefinitionPairKey(candidate) === pairKey;
      }
      return false;
    });

  if (candidates.length === 0) {
    return null;
  }

  const reciprocalMatch = candidates.find((candidate) => getRunCompanionRunId(candidate) === currentRun.id);
  if (reciprocalMatch) {
    return reciprocalMatch;
  }

  const completedCandidates = candidates.filter((candidate) => candidate.status === 'COMPLETED');
  const rankingPool = completedCandidates.length > 0 ? completedCandidates : candidates;

  const sorted = [...rankingPool].sort((left, right) => (
    Math.abs(new Date(left.createdAt).getTime() - new Date(currentRun.createdAt).getTime())
    - Math.abs(new Date(right.createdAt).getTime() - new Date(currentRun.createdAt).getTime())
  ));

  return sorted[0] ?? null;
}

function formatPercentRate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const pct = value * 100;
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
}

function formatSignedPoints(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const pp = value * 100;
  const rounded = Math.round(pp * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}`;
}

function buildAnalysisHref(
  analysisBasePath: AnalysisBasePath,
  runId: string,
  analysisSearch: string,
): string {
  const normalizedSearch = analysisSearch.startsWith('?')
    ? analysisSearch
    : analysisSearch.length > 0
      ? `?${analysisSearch}`
      : '';
  return `${buildAnalysisDetailPath(analysisBasePath, runId)}${normalizedSearch}`;
}

function deriveTrialSignature(run: Run): string {
  const config = run.config as { definitionSnapshot?: { _meta?: { definitionVersion?: number | string }; version?: number | string }; temperature?: number | null } | null;
  const versionRaw = config?.definitionSnapshot?._meta?.definitionVersion ?? config?.definitionSnapshot?.version;
  const versionToken =
    typeof versionRaw === 'number' && Number.isFinite(versionRaw)
      ? String(versionRaw)
      : typeof versionRaw === 'string' && versionRaw.trim() !== ''
        ? versionRaw
        : '?';
  const temperature = config?.temperature;
  const temperatureToken =
    typeof temperature === 'number' && Number.isFinite(temperature)
      ? temperature.toFixed(3).replace(/\.?0+$/, '')
      : 'd';
  return `v${versionToken}t${temperatureToken}`;
}

export function PairedRunComparisonCard({
  currentRun,
  currentAnalysis: _currentAnalysis,
  companionRun,
  companionAnalysis: _companionAnalysis,
  analysisBasePath,
  analysisSearch,
  embedded = false,
}: PairedRunComparisonCardProps) {
  const comparisonRef = useRef<HTMLElement>(null);

  const labels = getPairedOrientationLabels(
    currentRun.definition?.content ?? companionRun?.definition?.content ?? null,
  );
  const firstValueLabel = labels.canonicalValues?.[0] ?? 'First value';
  const secondValueLabel = labels.canonicalValues?.[1] ?? 'Second value';
  const containerClass = embedded
    ? 'space-y-4 rounded-lg border border-teal-200 bg-teal-50/40 p-4'
    : 'space-y-4 rounded-xl border border-teal-200 bg-teal-50/60 p-4';

  const definitionId = currentRun.definition?.id ?? null;
  const signature = deriveTrialSignature(currentRun);

  const [{ data, fetching, error }] = useQuery<PressureSensitivityQueryResult, PressureSensitivityQueryVariables>({
    query: PRESSURE_SENSITIVITY_QUERY,
    variables: {
      definitionId: definitionId ?? undefined,
      signature,
    },
    pause: definitionId == null,
    requestPolicy: 'cache-and-network',
  });

  const pressureResult = data?.pressureSensitivity ?? null;
  const collision = pressureResult?.excludedDefinitions.some((entry) => entry.reason === PAIR_KEY_COMPANION_COLLISION) ?? false;
  const models = pressureResult?.models ?? [];
  const sortedModels = [...models].sort((a, b) => a.modelId.localeCompare(b.modelId));

  return (
    <section ref={comparisonRef} className={containerClass} data-testid="paired-run-comparison">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-teal-900">Paired Run Comparison</h2>
          <p className="text-sm text-teal-900/80">
            Blended summary across all completed runs of both directions of this vignette pair. Each direction counts
            equally; the blend is not weighted by trial count.
          </p>
        </div>
        <CopyVisualButton targetRef={comparisonRef} label="paired run comparison" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-teal-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase text-teal-700">{firstValueLabel} first</div>
          <div className="mt-1 font-medium text-gray-900">{currentRun.definition.name}</div>
          <Link
            className="mt-2 inline-flex text-sm font-medium text-teal-700 hover:text-teal-900"
            to={buildAnalysisHref(analysisBasePath, currentRun.id, analysisSearch)}
          >
            Open {currentRun.id.slice(0, 12)}
          </Link>
        </div>
        <div className="rounded-lg border border-teal-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase text-teal-700">{secondValueLabel} first</div>
          {companionRun ? (
            <>
              <div className="mt-1 font-medium text-gray-900">{companionRun.definition.name}</div>
              <Link
                className="mt-2 inline-flex text-sm font-medium text-teal-700 hover:text-teal-900"
                to={buildAnalysisHref(analysisBasePath, companionRun.id, analysisSearch)}
              >
                Open {companionRun.id.slice(0, 12)}
              </Link>
            </>
          ) : (
            <div className="mt-1 text-sm text-gray-600">
              Companion batch for the {secondValueLabel}-first order has not been launched alongside this run.
            </div>
          )}
        </div>
      </div>

      {definitionId == null ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This run is not linked to a vignette, so the blended paired summary cannot be loaded.
        </div>
      ) : collision ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          Cannot blend this vignette pair — multiple companion vignettes share its pair_key. Contact support to resolve.
        </div>
      ) : error != null ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Failed to load the blended summary: {error.message}
        </div>
      ) : fetching && pressureResult == null ? (
        <div className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm text-teal-900/80">
          Loading blended summary…
        </div>
      ) : sortedModels.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No completed runs at this signature for either direction yet.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  <th className="border border-teal-200 bg-white px-3 py-2 text-left text-xs font-semibold uppercase text-teal-700">
                    Model
                  </th>
                  <th className="border border-teal-200 bg-white px-3 py-2 text-center text-xs font-semibold text-teal-700">
                    {firstValueLabel}
                  </th>
                  <th className="border border-teal-200 bg-white px-3 py-2 text-center text-xs font-semibold text-teal-700">
                    {secondValueLabel}
                  </th>
                  <th className="border border-teal-200 bg-white px-3 py-2 text-center text-xs font-semibold text-teal-700">
                    Pressure response
                  </th>
                  <th className="border border-teal-200 bg-white px-3 py-2 text-center text-xs font-semibold text-teal-700">
                    Trials
                  </th>
                  <th className="border border-teal-200 bg-white px-3 py-2 text-center text-xs font-semibold text-teal-700">
                    Directions measured
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedModels.map((model) => {
                  const pair = model.valuePairs[0] ?? null;
                  return (
                    <tr key={model.modelId}>
                      <td className="border border-teal-200 bg-white px-3 py-2 text-sm text-gray-800">
                        {model.label || model.modelId}
                      </td>
                      <td className="border border-teal-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                        {formatPercentRate(pair?.directionBalancedWinRate ?? null)}
                      </td>
                      <td className="border border-teal-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                        {formatPercentRate(pair?.directionBalancedOpponentWinRate ?? null)}
                      </td>
                      <td className="border border-teal-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                        {formatSignedPoints(pair?.pressureResponse?.value ?? null)}
                      </td>
                      <td className="border border-teal-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                        {pair?.n ?? 0}
                      </td>
                      <td className="border border-teal-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                        {pair?.definitionsMeasured ?? 0} / 2
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-gray-600">
              Win rates are direction-balanced (each direction counts once before averaging). Pressure response is
              the percentage-point shift toward the canonical first value when that value is under pressure.
              {'"'}Directions measured{'"'} shows whether both A-first and B-first contributed; 1/2 means only one
              direction had completed runs.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
