import { useState } from 'react';
import { Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AnalysisResult } from '../../api/operations/analysis';
import type { Run } from '../../api/operations/runs';
import { buildAnalysisDetailPath, type AnalysisBasePath } from '../../utils/analysisRouting';
import { collectDecisionBucketCounts, type DecisionBucket } from '../../utils/decisionBuckets';
import { computeAttributeSensitivity } from '../../utils/decisionSensitivity';
import { getPairedOrientationLabels } from '../../utils/methodology';
import { Button } from '../ui/Button';
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
};

type JobChoicePresentationOrder = 'A_first' | 'B_first';

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

function getRunConfigPresentationOrder(run: Run): JobChoicePresentationOrder | null {
  const raw = run.config?.jobChoicePresentationOrder;
  return raw === 'A_first' || raw === 'B_first' ? raw : null;
}

function getRunConfigBatchGroupId(run: Run): string | null {
  const raw = run.config?.jobChoiceBatchGroupId;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

function getDefinitionPresentationOrder(run: Run): JobChoicePresentationOrder | null {
  const raw = run.definition?.content;
  if (!isRecord(raw) || !isRecord(raw.methodology)) return null;
  const value = raw.methodology.presentation_order;
  return value === 'A_first' || value === 'B_first' ? value : null;
}

function getDefinitionPairKey(run: Run): string | null {
  const raw = run.definition?.content;
  if (!isRecord(raw) || !isRecord(raw.methodology)) return null;
  const value = raw.methodology.pair_key;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getRunPresentationOrder(run: Run): JobChoicePresentationOrder | null {
  return getRunConfigPresentationOrder(run) ?? getDefinitionPresentationOrder(run);
}

function getPriorityCount(
  analysis: AnalysisResult | null,
  modelId: string,
  valueKey: string,
): number | null {
  const perModel = analysis?.preferenceSummary?.perModel;
  if (!isRecord(perModel)) return null;
  const model = perModel[modelId];
  if (!isRecord(model)) return null;
  const direction = model.preferenceDirection;
  if (!isRecord(direction)) return null;
  const byValue = direction.byValue;
  if (!isRecord(byValue)) return null;
  const stats = byValue[valueKey];
  if (!isRecord(stats)) return null;
  const count = stats.count;
  if (!isRecord(count)) return null;
  return typeof count.prioritized === 'number' ? count.prioritized : null;
}

function getNeutralCount(
  analysis: AnalysisResult | null,
  modelId: string,
  valueKey: string,
): number | null {
  const perModel = analysis?.preferenceSummary?.perModel;
  if (!isRecord(perModel)) return null;
  const model = perModel[modelId];
  if (!isRecord(model)) return null;
  const direction = model.preferenceDirection;
  if (!isRecord(direction)) return null;
  const byValue = direction.byValue;
  if (!isRecord(byValue)) return null;
  const stats = byValue[valueKey];
  if (!isRecord(stats)) return null;
  const count = stats.count;
  if (!isRecord(count)) return null;
  return typeof count.neutral === 'number' ? count.neutral : null;
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

  const first = getPriorityCount(analysis, modelId, firstValueKey);
  const second = getPriorityCount(analysis, modelId, secondValueKey);
  const neutral = getNeutralCount(analysis, modelId, firstValueKey);
  const total = first != null && second != null
    ? first + second + (neutral ?? 0)
    : null;

  return { first, neutral, second, total };
}

function buildComparisonRows(
  aFirstRun: Run | null,
  aFirstAnalysis: AnalysisResult | null,
  bFirstRun: Run | null,
  bFirstAnalysis: AnalysisResult | null,
): ComparisonRow[] {
  const labels = getPairedOrientationLabels(
    aFirstRun?.definition?.content ?? bFirstRun?.definition?.content ?? null,
  );
  const firstValueKey = aFirstRun
    ? labels.canonicalValues?.[0] ?? null
    : bFirstRun
      ? labels.flippedValues?.[1] ?? null
      : null;
  const secondValueKey = aFirstRun
    ? labels.canonicalValues?.[1] ?? null
    : bFirstRun
      ? labels.flippedValues?.[0] ?? null
      : null;

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

function formatCount(value: number | null): string {
  return value == null ? '—' : String(value);
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
            <p>Each vignette uses this value at one of five strength levels, from weakest (1) to strongest (5).</p>
            <p>The model then gives a decision score from 1 to 5: 1 means it strongly prefers the other value, 3 means neutral, and 5 means it strongly prefers this value.</p>
            <p>Sensitivity shows how much that decision score changes when this value goes up by one level, while the other value stays the same.</p>
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
  const currentOrder = getRunPresentationOrder(currentRun);
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

  const oppositeOrder = currentOrder === 'A_first' ? 'B_first' : currentOrder === 'B_first' ? 'A_first' : null;
  const sorted = [...candidates].sort((left, right) => {
    const leftMatches = oppositeOrder != null && getRunPresentationOrder(left) === oppositeOrder ? 0 : 1;
    const rightMatches = oppositeOrder != null && getRunPresentationOrder(right) === oppositeOrder ? 0 : 1;
    if (leftMatches !== rightMatches) {
      return leftMatches - rightMatches;
    }
    return Math.abs(new Date(left.createdAt).getTime() - new Date(currentRun.createdAt).getTime())
      - Math.abs(new Date(right.createdAt).getTime() - new Date(currentRun.createdAt).getTime());
  });

  return sorted[0] ?? null;
}

export function PairedRunComparisonCard({
  currentRun,
  currentAnalysis,
  companionRun,
  companionAnalysis,
  analysisBasePath,
  analysisSearch,
}: PairedRunComparisonCardProps) {
  const currentOrder = getRunPresentationOrder(currentRun);
  const companionOrder = companionRun ? getRunPresentationOrder(companionRun) : null;

  const aFirstRun = currentOrder === 'A_first'
    ? currentRun
    : companionOrder === 'A_first'
      ? companionRun
      : null;
  const bFirstRun = currentOrder === 'B_first'
    ? currentRun
    : companionOrder === 'B_first'
      ? companionRun
      : null;
  const aFirstAnalysis = currentOrder === 'A_first'
    ? currentAnalysis
    : companionOrder === 'A_first'
      ? companionAnalysis
      : null;
  const bFirstAnalysis = currentOrder === 'B_first'
    ? currentAnalysis
    : companionOrder === 'B_first'
      ? companionAnalysis
      : null;

  const labels = getPairedOrientationLabels(
    aFirstRun?.definition?.content ?? bFirstRun?.definition?.content ?? null,
  );
  const firstValueLabel = labels.canonicalValues?.[0] ?? 'First value';
  const secondValueLabel = labels.canonicalValues?.[1] ?? 'Second value';
  const aFirstGroupLabel = aFirstRun?.definition.name ?? labels.canonical ?? 'First order';
  const bFirstGroupLabel = bFirstRun?.definition.name ?? labels.flipped ?? 'Second order';
  const comparisonRows = buildComparisonRows(aFirstRun, aFirstAnalysis, bFirstRun, bFirstAnalysis);
  const canonicalOrientationBucket = 'canonical';
  const flippedOrientationBucket = 'flipped';
  const [showOrderDetail, setShowOrderDetail] = useState(false);

  return (
    <section className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 space-y-4" data-testid="paired-run-comparison">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-teal-900">Paired Run Comparison</h2>
        <p className="text-sm text-teal-900/80">
          Paired mode now shows both value orders side by side so we can compare them directly before trusting the blended story.
        </p>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-teal-900/80">
              Start with the blended summary, then turn on order detail if you want to inspect each vignette order separately.
            </p>
            <div className="inline-flex rounded-lg border border-teal-200 bg-white p-1">
              <Button
                type="button"
                variant={showOrderDetail ? 'ghost' : 'secondary'}
                size="sm"
                className={showOrderDetail
                  ? 'rounded-md border-0'
                  : 'rounded-md border-0 bg-teal-600 text-white hover:bg-teal-700 focus:ring-teal-500'}
                aria-pressed={!showOrderDetail}
                onClick={() => setShowOrderDetail(false)}
              >
                Blended
              </Button>
              <Button
                type="button"
                variant={showOrderDetail ? 'secondary' : 'ghost'}
                size="sm"
                className={showOrderDetail
                  ? 'rounded-md border-0 bg-teal-600 text-white hover:bg-teal-700 focus:ring-teal-500'
                  : 'rounded-md border-0'}
                aria-pressed={showOrderDetail}
                onClick={() => setShowOrderDetail(true)}
              >
                Order Detail
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    className="border border-teal-200 bg-white px-3 py-2 text-left text-xs font-semibold uppercase text-teal-700"
                  >
                    Model
                  </th>
                  <th
                    colSpan={5}
                    className="border border-teal-200 bg-white px-3 py-2 text-center text-xs font-semibold text-teal-700"
                  >
                    Blended
                  </th>
                  {showOrderDetail ? (
                    <>
                      <th
                        colSpan={3}
                        className="border border-teal-200 bg-white px-3 py-2 text-center text-xs font-semibold text-teal-700"
                      >
                        {aFirstGroupLabel}
                      </th>
                      <th
                        colSpan={3}
                        className="border border-teal-200 bg-white px-3 py-2 text-center text-xs font-semibold text-teal-700"
                      >
                        {bFirstGroupLabel}
                      </th>
                    </>
                  ) : null}
                </tr>
                <tr>
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
                  {showOrderDetail ? (
                    <>
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
                        {firstValueLabel}
                      </th>
                      <th className="border border-teal-200 bg-white px-3 py-2 text-center text-xs font-semibold text-teal-700">
                        Neutral
                      </th>
                      <th className="border border-teal-200 bg-white px-3 py-2 text-center text-xs font-semibold text-teal-700">
                        {secondValueLabel}
                      </th>
                    </>
                  ) : null}
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
                    {showOrderDetail ? (
                      <>
                        <td className="border border-teal-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                          {aFirstRun ? (
                            <Link
                              className="font-medium text-teal-700 hover:text-teal-900"
                              to={buildTranscriptHref(
                                analysisBasePath,
                                aFirstRun,
                                row.modelId,
                                firstValueLabel,
                                analysisSearch,
                                { orientationBucket: canonicalOrientationBucket },
                              ) ?? '#'}
                            >
                              {formatCount(row.aFirst.first)}
                            </Link>
                          ) : (
                            formatCount(row.aFirst.first)
                          )}
                        </td>
                        <td className="border border-teal-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                          {aFirstRun ? (
                            <Link
                              className="font-medium text-teal-700 hover:text-teal-900"
                              to={buildTranscriptHref(
                                analysisBasePath,
                                aFirstRun,
                                row.modelId,
                                'Neutral',
                                analysisSearch,
                                { orientationBucket: canonicalOrientationBucket },
                                'neutral',
                              ) ?? '#'}
                            >
                              {formatCount(row.aFirst.neutral)}
                            </Link>
                          ) : (
                            formatCount(row.aFirst.neutral)
                          )}
                        </td>
                        <td className="border border-teal-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                          {aFirstRun ? (
                            <Link
                              className="font-medium text-teal-700 hover:text-teal-900"
                              to={buildTranscriptHref(
                                analysisBasePath,
                                aFirstRun,
                                row.modelId,
                                secondValueLabel,
                                analysisSearch,
                                { orientationBucket: canonicalOrientationBucket },
                              ) ?? '#'}
                            >
                              {formatCount(row.aFirst.second)}
                            </Link>
                          ) : (
                            formatCount(row.aFirst.second)
                          )}
                        </td>
                        <td className="border border-teal-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                          {bFirstRun ? (
                            <Link
                              className="font-medium text-teal-700 hover:text-teal-900"
                              to={buildTranscriptHref(
                                analysisBasePath,
                                bFirstRun,
                                row.modelId,
                                firstValueLabel,
                                analysisSearch,
                                { orientationBucket: flippedOrientationBucket },
                              ) ?? '#'}
                            >
                              {formatCount(row.bFirst.first)}
                            </Link>
                          ) : (
                            formatCount(row.bFirst.first)
                          )}
                        </td>
                        <td className="border border-teal-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                          {bFirstRun ? (
                            <Link
                              className="font-medium text-teal-700 hover:text-teal-900"
                              to={buildTranscriptHref(
                                analysisBasePath,
                                bFirstRun,
                                row.modelId,
                                'Neutral',
                                analysisSearch,
                                { orientationBucket: flippedOrientationBucket },
                                'neutral',
                              ) ?? '#'}
                            >
                              {formatCount(row.bFirst.neutral)}
                            </Link>
                          ) : (
                            formatCount(row.bFirst.neutral)
                          )}
                        </td>
                        <td className="border border-teal-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                          {bFirstRun ? (
                            <Link
                              className="font-medium text-teal-700 hover:text-teal-900"
                              to={buildTranscriptHref(
                                analysisBasePath,
                                bFirstRun,
                                row.modelId,
                                secondValueLabel,
                                analysisSearch,
                                { orientationBucket: flippedOrientationBucket },
                              ) ?? '#'}
                            >
                              {formatCount(row.bFirst.second)}
                            </Link>
                          ) : (
                            formatCount(row.bFirst.second)
                          )}
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-gray-600">
              Percentages show the share of condition cells that landed on each outcome. Click any value or neutral cell to inspect the matching transcripts.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
