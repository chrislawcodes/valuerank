import { useEffect, useMemo, useRef, useState } from 'react';
import {
  VALUES,
  type ModelEntry,
  type ValueKey,
} from '../../data/domainAnalysisData';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { DominanceSectionChart, type DominanceSectionThemeColors } from './DominanceSectionChart';
import { DominanceSectionSummary } from './DominanceSectionSummary';
import { useDominanceGraph } from './useDominanceGraph';

type DominanceSectionProps = {
  models: ModelEntry[];
};

const THEME_COLORS: DominanceSectionThemeColors = {
  arrowColor: '#0f766e',
  outgoingFocusedColor: '#16a34a',
  incomingFocusedColor: '#dc2626',
  neutralColor: '#94a3b8',
  closeWinColor: '#eab308',
  nodeLabelColor: '#111827',
  nodeSubLabelColor: '#6b7280',
  panelText: 'text-gray-900',
  panelMutedText: 'text-gray-600',
  panelBorder: 'border-gray-200',
  panelBg: 'bg-white',
  cardBg: 'bg-gray-50',
  cardBorder: 'border-gray-200',
  selectedRingColor: '#22d3ee',
  idleRingColor: '#38bdf8',
};

export function DominanceSection({ models }: DominanceSectionProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [focusedValue, setFocusedValue] = useState<ValueKey | null>(null);
  const [hoveredValue, setHoveredValue] = useState<ValueKey | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const animationPhase = 'idle' as const;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  const allModelsEntry = useMemo<ModelEntry>(() => {
    const modelsWithRates = models.filter((m) =>
      VALUES.some((v) => m.winRates?.[v] != null),
    );
    const count = Math.max(modelsWithRates.length, 1);
    const avgWinRates = Object.fromEntries(
      VALUES.map((v) => {
        const rates = modelsWithRates
          .map((m) => m.winRates?.[v])
          .filter((r): r is number => r != null);
        return [v, rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null];
      }),
    ) as Record<ValueKey, number | null>;
    const avgValues = Object.fromEntries(
      VALUES.map((v) => [
        v,
        models.reduce((sum, m) => sum + (m.values[v] ?? 0), 0) / count,
      ]),
    ) as Record<ValueKey, number>;
    return {
      model: '__all__',
      label: 'All models (average)',
      values: avgValues,
      winRates: avgWinRates,
    };
  }, [models]);

  const modelById = useMemo(
    () => new Map<string, ModelEntry>([
      ...models.map((m): [string, ModelEntry] => [m.model, m]),
      ['__all__', allModelsEntry],
    ]),
    [models, allModelsEntry],
  );

  const selectedModel = modelById.get('__all__');

  const {
    contestedPairs,
    edgeClockwiseOrder,
    edges,
    nodePositions,
    positionByValue,
    priorityValueRange,
  } = useDominanceGraph({
    focusedValue,
    models,
    selectedModel,
  });

  return (
    <section className={`rounded-lg border p-4 ${THEME_COLORS.panelBorder} ${THEME_COLORS.panelBg}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className={`text-base font-medium ${THEME_COLORS.panelText}`}>Dominance Graph</h2>
          <p className={`text-sm ${THEME_COLORS.panelMutedText}`}>
            Directed value graph averaged across selected models: arrows point from stronger value to weaker value.
          </p>
        </div>
        <CopyVisualButton targetRef={chartRef} label="ranking and cycles chart" />
      </div>

      {models.length === 0 && (
        <p className={`mb-3 text-xs ${THEME_COLORS.panelMutedText}`}>
          No analyzed model data is available for this domain yet.
        </p>
      )}

      <div
        ref={chartRef}
        className="mb-4 overflow-x-auto rounded border border-gray-100 bg-gray-50 p-2"
      >
        <DominanceSectionChart
          animationPhase={animationPhase}
          edgeClockwiseOrder={edgeClockwiseOrder}
          edges={edges}
          focusedValue={focusedValue}
          hoveredValue={hoveredValue}
          nodePositions={nodePositions}
          onFocusToggle={(value) =>
            setFocusedValue((current) => (current === value ? null : value))
          }
          onHoverChange={setHoveredValue}
          positionByValue={positionByValue}
          prefersReducedMotion={prefersReducedMotion}
          priorityValueRange={priorityValueRange}
          selectedModel={selectedModel}
          themeColors={THEME_COLORS}
        />
      </div>

      <DominanceSectionSummary contestedPairs={contestedPairs} themeColors={THEME_COLORS} />
    </section>
  );
}
