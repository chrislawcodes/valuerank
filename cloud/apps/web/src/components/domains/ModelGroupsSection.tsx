import { useMemo, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { type ClusterAnalysis, type DomainCluster } from '../../api/operations/domainAnalysis';
import { VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';
import { formatDisplayLabel } from '../../utils/displayLabels';
import { ClusterSmallMultiples } from './ClusterSmallMultiples';

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

export function ModelGroupsSection({ clusterAnalysis, selectedModelId = null }: ModelGroupsSectionProps) {
  const summaryTableRef = useRef<HTMLDivElement>(null);
  const [showModelGroupsHelp, setShowModelGroupsHelp] = useState(false);

  const clusters = useMemo(
    () => {
      if (clusterAnalysis == null || clusterAnalysis.skipped) return [];
      if (selectedModelId == null) return clusterAnalysis.clusters;
      return clusterAnalysis.clusters.filter((cluster) => cluster.members.some((member) => member.model === selectedModelId));
    },
    [clusterAnalysis, selectedModelId],
  );

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
        <CopyVisualButton targetRef={summaryTableRef} label="model group personalities" />
      </div>
      {showModelGroupsHelp && (
        <div className="mb-2 rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-xs text-gray-700">
          Models are grouped by overall similarity in full value profiles. Each card name is a shorthand persona,
          then the lines below show what that group prioritizes and de-prioritizes based on cluster centroid scores.
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
            {clusters.length >= 2 ? <ClusterSmallMultiples clusters={clusters} /> : null}
            <div className="flex flex-wrap gap-4">
              {clusters.map((cluster, index) => {
                const style = getClusterColor(index);
                const personality = getClusterPersonality(cluster);
                return (
                  <div key={cluster.id} className={`min-w-[280px] max-w-[520px] rounded-lg border ${style.border} ${style.light} p-3`}>
                    <p className={`text-sm font-semibold ${style.text}`}>
                      <span className="font-medium">Members:</span> {cluster.members.map((member) => member.label).join(', ')}
                    </p>
                    <p className="mt-2 text-xs text-gray-700">
                      <span className="font-medium">Prioritizes:</span> {personality.topValues.join(', ')}
                    </p>
                    <p className="mt-1 text-xs text-gray-700">
                      <span className="font-medium">De-prioritizes:</span> {personality.bottomValues.join(', ')}
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
