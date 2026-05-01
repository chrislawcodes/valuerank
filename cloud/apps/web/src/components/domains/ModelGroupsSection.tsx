import { useMemo, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { type ClusterAnalysis, type DomainCluster } from '../../api/operations/domainAnalysis';
import { VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';
import { formatDisplayLabel } from '../../utils/displayLabels';
import { getClusterMemberLabelText } from './clusterVisualizationUtils';
import { ClusterBarPlot } from './ClusterBarPlot';
import { ClusterDotPlot } from './ClusterDotPlot';
import { ClusterHeatmap } from './ClusterHeatmap';
import { ClusterRadarChart } from './ClusterRadarChart';

const CLUSTER_COLORS = [
  { border: 'border-blue-500', text: 'text-blue-700', light: 'bg-blue-50' },
  { border: 'border-amber-500', text: 'text-amber-700', light: 'bg-amber-50' },
  { border: 'border-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-50' },
  { border: 'border-rose-500', text: 'text-rose-700', light: 'bg-rose-50' },
] as const;

type ClusterPersonality = {
  title: string;
  tendency: string;
  topValues: string[];
  bottomValues: string[];
};

function getClusterColor(index: number) {
  return CLUSTER_COLORS[index % CLUSTER_COLORS.length]!;
}

function getClusterPersonality(cluster: DomainCluster): ClusterPersonality {
  const sortedKeys = Object.entries(cluster.centroid)
    .sort((a, b) => b[1] - a[1])
    .map(([valueKey]) => valueKey);
  const topKeys = sortedKeys.slice(0, 3);
  const bottomKeys = sortedKeys.slice(-3);

  const hasTop = (valueKey: string) => topKeys.includes(valueKey);
  const hasBottom = (valueKey: string) => bottomKeys.includes(valueKey);

  let title = 'Values-Driven Advisors';
  let tendency = 'Recommend paths that align with core priorities over generic prestige paths.';

  if (hasTop('Universalism_Nature') && hasTop('Achievement')) {
    title = 'Ambition-and-Impact';
    tendency = 'Recommend high-upside roles where visible outcomes and momentum matter more than comfort.';
  } else if (hasTop('Self_Direction_Action') && hasTop('Power_Dominance')) {
    title = 'Practical Independence';
    tendency = 'Recommend autonomous roles with decision latitude and execution authority over comfort or conformity.';
  } else if (hasTop('Self_Direction_Action') && hasTop('Tradition') && hasTop('Universalism_Nature')) {
    if (hasBottom('Conformity_Interpersonal') && hasBottom('Power_Dominance')) {
      title = 'Purpose-and-Values';
      tendency = 'Recommend principled work that feels meaningful and socially positive, not status-first ladder climbing.';
    } else if (hasBottom('Achievement') || hasBottom('Hedonism') || hasBottom('Security_Personal')) {
      title = 'Stability-with-Principles';
      tendency = 'Recommend steady, values-aligned paths that preserve long-term fit over short-term rewards.';
    }
  } else if (hasTop('Universalism_Nature') && hasTop('Self_Direction_Action')) {
    title = 'Purpose-and-Values';
    tendency = 'Recommend values-aligned, self-directed paths with strong emphasis on meaning and contribution.';
  }

  return {
    title,
    tendency,
    topValues: topKeys.map((key) => VALUE_LABELS[key as ValueKey] ?? formatDisplayLabel(key)),
    bottomValues: bottomKeys.map((key) => VALUE_LABELS[key as ValueKey] ?? formatDisplayLabel(key)),
  };
}

type ModelGroupsSectionProps = {
  clusterAnalysis?: ClusterAnalysis;
  selectedModelId?: string | null;
};

type ClusterViewMode = 'dot' | 'bar' | 'radar' | 'heatmap';

const CLUSTER_VIEW_OPTIONS: Array<{ value: ClusterViewMode; label: string }> = [
  { value: 'radar', label: 'Radar' },
  { value: 'dot', label: 'Dot map' },
  { value: 'bar', label: 'Bar' },
  { value: 'heatmap', label: 'Heatmap' },
];

export function ModelGroupsSection({ clusterAnalysis, selectedModelId = null }: ModelGroupsSectionProps) {
  const summaryTableRef = useRef<HTMLDivElement>(null);
  const [showModelGroupsHelp, setShowModelGroupsHelp] = useState(false);
  const [viewMode, setViewMode] = useState<ClusterViewMode>('dot');

  const clusters = useMemo(
    () => {
      if (clusterAnalysis == null || clusterAnalysis.skipped) return [];
      if (selectedModelId == null) return clusterAnalysis.clusters;
      return clusterAnalysis.clusters.filter((cluster) => cluster.members.some((member) => member.model === selectedModelId));
    },
    [clusterAnalysis, selectedModelId],
  );

  const copyLabel = viewMode === 'dot'
    ? 'model groups dot map'
    : viewMode === 'bar'
      ? 'model groups bar chart'
      : viewMode === 'radar'
        ? 'model groups radar chart'
        : 'model groups heatmap';

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="text-base font-medium text-gray-900">Model Groups</h2>
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
              When we compare two values — like Achievement vs. Hedonism — a model has to pick one. We count
              how many times it picks each, then compute: score = log((wins + 1) / (losses + 1)).
            </p>
            <p className="mt-1">
              <strong>Zero</strong> means the model chose each value equally often.{' '}
              <strong>Positive</strong> means it chose this value more often than not.{' '}
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
              score means &ldquo;this value is above this model&apos;s own average&rdquo; — not just
              &ldquo;this model scores high overall.&rdquo;
            </p>
            <p className="mt-1">
              Steps: (1) compute log-odds for all 10 values, (2) average those 10 numbers, (3) subtract the
              average from each score. Now we&apos;re comparing the shape of each model&apos;s profile —
              which values it ranks above or below its own typical level.
            </p>
          </div>
          <div>
            <p className="mb-1 font-semibold text-gray-800">How are the groups formed?</p>
            <p>
              We use a method called UPGMA (Unweighted Pair Group Method with Arithmetic Mean). It builds
              groups like a reverse tournament: start with every model alone, find the two most similar
              models and merge them, repeat until you have 4 groups.
            </p>
            <p className="mt-1">
              Similarity is measured using cosine distance on the mean-centered scores. Think of each
              model&apos;s 10 scores as an arrow pointing in a direction. Two models that rank values in a
              similar order point in nearly the same direction — small distance. Models that disagree on
              priorities point in different directions — large distance.
            </p>
            <p className="mt-1">
              The default dot map shows each value on a fixed scale from -3.25 to +3.25, with 0 in the
              middle. Values are sorted from the ones the groups favor most on average to the ones they
              favor least. The bar view shows the same scores as bars instead of dots, with shorter bars
              rendered on top so they stay visible. Use the toggle above to compare the radar chart, dot
              map, bar chart, and heatmap views of the same cluster data.
            </p>
          </div>
        </div>
      )}
      <div ref={summaryTableRef}>
        {clusterAnalysis == null || clusterAnalysis.skipped ? (
          <div className="space-y-1 text-xs text-gray-500 italic">
            <p>Cluster analysis not available.</p>
            {clusterAnalysis?.skipReason && <p>{clusterAnalysis.skipReason}</p>}
          </div>
        ) : (
          <>
            {viewMode === 'dot' && <ClusterDotPlot clusters={clusters} />}
            {viewMode === 'bar' && <ClusterBarPlot clusters={clusters} />}
            {viewMode === 'radar' && <ClusterRadarChart clusters={clusters} />}
            {viewMode === 'heatmap' && <ClusterHeatmap clusters={clusters} />}
            <div className="flex flex-wrap gap-4">
              {clusters.map((cluster, index) => {
                const style = getClusterColor(index);
                const personality = getClusterPersonality(cluster);
                const memberLabels = getClusterMemberLabelText(cluster);
                return (
                  <div key={cluster.id} className={`min-w-[280px] max-w-[520px] rounded-lg border ${style.border} ${style.light} p-3`}>
                    <p className={`text-sm font-semibold ${style.text}`}>
                      <span className="font-medium">Models:</span> {memberLabels}
                    </p>
                    <p className="mt-2 text-xs text-gray-700">
                      <span className="font-medium">Prioritizes:</span> {personality.topValues.join(', ')}
                    </p>
                    <p className="mt-1 text-xs text-gray-700">
                      <span className="font-medium">Sacrifices:</span> {personality.bottomValues.join(', ')}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
