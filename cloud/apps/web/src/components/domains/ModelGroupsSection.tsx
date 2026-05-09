import { useEffect, useMemo, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { type ClusterAnalysis, type DomainCluster } from '../../api/operations/domainAnalysis';
import { type ModelEntry } from '../../data/domainAnalysisData';
import { type CalculationMethod } from '../models/ModelSimilarityMetrics';
import { ClusterBarPlot } from './ClusterBarPlot';
import { ClusterDotPlot } from './ClusterDotPlot';
import { ClusterRadarChart } from './ClusterRadarChart';
import { buildIndividualClusters, getClusterMemberLabelText } from './clusterVisualizationUtils';
import { ClusterDendrogram, type DendrogramMerge } from './ClusterDendrogram';

const LEGEND_COLORS = [
  { border: 'border-blue-500', text: 'text-blue-700', light: 'bg-blue-50', color: '#2563eb' },
  { border: 'border-amber-500', text: 'text-amber-700', light: 'bg-amber-50', color: '#d97706' },
  { border: 'border-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-50', color: '#059669' },
  { border: 'border-rose-500', text: 'text-rose-700', light: 'bg-rose-50', color: '#e11d48' },
  { border: 'border-violet-500', text: 'text-violet-700', light: 'bg-violet-50', color: '#7c3aed' },
  { border: 'border-sky-500', text: 'text-sky-700', light: 'bg-sky-50', color: '#0ea5e9' },
  { border: 'border-orange-500', text: 'text-orange-700', light: 'bg-orange-50', color: '#ea580c' },
  { border: 'border-lime-500', text: 'text-lime-700', light: 'bg-lime-50', color: '#65a30d' },
  { border: 'border-fuchsia-500', text: 'text-fuchsia-700', light: 'bg-fuchsia-50', color: '#d946ef' },
  { border: 'border-indigo-500', text: 'text-indigo-700', light: 'bg-indigo-50', color: '#4f46e5' },
  { border: 'border-teal-500', text: 'text-teal-700', light: 'bg-teal-50', color: '#14b8a6' },
  { border: 'border-yellow-500', text: 'text-yellow-700', light: 'bg-yellow-50', color: '#ca8a04' },
] as const;

type ClusteringLinkage = 'upgma' | 'ward';
type ClusterDataSource = 'log-odds' | 'win-rate' | 'kappa-agreement';

const LINKAGE_OPTIONS: Array<{ value: ClusteringLinkage; label: string }> = [
  { value: 'upgma', label: 'UPGMA' },
  { value: 'ward', label: 'Ward' },
];

type ModelGroupsSectionProps = {
  clusterAnalysisByMethod?: Record<string, ClusterAnalysis>;
  /**
   * When dataSource === 'kappa-agreement', this prop supplies the cluster
   * analysis derived from pairwise Cohen's kappa instead of the precomputed
   * `clusterAnalysisByMethod` map (which only covers score-based variants).
   */
  kappaClusterAnalysis?: ClusterAnalysis | null;
  /** Dendrogram merges from the kappa cluster payload (kappa mode only). */
  kappaDendrogram?: DendrogramMerge[] | null;
  /** Leaf order for the kappa dendrogram/heatmap. */
  kappaLeafOrder?: string[] | null;
  /** Flat per-model cluster ID map (kappa mode only). */
  kappaClusterIdByModelId?: Record<string, string> | null;
  kappaClusterLoading?: boolean;
  kappaClusterError?: string | null;
  dataSource?: ClusterDataSource;
  distanceMethod?: CalculationMethod;
  models: ModelEntry[];
  selectedModelId?: string | null;
  clusteringMethod?: ClusteringLinkage;
  onClusteringMethodChange?: (method: ClusteringLinkage) => void;
};

type ClusterViewMode = 'dot' | 'bar' | 'radar';
type GroupDisplayMode = 'groups' | 'individual';

const CLUSTER_VIEW_OPTIONS: Array<{ value: ClusterViewMode; label: string }> = [
  { value: 'radar', label: 'Radar' },
  { value: 'dot', label: 'Dot map' },
  { value: 'bar', label: 'Bar' },
];

const GROUP_DISPLAY_OPTIONS: Array<{ value: GroupDisplayMode; label: string }> = [
  { value: 'groups', label: 'Groups' },
  { value: 'individual', label: 'Individual' },
];

// The similarity table uses 'weighted-euclidean'; backend distance key uses 'euclidean'
function toBackendDistanceMethod(method: CalculationMethod | undefined): string {
  if (method == null || method === 'weighted-euclidean') return 'euclidean';
  return method;
}

function getLegendColor(index: number) {
  return LEGEND_COLORS[index % LEGEND_COLORS.length]!;
}

function getGroupLabel(cluster: DomainCluster): string {
  return getClusterMemberLabelText(cluster);
}

export function ModelGroupsSection({
  clusterAnalysisByMethod,
  kappaClusterAnalysis = null,
  kappaDendrogram = null,
  kappaLeafOrder = null,
  kappaClusterIdByModelId = null,
  kappaClusterLoading = false,
  kappaClusterError = null,
  dataSource = 'log-odds',
  distanceMethod,
  models,
  selectedModelId = null,
  clusteringMethod = 'ward',
  onClusteringMethodChange,
}: ModelGroupsSectionProps) {
  const summaryTableRef = useRef<HTMLDivElement>(null);
  const [showModelGroupsHelp, setShowModelGroupsHelp] = useState(false);
  const [viewMode, setViewMode] = useState<ClusterViewMode>('dot');
  const [groupDisplayMode, setGroupDisplayMode] = useState<GroupDisplayMode>('groups');
  const [activeGroupIds, setActiveGroupIds] = useState<string[]>([]);

  const backendKey = `${dataSource}-${toBackendDistanceMethod(distanceMethod)}-${clusteringMethod}`;
  const activeClusterAnalysis = dataSource === 'kappa-agreement'
    ? kappaClusterAnalysis
    : (clusterAnalysisByMethod?.[backendKey] ?? null);

  const hasGroupedClusters = activeClusterAnalysis != null && !activeClusterAnalysis.skipped;
  const groupedClusters = useMemo(() => activeClusterAnalysis?.clusters ?? [], [activeClusterAnalysis]);
  const individualClusters = useMemo(() => buildIndividualClusters(models), [models]);

  const sourceClusters = useMemo(
    () => (groupDisplayMode === 'individual' ? individualClusters : groupedClusters),
    [groupDisplayMode, groupedClusters, individualClusters],
  );

  const clusters = useMemo(
    () => {
      if (selectedModelId == null) return sourceClusters;
      return sourceClusters.filter((cluster) => cluster.members.some((member) => member.model === selectedModelId));
    },
    [selectedModelId, sourceClusters],
  );

  useEffect(() => {
    setActiveGroupIds((current) => {
      const next = current.filter((id) => clusters.some((cluster) => cluster.id === id));
      if (next.length === current.length && next.every((id, index) => id === current[index])) {
        return current;
      }
      return next;
    });
  }, [clusters]);

  const toggleGroupSelection = (clusterId: string) => {
    setActiveGroupIds((current) => {
      if (groupDisplayMode === 'individual') {
        return current.includes(clusterId)
          ? current.filter((id) => id !== clusterId)
          : [...current, clusterId];
      }

      return current.length === 1 && current[0] === clusterId ? [] : [clusterId];
    });
  };

  const modelLabels = useMemo<Record<string, string>>(() => {
    const result: Record<string, string> = {};
    for (const model of models) {
      result[model.model] = model.label;
    }
    return result;
  }, [models]);

  const copyLabel = `${groupDisplayMode} model groups ${
    viewMode === 'dot' ? 'dot map' : viewMode === 'bar' ? 'bar chart' : 'radar chart'
  }`;

  const showKappaLoader = dataSource === 'kappa-agreement' && kappaClusterAnalysis == null && kappaClusterLoading && kappaClusterError == null;
  const showKappaError = dataSource === 'kappa-agreement' && kappaClusterError != null;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      {dataSource === 'kappa-agreement' ? (
        <p className="mb-3 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900">
          Models are grouped by behavioral agreement (Cohen&apos;s kappa on shared scenarios). Per-cluster centroids and
          fault lines are still labeled with each group&apos;s average log-odds value scores.
        </p>
      ) : null}
      {showKappaError ? (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          Could not load kappa-based clustering: {kappaClusterError}
        </p>
      ) : null}
      {showKappaLoader ? (
        <p className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          Loading kappa-based clustering…
        </p>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="text-base font-medium text-gray-900">Model Clusters</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowModelGroupsHelp((v) => !v)}
            className="h-8 w-8 text-gray-500 hover:text-gray-700"
            aria-label={showModelGroupsHelp ? 'Hide model groups explanation' : 'Show model groups explanation'}
          >
            {showModelGroupsHelp ? <X className="h-8 w-8" /> : <HelpCircle className="h-8 w-8" />}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
            {GROUP_DISPLAY_OPTIONS.map((option) => {
              const active = groupDisplayMode === option.value;
              return (
                <Button
                  key={option.value}
                  type="button"
                  variant={active ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setGroupDisplayMode(option.value)}
                  className={`rounded-md px-3 py-1 text-xs font-medium min-h-0 ${
                    active ? 'bg-teal-600 text-white hover:bg-teal-700' : 'text-gray-600 hover:bg-white hover:text-gray-900'
                  }`}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>

          {groupDisplayMode === 'groups' && (
            <>
              {onClusteringMethodChange != null && (
                <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                  {LINKAGE_OPTIONS.map((option) => {
                    const active = clusteringMethod === option.value;
                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant={active ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={() => onClusteringMethodChange(option.value)}
                        className={`rounded-md px-3 py-1 text-xs font-medium min-h-0 ${
                          active ? 'bg-teal-600 text-white hover:bg-teal-700' : 'text-gray-600 hover:bg-white hover:text-gray-900'
                        }`}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {dataSource !== 'kappa-agreement' && (
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              {CLUSTER_VIEW_OPTIONS.map((option) => {
                const active = viewMode === option.value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={active ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode(option.value)}
                    className={`rounded-md px-3 py-1 text-xs font-medium min-h-0 ${
                      active ? 'bg-teal-600 text-white hover:bg-teal-700' : 'text-gray-600 hover:bg-white hover:text-gray-900'
                    }`}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          )}

          <CopyVisualButton targetRef={summaryTableRef} label={copyLabel} />
        </div>
      </div>

      {showModelGroupsHelp && (
        <div className="mb-4 space-y-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-gray-700">
          <div>
            <p className="mb-1 font-semibold text-gray-800">What is a log-odds score?</p>
            <p>
              When we compare two values - like Achievement vs. Hedonism - a model has to pick one. We count
              how many times it picks each, then compute: score = log((wins + 1) / (losses + 1)).
            </p>
            <p className="mt-1">
              <strong>Zero</strong> means the model chose each value equally often. {' '}
              <strong>Positive</strong> means it chose this value more often than not. {' '}
              <strong>Negative</strong> means it avoided this value.
            </p>
            <p className="mt-1">
              Why not just use a percentage? Percentages distort differences at the extremes. A model that
              wins 95% of the time is far stronger than one that wins 90%, but the gap looks small (5 points).
              Log-odds shows this difference properly. The +1 in the formula also prevents extreme results
              when a value was only tested a few times.
            </p>
          </div>
          <div>
            <p className="mb-1 font-semibold text-gray-800">Why do we adjust each model&apos;s scores?</p>
            <p>
              Before grouping, we subtract each model&apos;s own average score from all 10 of its scores.
              This is called mean-centering.
            </p>
            <p className="mt-1">
              Some models have higher scores across many values simply because they have strong preferences
              in general. We don&apos;t want that to drive the grouping. After mean-centering, a positive
              score means &ldquo;this value is above this model&apos;s own average&rdquo; - not just
              &ldquo;this model scores high overall.&rdquo;
            </p>
            <p className="mt-1">
              Steps: (1) compute log-odds for all 10 values, (2) average those 10 numbers, (3) subtract the
              average from each score. Now we&apos;re comparing the shape of each model&apos;s profile -
              which values it ranks above or below its own typical level.
            </p>
          </div>
          <div>
            <p className="mb-1 font-semibold text-gray-800">How are the groups formed?</p>
            <p>
              We use hierarchical clustering. Start with every model alone, find the two most similar
              models and merge them, repeat until we have up to 4 groups.
            </p>
            <p className="mt-1">
              <strong>Linkage</strong> controls how cluster distance is measured: UPGMA averages distances
              across all member pairs; Ward minimizes within-cluster variance.
            </p>
            <p className="mt-1">
              The <strong>data source</strong> and <strong>similarity method</strong> are set in the
              Analysis settings bar above and affect both model reports.
            </p>
          </div>
        </div>
      )}

      <div ref={summaryTableRef}>
        {groupDisplayMode === 'groups' && !hasGroupedClusters ? (
          <div className="space-y-1 text-xs text-gray-500 italic">
            <p>Cluster analysis not available.</p>
            {activeClusterAnalysis?.skipReason != null && <p>{activeClusterAnalysis.skipReason}</p>}
          </div>
        ) : groupDisplayMode === 'individual' && models.length === 0 ? (
          <div className="space-y-1 text-xs text-gray-500 italic">
            <p>No model data available.</p>
          </div>
        ) : (
          <>
            {dataSource === 'kappa-agreement' && groupDisplayMode === 'groups' ? (
              // In kappa mode, show the dendrogram
              <div className="space-y-6">
                {kappaDendrogram != null && kappaLeafOrder != null ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-gray-700">Merge tree (dendrogram)</p>
                    <ClusterDendrogram
                      merges={kappaDendrogram}
                      leafOrder={kappaLeafOrder}
                      modelLabels={modelLabels}
                      clusterIdByModelId={kappaClusterIdByModelId ?? {}}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              // Score modes: show the existing value-profile chart
              (() => {
                // Plot dataSource only controls how centroids are scaled. Under
                // 'kappa-agreement' the grouping is by kappa but centroids are
                // still log-odds, so the plots use 'log-odds' for scaling.
                const plotDataSource: 'log-odds' | 'win-rate' =
                  dataSource === 'win-rate' && groupDisplayMode === 'groups' ? 'win-rate' : 'log-odds';
                return (
                  <>
                    {viewMode === 'dot' && <ClusterDotPlot clusters={clusters} activeGroupIds={activeGroupIds} dataSource={plotDataSource} />}
                    {viewMode === 'bar' && <ClusterBarPlot clusters={clusters} activeGroupIds={activeGroupIds} dataSource={plotDataSource} />}
                    {viewMode === 'radar' && <ClusterRadarChart clusters={clusters} activeGroupIds={activeGroupIds} dataSource={plotDataSource} />}
                  </>
                );
              })()
            )}

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {clusters.map((cluster, index) => {
                const style = getLegendColor(index);
                const memberLabels = getGroupLabel(cluster);
                const isActive = activeGroupIds.includes(cluster.id);

                return (
                  <Button
                    key={cluster.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleGroupSelection(cluster.id)}
                    aria-pressed={isActive}
                    title={memberLabels}
                    className={`rounded-lg border p-3 text-left transition ${
                      isActive
                        ? `${style.border} ${style.light} ring-2 ring-teal-400 shadow-[0_0_0_1px_rgba(13,148,136,0.25),0_0_16px_rgba(45,212,191,0.35)]`
                        : 'border-gray-200 bg-white hover:border-teal-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1 h-3 w-3 shrink-0 rounded-full transition ${
                          isActive ? 'scale-125' : ''
                        }`}
                        style={{
                          backgroundColor: style.color,
                          boxShadow: isActive ? '0 0 0 1px rgba(255,255,255,0.85), 0 0 12px rgba(45,212,191,0.55)' : undefined,
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold leading-snug ${style.text} whitespace-normal break-words`}>
                          {memberLabels}
                        </p>
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
