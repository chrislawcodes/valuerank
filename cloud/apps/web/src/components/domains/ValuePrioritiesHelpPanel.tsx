type ScoreMode = 'WIN_RATE' | 'FULL_BT' | 'SUPPORT_WIN';

type Props = { scoreMode: ScoreMode };

export function ValuePrioritiesHelpPanel({ scoreMode }: Props) {
  return (
    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-xs text-gray-700">
      {scoreMode === 'FULL_BT' ? (
        <>
          <p className="font-medium text-gray-800">Score Method: Full Bradley-Terry</p>
          <p className="mt-1">
            We fit a full Bradley-Terry model over pairwise value matchups for this AI. The model estimates
            a latent strength for each value that best explains observed wins and losses.
          </p>
          <p className="mt-2 font-medium text-gray-800">Formula</p>
          <p className="mt-0.5 font-mono text-[11px] text-sky-900">
            Score = logarithm(estimated BT strength for this value)
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-4">
            <li>Better than simple ratios when comparisons form a connected network across values.</li>
            <li>Strengths are estimated jointly, so each value is calibrated against all others.</li>
            <li>Positive values indicate above-average latent strength; negative values indicate below-average.</li>
          </ul>
        </>
      ) : scoreMode === 'SUPPORT_WIN' ? (
        <>
          <p className="font-medium text-gray-800">Score Method: Support Rate / Win Rate</p>
          <p className="mt-1">
            Shows both an estimated population-level support rate and a conditional win rate.
          </p>
          <p className="mt-2 font-medium text-gray-800">Support Rate</p>
          <p className="mt-0.5 font-mono text-[11px] text-sky-900">
            (prioritized + 0.5 × neutral) / total
          </p>
          <p className="mt-1">
            Neutral outcomes count as half-support. Good for broad comparison across models and domains.
          </p>
          <p className="mt-2 font-medium text-gray-800">Win Rate</p>
          <p className="mt-0.5 font-mono text-[11px] text-sky-900">
            prioritized / (prioritized + deprioritized)
          </p>
          <p className="mt-1">
            Shows how often a value wins once the model picks a side. Same calculation as the standalone Win
            Rate mode, but rounded to a whole number for compactness.
          </p>
        </>
      ) : (
        <>
          <p className="font-medium text-gray-800">Score Method: Win Rate</p>
          <p className="mt-1">
            The percentage of pairwise comparisons in which the AI chose this value over another.
          </p>
          <p className="mt-2 font-medium text-gray-800">Formula</p>
          <p className="mt-0.5 font-mono text-[11px] text-sky-900">
            Win Rate = prioritized / (prioritized + deprioritized) × 100%
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-4">
            <li>50% means the AI chose this value in half of all head-to-head comparisons.</li>
            <li>Easy to interpret: higher % = model prioritizes this value more often.</li>
            <li>Shows &ldquo;n/a&rdquo; when no comparison data exists for a value.</li>
          </ul>
        </>
      )}
    </div>
  );
}
