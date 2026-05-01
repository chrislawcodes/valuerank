import { useMemo } from 'react';
import { type DomainCluster } from '../../api/operations/domainAnalysis';
import { VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';

type ClusterSmallMultiplesProps = {
  clusters: DomainCluster[];
};

const COLUMN_VALUES: ValueKey[] = [
  'Universalism_Nature',
  'Benevolence_Dependability',
  'Conformity_Interpersonal',
  'Tradition',
  'Security_Personal',
  'Power_Dominance',
  'Achievement',
  'Hedonism',
  'Stimulation',
  'Self_Direction_Action',
];

const PANEL_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#f43f5e'];

export function ClusterSmallMultiples({ clusters }: ClusterSmallMultiplesProps) {
  const { globalMin, range } = useMemo(() => {
    const allScores = clusters.flatMap((cluster) => COLUMN_VALUES.map((valueKey) => cluster.centroid[valueKey] ?? 0));

    if (allScores.length === 0) {
      return { globalMin: 0, range: 1 };
    }

    const globalMin = Math.min(...allScores);
    const globalMax = Math.max(...allScores);
    return { globalMin, range: globalMax - globalMin || 1 };
  }, [clusters]);

  return (
    <div className="grid grid-cols-1 gap-4 mb-4 sm:grid-cols-2 lg:grid-cols-3">
      {clusters.map((cluster, index) => {
        const color = PANEL_COLORS[index % PANEL_COLORS.length];
        const rows = COLUMN_VALUES.map((valueKey) => ({
          label: VALUE_LABELS[valueKey],
          score: cluster.centroid[valueKey] ?? 0,
        })).sort((a, b) => b.score - a.score);

        return (
          <div key={cluster.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-500 mb-2">
              {cluster.members.map((member) => member.label).join(', ')}
            </p>
            <div className="space-y-2">
              {rows.map((row) => {
                const barPct = ((row.score - globalMin) / range) * 100;

                return (
                  <div key={row.label} className="flex items-center gap-2">
                    <span className="text-xs text-gray-700 w-32 shrink-0">{row.label}</span>
                    <div className="h-2 flex-1 rounded-full bg-gray-200">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${barPct}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
