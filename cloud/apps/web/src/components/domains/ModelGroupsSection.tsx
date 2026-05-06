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
type ClusterDataSource = 'log-odds' | 'win-rate';

const LINKAGE_OPTIONS: Array<{ value: ClusteringLinkage; label: string }> = [
  { value: 'upgma', label: 'UPGMA' },
  { value: 'ward', label: 'Ward' },
];

const DATA_SOURCE_OPTIONS: Array<{ value: ClusterDataSource; label: string }> = [
  { value: 'log-odds', label: 'Log Odds' },
  { value: 'win-rate', label: 'Win Rate' },
];

type ModelGroupsSectionProps = {
  clusterAnalysisByMethod?: Record<string, ClusterAnalysis>;
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
  distanceMethod,
  models,
  selectedModelId = null,
  clusteringMethod = 'upgma',
  onClusteringMethodChange,
}: ModelGroupsSectionProps) {
  const summaryTableRef = useRef<HTMLDivElement>(null);
  const [showModelGroupsHelp, setShowModelGroupsHelp] = useState(false);
  const [viewMode, setViewMode] = useState<ClusterViewMode>('dot');
  const [groupDisplayMode, setGroupDisplayMode] = useState<GroupDisplayMode>('groups');
  const [activeGroupIds, setActiveGroupIds] = useState<string[]>([]);
  const [dataSource, setDataSource] = useState<ClusterDataSource>('log-odds');

  const backendKey = `${dataSource}-${toBackendDistanceMethod(distanceMethod)}-${clusteringMethod}`;
  const activeClusterAnalysis = clusterAnalysisByMethod?.[backendKey] ?? null;

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

  const copyLabel = `${groupDisplayMode} model groups ${
    viewMode === 'dot' ? 'dot map' : viewMode === 'bar' ? 'bar chart' : 'radar chart'
  }`;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
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
                <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
                  <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Linkage</span>
                  <div className="inline-flex rounded-md border border-gray-200 bg-white p-1">
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
                </div>
              )}

              <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
                <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Data</span>
                <div className="inline-flex rounded-md border border-gray-200 bg-white p-1">
                  {DATA_SOURCE_OPTIONS.map((option) => {
                    const active = dataSource === option.value;
                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant={active ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={() => setDataSource(option.value)}
                        className={`rounded-md px-3 py-1 text-xs font-medium min-h-0 ${
                          active ? 'bg-teal-600 text-white hover:bg-teal-700' : 'text-gray-600 hover:bg-white hover:text-gray-900'
                        }`}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

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
              <strong> Data</strong> controls what scores drive the distance: Log Odds uses the smoothed
              log-odds ranking scores; Win Rate uses domain-local win rates.
              The distance method comes from the Similarity Table selector below.
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
            {viewMode === 'dot' && <ClusterDotPlot clusters={clusters} activeGroupIds={activeGroupIds} dataSource={groupDisplayMode === 'groups' ? dataSource : 'log-odds'} />}
            {viewMode === 'bar' && <ClusterBarPlot clusters={clusters} activeGroupIds={activeGroupIds} dataSource={groupDisplayMode === 'groups' ? dataSource : 'log-odds'} />}
            {viewMode === 'radar' && <ClusterRadarChart clusters={clusters} activeGroupIds={activeGroupIds} dataSource={groupDisplayMode === 'groups' ? dataSource : 'log-odds'} />}

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
