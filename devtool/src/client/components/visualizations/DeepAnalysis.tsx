import { useState } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart as RechartsBarChart,
  Bar,
  Cell,
} from 'recharts';
import type { DeepAnalysisResult, DeepAnalysisInsight } from '../../lib/api';
import { MODEL_COLORS } from './constants';
import {
  AlertTriangle,
  CheckCircle,
  Info,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Users,
  GitBranch,
  Target,
  Sparkles,
} from 'lucide-react';

interface DeepAnalysisProps {
  data: DeepAnalysisResult;
}

// Insight severity icon mapping
function InsightIcon({ severity }: { severity: string }) {
  switch (severity) {
    case 'alert':
      return <AlertTriangle size={16} className="text-red-500" />;
    case 'warning':
      return <AlertCircle size={16} className="text-amber-500" />;
    case 'success':
      return <CheckCircle size={16} className="text-green-500" />;
    default:
      return <Info size={16} className="text-blue-500" />;
  }
}

// Collapsible section component
function Section({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon}
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
      </button>
      {isOpen && <div className="p-6">{children}</div>}
    </div>
  );
}

// Insights Panel
function InsightsPanel({ insights }: { insights: DeepAnalysisInsight[] }) {
  if (!insights || insights.length === 0) return null;

  const severityOrder = { alert: 0, warning: 1, info: 2, success: 3 };
  const sortedInsights = [...insights].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  return (
    <div className="space-y-3">
      {sortedInsights.map((insight, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 p-4 rounded-lg border ${
            insight.severity === 'alert'
              ? 'bg-red-50 border-red-200'
              : insight.severity === 'warning'
              ? 'bg-amber-50 border-amber-200'
              : insight.severity === 'success'
              ? 'bg-green-50 border-green-200'
              : 'bg-blue-50 border-blue-200'
          }`}
        >
          <InsightIcon severity={insight.severity} />
          <div>
            <h4 className="font-medium text-gray-900">{insight.title}</h4>
            <p className="text-sm text-gray-600 mt-1">{insight.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// PCA Visualization
function PCAVisualization({ data }: { data: DeepAnalysisResult }) {
  const pcaData = data.pca;

  if (!pcaData || pcaData.error || !pcaData.model_coordinates) {
    return (
      <p className="text-gray-500 text-center py-8">
        Insufficient data for PCA visualization
      </p>
    );
  }

  const scatterData = Object.entries(pcaData.model_coordinates).map(
    ([model, coords], i) => ({
      model,
      x: coords.x,
      y: coords.y,
      color: MODEL_COLORS[i % MODEL_COLORS.length],
    })
  );

  const varianceExplained = pcaData.explained_variance_ratio || [];

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Models plotted in reduced dimensionality space. Models far from the cluster are outliers.
        {varianceExplained.length > 0 && (
          <span className="ml-2">
            (PC1: {(varianceExplained[0] * 100).toFixed(1)}% variance
            {varianceExplained[1] && `, PC2: ${(varianceExplained[1] * 100).toFixed(1)}%`})
          </span>
        )}
      </p>

      <div style={{ height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name="PC1"
              label={{ value: 'PC1', position: 'bottom', offset: 0 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="PC2"
              label={{ value: 'PC2', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                    <p className="font-medium">{p.model}</p>
                    <p className="text-sm text-gray-500">
                      PC1: {p.x.toFixed(3)}, PC2: {p.y.toFixed(3)}
                    </p>
                  </div>
                );
              }}
            />
            <Scatter name="Models" data={scatterData}>
              {scatterData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Model labels */}
      <div className="flex flex-wrap gap-2 mt-4 justify-center">
        {scatterData.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="truncate max-w-[150px]" title={item.model}>
              {item.model.length > 20 ? item.model.slice(0, 18) + '...' : item.model}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Dimension Variance Chart
function DimensionVarianceChart({ data }: { data: DeepAnalysisResult }) {
  const dimAnalysis = data.dimension_analysis;

  if (!dimAnalysis || !dimAnalysis.ranked_by_variance) {
    return <p className="text-gray-500">No dimension analysis available</p>;
  }

  const chartData = dimAnalysis.ranked_by_variance.slice(0, 10).map((d) => ({
    dimension: d.dimension,
    variance: d.variance,
    drivesDiv: dimAnalysis.per_dimension[d.dimension]?.drives_divergence || false,
  }));

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Dimensions ranked by how much they cause models to diverge. Higher variance = more disagreement.
      </p>

      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart data={chartData} layout="vertical" margin={{ left: 100, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis
              type="category"
              dataKey="dimension"
              width={90}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                    <p className="font-medium">{p.dimension}</p>
                    <p className="text-sm">Variance: {p.variance.toFixed(4)}</p>
                    <p className="text-sm text-gray-500">
                      {p.drivesDiv ? 'Drives significant divergence' : 'Low impact'}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="variance" name="Model Variance">
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.drivesDiv ? '#f59e0b' : '#94a3b8'}
                />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-6 mt-4 justify-center text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-amber-500" />
          <span>Drives divergence</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-slate-400" />
          <span>Low impact</span>
        </div>
      </div>
    </div>
  );
}

// Outlier Detection Results
function OutlierDetection({ data }: { data: DeepAnalysisResult }) {
  const outlierData = data.outlier_detection;

  if (!outlierData || outlierData.error) {
    return (
      <p className="text-gray-500 text-center py-4">
        {outlierData?.error || 'Insufficient data for outlier detection'}
      </p>
    );
  }

  const ranking = outlierData.outlier_ranking || [];

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Models ranked by anomaly indicators. Higher score = more outlier-like behavior.
      </p>

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3">Model</th>
              <th className="text-center py-2 px-3">Outlier Score</th>
              <th className="text-center py-2 px-3">Mahalanobis</th>
              <th className="text-center py-2 px-3">Isolation Forest</th>
              <th className="text-center py-2 px-3">Jackknife</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((item, i) => (
              <tr
                key={i}
                className={`border-b border-gray-100 ${
                  item.outlier_indicators >= 2 ? 'bg-red-50' : ''
                }`}
              >
                <td className="py-2 px-3 font-medium truncate max-w-[200px]" title={item.model}>
                  {item.model}
                </td>
                <td className="text-center py-2 px-3">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold ${
                      item.outlier_indicators >= 2
                        ? 'bg-red-500'
                        : item.outlier_indicators === 1
                        ? 'bg-amber-500'
                        : 'bg-gray-300'
                    }`}
                  >
                    {item.outlier_indicators}
                  </span>
                </td>
                <td className="text-center py-2 px-3 font-mono text-xs">
                  {item.mahalanobis_distance?.toFixed(2) || '-'}
                </td>
                <td className="text-center py-2 px-3">
                  {item.isolation_forest ? (
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs ${
                        item.isolation_forest.is_outlier
                          ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {item.isolation_forest.is_outlier ? 'Outlier' : 'Normal'}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="text-center py-2 px-3">
                  {item.jackknife ? (
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs ${
                        item.jackknife.increases_variance
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {item.jackknife.increases_variance ? 'High Influence' : 'Normal'}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Outlier score = sum of flags from Mahalanobis distance, Isolation Forest, and Jackknife analysis.
        Score of 2+ indicates likely outlier.
      </p>
    </div>
  );
}

// Inter-Model Agreement
function InterModelAgreement({ data }: { data: DeepAnalysisResult }) {
  const agreement = data.inter_model_agreement;

  if (!agreement) {
    return <p className="text-gray-500">No agreement data available</p>;
  }

  const avgAgreement = agreement.average_agreement || 0;
  const contested = agreement.most_contested_scenarios || [];

  // Prepare pairwise data for heatmap
  const pairwise = agreement.pairwise_agreement || {};

  return (
    <div className="space-y-6">
      {/* Overall agreement gauge */}
      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className="text-4xl font-bold" style={{
            color: avgAgreement > 0.7 ? '#22c55e' : avgAgreement > 0.4 ? '#f59e0b' : '#ef4444'
          }}>
            {(avgAgreement * 100).toFixed(0)}%
          </div>
          <div className="text-sm text-gray-500">Average Agreement</div>
        </div>
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${avgAgreement * 100}%`,
                backgroundColor: avgAgreement > 0.7 ? '#22c55e' : avgAgreement > 0.4 ? '#f59e0b' : '#ef4444'
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Low Agreement</span>
            <span>High Agreement</span>
          </div>
        </div>
      </div>

      {/* Most contested scenarios */}
      {contested.length > 0 && (
        <div>
          <h4 className="font-medium text-gray-700 mb-3">Most Contested Scenarios</h4>
          <div className="space-y-2">
            {contested.slice(0, 5).map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <span className="text-sm truncate max-w-[300px]" title={item.scenario}>
                  {item.scenario}
                </span>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">
                    Variance: <span className="font-mono">{item.variance.toFixed(2)}</span>
                  </span>
                  <span className="text-gray-500">
                    Range: <span className="font-mono">{item.range.toFixed(1)}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pairwise agreement */}
      {Object.keys(pairwise).length > 0 && (
        <div>
          <h4 className="font-medium text-gray-700 mb-3">Pairwise Model Agreement</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-auto">
            {Object.entries(pairwise)
              .sort((a, b) => b[1] - a[1])
              .map(([pair, corr], i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                >
                  <span className="truncate flex-1" title={pair}>
                    {pair}
                  </span>
                  <span
                    className="font-mono ml-2"
                    style={{
                      color: corr > 0.7 ? '#22c55e' : corr > 0.4 ? '#f59e0b' : '#ef4444'
                    }}
                  >
                    {corr.toFixed(2)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Correlation Matrix
function CorrelationMatrix({ data }: { data: DeepAnalysisResult }) {
  const correlations = data.correlations;

  if (!correlations || !correlations.strongest_correlations) {
    return <p className="text-gray-500">No correlation data available</p>;
  }

  const strongest = correlations.strongest_correlations.slice(0, 10);
  const divisive = correlations.most_divisive_dimensions || [];

  return (
    <div className="space-y-6">
      {/* Strongest correlations */}
      <div>
        <h4 className="font-medium text-gray-700 mb-3">Strongest Dimension-Model Correlations</h4>
        <div className="space-y-2">
          {strongest.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex-1">
                <span className="text-sm font-medium">{item.dimension}</span>
                <span className="text-gray-400 mx-2">&rarr;</span>
                <span className="text-sm text-gray-600 truncate" title={item.model}>
                  {item.model.length > 30 ? item.model.slice(0, 28) + '...' : item.model}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="font-mono font-medium"
                  style={{
                    color: item.correlation > 0 ? '#ef4444' : '#3b82f6'
                  }}
                >
                  {item.correlation > 0 ? '+' : ''}{item.correlation.toFixed(3)}
                </span>
                {item.significant && (
                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                    sig
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Most divisive dimensions */}
      {divisive.length > 0 && (
        <div>
          <h4 className="font-medium text-gray-700 mb-3">Most Divisive Dimensions</h4>
          <p className="text-sm text-gray-500 mb-3">
            Dimensions where models disagree most about correlation direction
          </p>
          <div className="space-y-2">
            {divisive.slice(0, 5).map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-purple-50 rounded-lg"
              >
                <span className="text-sm font-medium text-purple-800">{item.dimension}</span>
                <div className="text-sm text-purple-600">
                  Spread: <span className="font-mono">{item.correlation_spread.toFixed(3)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Basic Stats Table
function BasicStats({ data }: { data: DeepAnalysisResult }) {
  const stats = data.basic_stats;

  if (!stats) {
    return <p className="text-gray-500">No basic statistics available</p>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-3">Model</th>
            <th className="text-center py-2 px-3">Mean</th>
            <th className="text-center py-2 px-3">Std Dev</th>
            <th className="text-center py-2 px-3">Median</th>
            <th className="text-center py-2 px-3">Min</th>
            <th className="text-center py-2 px-3">Max</th>
            <th className="text-center py-2 px-3">Count</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(stats).map(([model, s], i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-2 px-3 font-medium truncate max-w-[200px]" title={model}>
                {model}
              </td>
              <td className="text-center py-2 px-3 font-mono">{s.mean.toFixed(2)}</td>
              <td className="text-center py-2 px-3 font-mono">{s.std.toFixed(2)}</td>
              <td className="text-center py-2 px-3 font-mono">{s.median.toFixed(2)}</td>
              <td className="text-center py-2 px-3 font-mono">{s.min}</td>
              <td className="text-center py-2 px-3 font-mono">{s.max}</td>
              <td className="text-center py-2 px-3">{s.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Main Deep Analysis Component
export function DeepAnalysis({ data }: DeepAnalysisProps) {
  if (data.error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
        <h3 className="font-semibold mb-2">Analysis Error</h3>
        <p>{data.error}</p>
      </div>
    );
  }

  const metadata = data.metadata;

  return (
    <div className="space-y-6">
      {/* Metadata summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Deep Statistical Analysis</h2>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>{metadata?.model_count || 0} models</span>
            <span>{metadata?.scenario_count || 0} scenarios</span>
            <span>{metadata?.dimension_count || 0} dimensions</span>
            <span>{metadata?.total_rows?.toLocaleString() || 0} data points</span>
          </div>
        </div>
      </div>

      {/* LLM Summary */}
      {data.llm_summary && (
        <Section title="AI Analysis Summary" icon={<Sparkles size={20} className="text-purple-500" />}>
          <div className="prose prose-sm max-w-none">
            <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
              {data.llm_summary.split('\n').map((line, i) => {
                // Handle markdown headers
                if (line.startsWith('## ')) {
                  return <h3 key={i} className="text-lg font-semibold mt-4 mb-2 text-gray-900">{line.slice(3)}</h3>;
                }
                if (line.startsWith('### ')) {
                  return <h4 key={i} className="text-base font-medium mt-3 mb-1 text-gray-800">{line.slice(4)}</h4>;
                }
                if (line.startsWith('# ')) {
                  return <h2 key={i} className="text-xl font-bold mt-4 mb-2 text-gray-900">{line.slice(2)}</h2>;
                }
                // Handle bold text
                if (line.includes('**')) {
                  const parts = line.split(/\*\*(.*?)\*\*/g);
                  return (
                    <p key={i} className="mb-2">
                      {parts.map((part, j) =>
                        j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                      )}
                    </p>
                  );
                }
                // Handle bullet points
                if (line.startsWith('- ') || line.startsWith('* ')) {
                  return <li key={i} className="ml-4">{line.slice(2)}</li>;
                }
                // Handle numbered lists
                if (/^\d+\.\s/.test(line)) {
                  return <li key={i} className="ml-4 list-decimal">{line.replace(/^\d+\.\s/, '')}</li>;
                }
                // Empty lines
                if (!line.trim()) {
                  return <br key={i} />;
                }
                // Regular paragraphs
                return <p key={i} className="mb-2">{line}</p>;
              })}
            </div>
          </div>
        </Section>
      )}

      {/* Key Insights */}
      {data.insights && data.insights.length > 0 && (
        <Section title="Algorithmic Insights" icon={<AlertCircle size={20} className="text-blue-500" />}>
          <InsightsPanel insights={data.insights} />
        </Section>
      )}

      {/* PCA Visualization */}
      <Section title="Model Positioning (PCA)" icon={<Target size={20} className="text-purple-500" />}>
        <PCAVisualization data={data} />
      </Section>

      {/* Dimension Variance */}
      <Section title="Dimension Impact" icon={<GitBranch size={20} className="text-amber-500" />}>
        <DimensionVarianceChart data={data} />
      </Section>

      {/* Outlier Detection */}
      <Section title="Model Outlier Detection" icon={<AlertTriangle size={20} className="text-red-500" />}>
        <OutlierDetection data={data} />
      </Section>

      {/* Inter-Model Agreement */}
      <Section title="Inter-Model Agreement" icon={<Users size={20} className="text-green-500" />}>
        <InterModelAgreement data={data} />
      </Section>

      {/* Correlations */}
      <Section title="Dimension-Model Correlations" icon={<TrendingUp size={20} className="text-blue-500" />} defaultOpen={false}>
        <CorrelationMatrix data={data} />
      </Section>

      {/* Basic Stats */}
      <Section title="Basic Statistics" icon={<BarChart size={20} className="text-gray-500" />} defaultOpen={false}>
        <BasicStats data={data} />
      </Section>
    </div>
  );
}

// BarChart icon component
function BarChart({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
