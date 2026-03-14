import { VALUE_LABELS } from '../../data/domainAnalysisData';
import type { DominanceSectionThemeColors } from './DominanceSectionChart';
import type { ContestedPair } from './useDominanceGraph';

type DominanceSectionSummaryProps = {
  contestedPairs: ContestedPair[];
  themeColors: DominanceSectionThemeColors;
};

export function DominanceSectionSummary({
  contestedPairs,
  themeColors,
}: DominanceSectionSummaryProps) {
  return (
    <div className={`rounded border p-3 ${themeColors.cardBorder} ${themeColors.cardBg}`}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className={`text-sm font-medium ${themeColors.panelText}`}>Arrow Meaning</h3>
      </div>
      <ul className={`mt-2 list-disc space-y-1 pl-5 text-sm ${themeColors.panelMutedText}`}>
        <li>Arrow direction: winner value points to loser value.</li>
        <li>Focused view: green arrows go out from the clicked value, red arrows come in.</li>
        <li>Arrow thickness: higher pairwise win rate for that value over the other in this AI.</li>
        <li>Yellow double-headed arrows: near-even win rates (values are highly contestable).</li>
      </ul>
      <h4 className={`mt-3 text-sm font-medium ${themeColors.panelText}`}>
        Most Contestable Value Pairs
      </h4>
      <p className={`mt-2 text-xs ${themeColors.panelMutedText}`}>
        For this selected AI. Smaller BT score gap means two values are more closely matched.
      </p>
      <ol className={`mt-2 space-y-1 text-sm ${themeColors.panelMutedText}`}>
        {contestedPairs.map((item, index) => (
          <li key={`${item.a}-${item.b}`}>
            {index + 1}. {VALUE_LABELS[item.a]} vs {VALUE_LABELS[item.b]} ({item.gap.toFixed(3)} gap,{' '}
            {VALUE_LABELS[item.winner]} wins)
          </li>
        ))}
      </ol>
    </div>
  );
}
