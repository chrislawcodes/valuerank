import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { type DomainCluster } from '../../api/operations/domainAnalysis';
import { VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';

type ClusterRadarChartProps = {
  clusters: DomainCluster[];
};

type ClusterRadarDatum = {
  subject: string;
  [key: string]: string | number;
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

const RADAR_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#f43f5e'];

export function ClusterRadarChart({ clusters }: ClusterRadarChartProps) {
  const data: ClusterRadarDatum[] = COLUMN_VALUES.map((valueKey) => ({
    subject: VALUE_LABELS[valueKey],
    ...Object.fromEntries(
      clusters.map((cluster, index) => [`cluster${index}`, cluster.centroid[valueKey] ?? 0] as const),
    ),
  }));

  return (
    <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={data}>
            <PolarGrid />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend
              formatter={(value) => {
                const key = String(value);
                const clusterIndex = Number.parseInt(key.replace('cluster', ''), 10);
                return clusters[clusterIndex]?.members.map((member) => member.label).join(', ') ?? key;
              }}
            />
            {clusters.map((cluster, index) => {
              const color = RADAR_COLORS[index % RADAR_COLORS.length];
              return (
                <Radar
                  key={cluster.id}
                  dataKey={`cluster${index}`}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.2}
                />
              );
            })}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
