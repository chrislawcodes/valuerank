import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type DomainAnalysisModelAvailability,
  type ModelEntry,
  type ValueKey,
} from '../../data/domainAnalysisData';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { DominanceSectionChart, type DominanceSectionThemeColors } from './DominanceSectionChart';
import { DominanceSectionSummary } from './DominanceSectionSummary';
import {
  DISPLAY_VALUES,
  NODE_ANIMATION_BASE_DURATION_MS,
  NODE_ANIMATION_PER_NODE_SLOWDOWN_MS,
  useDominanceGraph,
} from './useDominanceGraph';

type DominanceSectionProps = {
  models: ModelEntry[];
  unavailableModels: DomainAnalysisModelAvailability[];
  selectedModelId: string | null;
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

export function DominanceSection({ models, unavailableModels, selectedModelId }: DominanceSectionProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [focusedValue, setFocusedValue] = useState<ValueKey | null>(null);
  const [hoveredValue, setHoveredValue] = useState<ValueKey | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<'idle' | 'collapse' | 'expand'>('idle');
  const prevModelId = useRef(selectedModelId);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  const slowestDuration =
    NODE_ANIMATION_BASE_DURATION_MS +
    (DISPLAY_VALUES.length - 1) * NODE_ANIMATION_PER_NODE_SLOWDOWN_MS;

  useEffect(() => {
    if (selectedModelId === prevModelId.current) return;
    prevModelId.current = selectedModelId;
    if (prefersReducedMotion) return;

    setAnimationPhase('collapse');
    const expandTimer = setTimeout(() => setAnimationPhase('expand'), slowestDuration);
    const idleTimer = setTimeout(() => setAnimationPhase('idle'), 2 * slowestDuration);
    return () => {
      clearTimeout(expandTimer);
      clearTimeout(idleTimer);
    };
  }, [prefersReducedMotion, selectedModelId, slowestDuration]);

  const modelById = useMemo(
    () => new Map(models.map((model) => [model.model, model])),
    [models],
  );
  const activeModelId = selectedModelId !== null && modelById.has(selectedModelId)
    ? selectedModelId
    : models[0]?.model ?? '';
  const selectedModel = modelById.get(activeModelId);

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
          <h2 className={`text-base font-medium ${THEME_COLORS.panelText}`}>Ranking and Cycles</h2>
          <p className={`text-sm ${THEME_COLORS.panelMutedText}`}>
            Directed value graph for one selected AI: arrows point from stronger value to weaker value.
          </p>
        </div>
        <CopyVisualButton targetRef={chartRef} label="ranking and cycles chart" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className={`font-medium ${THEME_COLORS.panelMutedText}`}>Model focus:</span>
        <span className={THEME_COLORS.panelText}>{selectedModel?.label ?? 'No model selected'}</span>
      </div>
      {unavailableModels.length > 0 && (
        <p className={`mb-3 text-xs ${THEME_COLORS.panelMutedText}`}>
          {unavailableModels.length} unavailable model{unavailableModels.length === 1 ? '' : 's'} stay hidden from this analysis.
        </p>
      )}

      {models.length === 0 && (
        <p className={`mb-3 text-xs ${THEME_COLORS.panelMutedText}`}>
          No analyzed model data is available for this domain yet.
        </p>
      )}

      <p className={`mb-3 text-xs ${THEME_COLORS.panelMutedText}`}>
        Click a value circle to focus it and fade unrelated arrows. Click it again to clear focus.
      </p>

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
