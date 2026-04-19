import {
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ModelsConsistencyModel } from '../../api/operations/modelsConsistency';

type ConsistencyScatterProps = {
  models: ModelsConsistencyModel[];
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
};

type ScatterPoint = ModelsConsistencyModel & {
  repeatabilityValue: number;
  coherenceValue: number;
  radius: number;
};

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function providerFill(providerName: string): string {
  const palette = ['#0f766e', '#0ea5e9', '#7c3aed', '#d97706', '#dc2626', '#16a34a', '#4f46e5', '#0f172a'];
  let hash = 0;
  for (let index = 0; index < providerName.length; index += 1) {
    hash = (hash * 31 + providerName.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length] ?? palette[0]!;
}

function regionLabel(x: number, y: number): string {
  if (x >= 0.85 && y >= 0.8) return 'Reliable & follows pressure';
  if (x < 0.85 && y >= 0.8) return 'Follows pressure but jittery';
  if (x >= 0.85 && y < 0.8) return "Steady but doesn't follow pressure";
  return 'Neither steady nor responsive';
}

function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ScatterPoint }>;
}) {
  if (!active || payload == null || payload[0] == null) {
    return null;
  }

  const point = payload[0].payload;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-lg">
      <div className="font-medium text-gray-900">{point.label}</div>
      <div className="mt-2 space-y-1 text-gray-600">
        <div>Provider: {point.providerName}</div>
        <div>Repeatability: {formatPercent(point.repeatabilityValue)}</div>
        <div>Coherence: {formatPercent(point.coherenceValue)}</div>
        <div>n scenarios: {point.repeatability.scenariosMeasured}</div>
      </div>
    </div>
  );
}

export function ConsistencyScatter({ models, selectedModelId, onSelectModel }: ConsistencyScatterProps) {
  const data: ScatterPoint[] = models.map((model) => ({
    ...model,
    repeatabilityValue: model.repeatability.value,
    coherenceValue: model.coherence.value,
    radius: Math.max(5, Math.min(14, 4 + Math.sqrt(model.repeatability.scenariosMeasured) * 1.7)),
  }));

  const quadrantLabels = new Set(data.map((point) => regionLabel(point.repeatabilityValue, point.coherenceValue)));
  const homogeneity = quadrantLabels.size === 1;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Failure-mode map</h2>
          <p className="text-sm text-gray-600">Repeatability on x, Coherence on y.</p>
        </div>
        {homogeneity && (
          <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-800">
            All models fall in the same quadrant.
          </div>
        )}
      </div>
      <div className="relative h-[420px]">
        <div className="pointer-events-none absolute left-4 top-4 text-xs text-gray-500">High Coherence</div>
        <div className="pointer-events-none absolute right-4 top-4 text-right text-xs text-gray-500">High Coherence</div>
        <div className="pointer-events-none absolute left-4 bottom-4 text-xs text-gray-500">Low Coherence</div>
        <div className="pointer-events-none absolute right-4 bottom-4 text-right text-xs text-gray-500">Low Coherence</div>
        <div className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-xs text-gray-500">Low Repeatability</div>
        <div className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-xs text-gray-500">High Repeatability</div>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 28, right: 28, bottom: 28, left: 28 }}>
            <XAxis type="number" dataKey="repeatabilityValue" domain={[0, 1]} name="Repeatability" tickCount={6} />
            <YAxis type="number" dataKey="coherenceValue" domain={[0, 1]} name="Coherence" tickCount={6} />
            <Tooltip content={<ScatterTooltip />} />
            <ReferenceLine x={0.85} stroke="#9ca3af" strokeDasharray="4 4" />
            <ReferenceLine y={0.8} stroke="#9ca3af" strokeDasharray="4 4" />
            <Scatter data={data} shape={(props: { cx?: number; cy?: number; payload?: ScatterPoint }) => (
              <g>
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={props.payload?.radius ?? 6}
                  fill={providerFill(props.payload?.providerName ?? '')}
                  fillOpacity={0.22}
                  stroke={props.payload?.modelId === selectedModelId ? '#111827' : providerFill(props.payload?.providerName ?? '')}
                  strokeWidth={props.payload?.modelId === selectedModelId ? 3 : 1.5}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (props.payload?.modelId != null) {
                      onSelectModel(props.payload.modelId);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                />
              </g>
            )} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
        {[
          'Reliable & follows pressure',
          'Follows pressure but jittery',
          "Steady but doesn't follow pressure",
          'Neither steady nor responsive',
        ].map((label) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="font-medium text-gray-900">{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
