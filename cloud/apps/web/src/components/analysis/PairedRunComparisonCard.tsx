import { useRef } from 'react';
import { Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AnalysisResult } from '../../api/operations/analysis';
import type { Run } from '../../api/operations/runs';
import { buildAnalysisDetailPath, type AnalysisBasePath } from '../../utils/analysisRouting';
import { collectDecisionBucketCounts, type DecisionBucket } from '../../utils/decisionBuckets';
import { computeAttributeSensitivity } from '../../utils/decisionSensitivity';
import { getPairedOrientationLabels } from '../../utils/methodology';
import { Button } from '../ui/Button';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { Tooltip } from '../ui/Tooltip';
import {
  deriveDecisionDimensionLabels,
  deriveScenarioAttributesFromDefinition,
  getDecisionSideNames,
  mapDecisionSidesToScenarioAttributes,
} from '../../utils/decisionLabels';

type PairedRunComparisonCardProps = {
  currentRun: Run;
  currentAnalysis: AnalysisResult | null;
  companionRun: Run | null;
  companionAnalysis: AnalysisResult | null;
  analysisBasePath: AnalysisBasePath;
  analysisSearch: string;
  embedded?: boolean;
};


type ValueCounts = {
  first: number | null;
  neutral: number | null;
  second: number | null;
  total: number | null;
};

type ComparisonRow = {
  modelId: string;
  blended: ValueCounts;
  blendedFirstSensitivity: number | null;
  blendedSecondSensitivity: number | null;
  aFirst: ValueCounts;
  bFirst: ValueCounts;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function getDefinitionPairKey(run: Run): string | null {
  const raw = run.definition?.content;
  if (!isRecord(raw) || !isRecord(raw.methodology)) return null;
  const value = raw.methodology.pair_key;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function buildValueCounts(
  analysis: AnalysisResult | null,
  run: Run | null,
  modelId: string,
  firstValueLabel: string,
  secondValueLabel: string,
  firstValueKey: string | null,
  secondValueKey: string | null,
): ValueCounts {
  const attributes = deriveScenarioAttributesFromDefinition(run?.definition?.content);
  const matrixCounts = collectDecisionBucketCounts(
    analysis?.visualizationData?.scenarioDimensions,
    analysis?.visualizationData?.modelScenarioMatrix,
    modelId,
    attributes[0] ?? '',
    attributes[1] ?? attributes[0] ?? '',
  );
  if (matrixCounts && run) {
    const firstBucket = getDecisionBucketForValue(run, firstValueLabel);
    const secondBucket = getDecisionBucketForValue(run, secondValueLabel);
    const bucketValue = (bucket: DecisionBucket | null): number | null => {
      if (!bucket) return null;
      return matrixCounts[bucket];
    };
    return {
      first: bucketValue(firstBucket),
      neutral: matrixCounts.neutral,
      second: bucketValue(secondBucket),
      total: matrixCounts.total,
    };
  }

  if (!firstValueKey || !secondValueKey) {
    return { first: null, neutral: null, second: null, total: null };
  }

  const perModel = analysis?.preferenceSummary?.perModel;
  if (!isRecord(perModel)) {
    return { first: null, neutral: null, second: null, total: null };
  }
  const model = perModel[modelId];
  if (!isRecord(model)) {
    return { first: null, neutral: null, second: null, total: null };
  }
  const direction = model.preferenceDirection;
  if (!isRecord(direction)) {
    return { first: null, neutral: null, second: null, total: null };
  }
  const byValue = direction.byValue;
  if (!isRecord(byValue)) {
    return { first: null, neutral: null, second: null, total: null };
  }

  const firstStats = isRecord(byValue[firstValueKey])
    ? (byValue[firstValueKey] as Record<string, unknown>)
    : null;
  const secondStats = isRecord(byValue[secondValueKey])
    ? (byValue[secondValueKey] as Record<string, unknown>)
    : null;
  const firstCount = isRecord(firstStats?.count) ? firstStats.count : null;
  const secondCount = isRecord(secondStats?.count) ? secondStats.count : null;
  const first = firstCount && typeof firstCount.prioritized === 'number' ? firstCount.prioritized : null;
  const second = secondCount && typeof secondCount.prioritized === 'number' ? secondCount.prioritized : null;
  const neutral = firstCount && typeof firstCount.neutral === 'number' ? firstCount.neutral : null;
  const total = first != null && second != null
    ? first + second + (neutral ?? 0)
    : null;

  return { first, neutral, second, total };
}

export function buildComparisonRows(
  aFirstRun: Run | null,
  aFirstAnalysis: AnalysisResult | null,
  bFirstRun: Run | null,
  bFirstAnalysis: AnalysisResult | null,
): ComparisonRow[] {
  const labels = getPairedOrientationLabels(
    aFirstRun?.definition?.content ?? bFirstRun?.definition?.content ?? null,
  );
  const firstValueKey = labels.canonicalValues?.[0] ?? null;
  const secondValueKey = labels.canonicalValues?.[1] ?? null;

  const valueKeyLookup = (() => {
    if (!firstValueKey || !secondValueKey) return null;
    return {
      first: firstValueKey.toLowerCase().replace(/\s+/g, '_'),
      second: secondValueKey.toLowerCase().replace(/\s+/g, '_'),
    };
  })();

  const modelIds = new Set<string>();
  const aPerModel = aFirstAnalysis?.preferenceSummary?.perModel;
  const bPerModel = bFirstAnalysis?.preferenceSummary?.perModel;
  if (isRecord(aPerModel)) {
    Object.keys(aPerModel).forEach((modelId) => modelIds.add(modelId));
  }
  if (isRecord(bPerModel)) {
    Object.keys(bPerModel).forEach((modelId) => modelIds.add(modelId));
  }

  return [...modelIds].sort().map((modelId) => {
    const aFirst = buildValueCounts(
      aFirstAnalysis,
      aFirstRun,
      modelId,
      firstValueKey ?? 'First value',
      secondValueKey ?? 'Second value',
      valueKeyLookup?.first ?? null,
      valueKeyLookup?.second ?? null,
    );
    const bFirst = buildValueCounts(
      bFirstAnalysis,
      bFirstRun,
      modelId,
      firstValueKey ?? 'First value',
      secondValueKey ?? 'Second value',
      valueKeyLookup?.first ?? null,
      valueKeyLookup?.second ?? null,
    );
    const aFirstFirstSensitivity = getSensitivityForValue(aFirstAnalysis, aFirstRun, modelId, firstValueKey ?? 'First value');
    const aFirstSecondSensitivity = getSensitivityForValue(aFirstAnalysis, aFirstRun, modelId, secondValueKey ?? 'Second value');
    const bFirstFirstSensitivity = getSensitivityForValue(bFirstAnalysis, bFirstRun, modelId, firstValueKey ?? 'First value');
    const bFirstSecondSensitivity = getSensitivityForValue(bFirstAnalysis, bFirstRun, modelId, secondValueKey ?? 'Second value');

    return {
      modelId,
      blended: {
        first:
          aFirst.first != null && bFirst.first != null
            ? aFirst.first + bFirst.first
            : null,
        neutral:
          aFirst.neutral != null && bFirst.neutral != null
            ? aFirst.neutral + bFirst.neutral
            : null,
        second:
          aFirst.second != null && bFirst.second != null
            ? aFirst.second + bFirst.second
            : null,
        total:
          aFirst.total != null && bFirst.total != null
            ? aFirst.total + bFirst.total
            : null,
      },
      blendedFirstSensitivity: mergeWeightedSensitivity(
        aFirstFirstSensitivity,
        aFirst.total,
        bFirstFirstSensitivity,
        bFirst.total,
      ),
      blendedSecondSensitivity: mergeWeightedSensitivity(
        aFirstSecondSensitivity,
        aFirst.total,
        bFirstSecondSensitivity,
        bFirst.total,
      ),
      aFirst,
      bFirst,
    };
  });
}

function formatPercent(value: number | null, total: number | null): string {
  if (value == null || total == null || total <= 0) return '—';
  const percent = (value / total) * 100;
  const rounded = Math.round(percent * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
}

function formatSensitivity(value: number | null): string {
  return value == null ? '—' : value.toFixed(2);
}

function SensitivityHeader({
  label,
  valueLabel,
}: {
  label: string;
  valueLabel: string;
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      <span>{label}</span>
      <Tooltip
        content={(
          <div className="space-y-1 text-left">
            <p>Each vignette uses this value across five strength levels, from weakest to strongest.</p>
            <p>The model then assigns one of the canonical decision buckets, from strongest preference for the other value to strongest preference for this value.</p>
            <p>Sensitivity shows how much the model shifts toward this value when this value goes up by one level, while the other value stays the same.</p>
            <p>For example, if sensitivity is 0.5, then raising {valueLabel} from level 1 to level 5 would be expected to move the model about 2 points toward {valueLabel} on average.</p>
          </div>
        )}
        position="top"
        className="max-w-sm"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-4 w-4 min-h-0 min-w-0 rounded-full p-0 text-teal-700/80 hover:bg-transparent hover:text-teal-900 focus:ring-teal-500 focus:ring-offset-0"
          aria-label={`What ${label} measures`}
        >
          <Info className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
    </div>
  );
}

function mergeWeightedSensitivity(
  left: number | null,
  leftWeight: number | null,
  right: number | null,
  rightWeight: number | null,
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  if (left != null && leftWeight != null && leftWeight > 0) {
    weightedSum += left * leftWeight;
    totalWeight += leftWeight;
  }

  if (right != null && rightWeight != null && rightWeight > 0) {
    weightedSum += right * rightWeight;
    totalWeight += rightWeight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null;
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

function normalizeValueKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '_');
}

function getDecisionBucketForValue(run: Run, valueLabel: string): 'a' | 'b' | null {
  const definitionContent = run.definition?.content;
  const dimensionLabels = deriveDecisionDimensionLabels(definitionContent);
  const sideNames = getDecisionSideNames(dimensionLabels);
  const attributes = deriveScenarioAttributesFromDefinition(definitionContent);
  const mapped = mapDecisionSidesToScenarioAttributes(sideNames.aName, sideNames.bName, attributes);
  const normalizedValue = normalizeValueKey(valueLabel);
  if (normalizeValueKey(mapped.lowAttribute) === normalizedValue) return 'a';
  if (normalizeValueKey(mapped.highAttribute) === normalizedValue) return 'b';
  return null;
}

function getSensitivityForValue(
  analysis: AnalysisResult | null,
  run: Run | null,
  modelId: string,
  valueLabel: string,
): number | null {
  if (!run) return null;

  const definitionContent = run.definition?.content;
  const dimensionLabels = deriveDecisionDimensionLabels(definitionContent);
  const sideNames = getDecisionSideNames(dimensionLabels);
  const attributes = deriveScenarioAttributesFromDefinition(definitionContent);
  const mapped = mapDecisionSidesToScenarioAttributes(sideNames.aName, sideNames.bName, attributes);
  const normalizedValue = normalizeValueKey(valueLabel);

  if (normalizeValueKey(mapped.lowAttribute) === normalizedValue) {
    return computeAttributeSensitivity(analysis?.visualizationData, modelId, mapped.lowAttribute, 'low');
  }

  if (normalizeValueKey(mapped.highAttribute) === normalizedValue) {
    return computeAttributeSensitivity(analysis?.visualizationData, modelId, mapped.highAttribute, 'high');
  }

  return null;
}

function buildTranscriptHref(
  analysisBasePath: AnalysisBasePath,
  run: Run,
  modelId: string,
  valueLabel: string,
  analysisSearch: string,
  extras?: Record<string, string | null | undefined>,
  decisionBucketOverride?: 'a' | 'neutral' | 'b',
): string | null {
  const attributes = deriveScenarioAttributesFromDefinition(run.definition?.content);
  const rowDim = attributes[0] ?? '';
  const colDim = attributes[1] ?? attributes[0] ?? '';
  const decisionBucket = decisionBucketOverride ?? getDecisionBucketForValue(run, valueLabel);
  if (!rowDim || !colDim || !decisionBucket) return null;

  const params = new URLSearchParams();
  params.set('rowDim', rowDim);
  params.set('colDim', colDim);
  params.set('modelId', modelId);
  params.set('decisionBucket', decisionBucket);
  params.set('mode', 'paired');
  Object.entries(extras ?? {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  const normalizedSearch = analysisSearch.startsWith('?')
    ? analysisSearch.slice(1)
    : analysisSearch;
  if (normalizedSearch.length > 0) {
    const search = new URLSearchParams(normalizedSearch);
    if (!params.has('tab') && search.get('tab')) {
      params.set('tab', search.get('tab') as string);
    }
  }

  return `${analysisBasePath}/${run.id}/transcripts?${params.toString()}`;
}

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

export function PairedRunComparisonCard({
  currentRun,
  currentAnalysis,
  companionRun,
  companionAnalysis,
  analysisBasePath,
  analysisSearch,
  embedded = false,
}: PairedRunComparisonCardProps) {
  const comparisonRef = useRef<HTMLElement>(null);

  const aFirstRun = currentRun;
  const bFirstRun = companionRun ?? null;
  const aFirstAnalysis = currentAnalysis;
  const bFirstAnalysis = companionAnalysis ?? null;

  const labels = getPairedOrientationLabels(
    aFirstRun?.definition?.content ?? bFirstRun?.definition?.content ?? null,
  );
  const firstValueLabel = labels.canonicalValues?.[0] ?? 'First value';
  const secondValueLabel = labels.canonicalValues?.[1] ?? 'Second value';
  const comparisonRows = buildComparisonRows(aFirstRun, aFirstAnalysis, bFirstRun, bFirstAnalysis);
  const containerClass = embedded
    ? 'space-y-4 rounded-lg border border-teal-200 bg-teal-50/40 p-4'
    : 'space-y-4 rounded-xl border border-teal-200 bg-teal-50/60 p-4';

  return (
    <section ref={comparisonRef} className={containerClass} data-testid="paired-run-comparison">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-teal-900">Paired Run Comparison</h2>
          <p className="text-sm text-teal-900/80">
            Paired mode keeps the blended summary first so you can compare both runs in one table.
          </p>
        </div>
        <CopyVisualButton targetRef={comparisonRef} label="paired run comparison" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-teal-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase text-teal-700">{firstValueLabel} first</div>
          {aFirstRun ? (
            <>
              <div className="mt-1 font-medium text-gray-900">{aFirstRun.definition.name}</div>
              <Link
                className="mt-2 inline-flex text-sm font-medium text-teal-700 hover:text-teal-900"
                to={buildAnalysisHref(analysisBasePath, aFirstRun.id, analysisSearch)}
              >
                Open {aFirstRun.id.slice(0, 12)}
              </Link>
            </>
          ) : (
            <div className="mt-1 text-sm text-gray-600">Companion run for the {firstValueLabel}-first order was not found yet.</div>
          )}
        </div>
        <div className="rounded-lg border border-teal-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase text-teal-700">{secondValueLabel} first</div>
          {bFirstRun ? (
            <>
              <div className="mt-1 font-medium text-gray-900">{bFirstRun.definition.name}</div>
              <Link
                className="mt-2 inline-flex text-sm font-medium text-teal-700 hover:text-teal-900"
                to={buildAnalysisHref(analysisBasePath, bFirstRun.id, analysisSearch)}
              >
                Open {bFirstRun.id.slice(0, 12)}
              </Link>
            </>
          ) : (
            <div className="mt-1 text-sm text-gray-600">Companion run for the {secondValueLabel}-first order was not found yet.</div>
          )}
        </div>
      </div>

      {companionRun == null ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Paired mode could not find the companion run for this batch yet.
        </div>
      ) : comparisonRows.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          The paired comparison is waiting on analysis results from one or both runs.
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-teal-900/80">
            The table shows the blended summary for each model.
          </p>
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
                    Neutral
                  </th>
                  <th className="border border-teal-200 bg-white px-3 py-2 text-center text-xs font-semibold text-teal-700">
                    {secondValueLabel}
                  </th>
                  <th className="border border-teal-200 bg-white px-3 py-2 text-center text-xs font-semibold text-teal-700">
                    <SensitivityHeader
                      label={`${firstValueLabel} Sensitivity`}
                      valueLabel={firstValueLabel}
                    />
                  </th>
                  <th className="border border-teal-200 bg-white px-3 py-2 text-center text-xs font-semibold text-teal-700">
                    <SensitivityHeader
                      label={`${secondValueLabel} Sensitivity`}
                      valueLabel={secondValueLabel}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.modelId}>
                    <td className="border border-teal-200 bg-white px-3 py-2 text-sm text-gray-800">
                      {row.modelId}
                    </td>
                    <td className="border border-teal-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                      {aFirstRun && bFirstRun ? (
                        <Link
                          className="font-medium text-teal-700 hover:text-teal-900"
                          to={buildTranscriptHref(
                            analysisBasePath,
                            currentRun,
                            row.modelId,
                            firstValueLabel,
                            analysisSearch,
                            {
                              companionRunId: companionRun?.id ?? null,
                              pairedValueKey: normalizeValueKey(firstValueLabel),
                              pairedValueLabel: firstValueLabel,
                              pairView: 'blended',
                            },
                          ) ?? '#'}
                        >
                          {formatPercent(row.blended.first, row.blended.total)}
                        </Link>
                      ) : (
                        formatPercent(row.blended.first, row.blended.total)
                      )}
                    </td>
                    <td className="border border-teal-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                      {aFirstRun && bFirstRun ? (
                        <Link
                          className="font-medium text-teal-700 hover:text-teal-900"
                          to={buildTranscriptHref(
                            analysisBasePath,
                            currentRun,
                            row.modelId,
                            'Neutral',
                            analysisSearch,
                            {
                              companionRunId: companionRun?.id ?? null,
                              pairedDecisionBucket: 'neutral',
                              pairedValueLabel: 'Neutral',
                              pairView: 'blended',
                            },
                            'neutral',
                          ) ?? '#'}
                        >
                          {formatPercent(row.blended.neutral, row.blended.total)}
                        </Link>
                      ) : (
                        formatPercent(row.blended.neutral, row.blended.total)
                      )}
                    </td>
                    <td className="border border-teal-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                      {aFirstRun && bFirstRun ? (
                        <Link
                          className="font-medium text-teal-700 hover:text-teal-900"
                          to={buildTranscriptHref(
                            analysisBasePath,
                            currentRun,
                            row.modelId,
                            secondValueLabel,
                            analysisSearch,
                            {
                              companionRunId: companionRun?.id ?? null,
                              pairedValueKey: normalizeValueKey(secondValueLabel),
                              pairedValueLabel: secondValueLabel,
                              pairView: 'blended',
                            },
                          ) ?? '#'}
                        >
                          {formatPercent(row.blended.second, row.blended.total)}
                        </Link>
                      ) : (
                        formatPercent(row.blended.second, row.blended.total)
                      )}
                    </td>
                    <td className="border border-teal-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                      {formatSensitivity(row.blendedFirstSensitivity)}
                    </td>
                    <td className="border border-teal-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                      {formatSensitivity(row.blendedSecondSensitivity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-gray-600">
              Percentages show the share of condition cells that landed on each outcome. Click any percentage to inspect the matching transcripts.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
