type Props = {
  open: boolean;
  onToggleOpen: (open: boolean) => void;
};

export function CircumplexMethodologyPanel({ open, onToggleOpen }: Props) {
  return (
    <details
      open={open}
      onToggle={(event) => onToggleOpen(event.currentTarget.open)}
      className="rounded-xl border border-gray-200 bg-white p-4 md:p-5"
    >
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">How this is computed</h2>
            <p className="text-sm text-gray-600">Structural similarity, not direct head-to-head dominance.</p>
          </div>
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500">
            {open ? 'Open' : 'Closed'}
          </span>
        </div>
      </summary>

      <div className="mt-4 space-y-4 text-sm leading-6 text-gray-700">
        <p>
          A value profile is the row of win rates for one value against the other nine values.
          We compare those profiles with Pearson correlation so the question becomes:
          do two values face the same allies and enemies across the value space?
          That is different from asking whether one value wins more often in a direct matchup.
        </p>
        <p>
          Example: Universalism — Nature and Benevolence — Dependability can tie head-to-head in a
          particular pair, yet still have similar profiles if they both tend to beat the same
          opponents and lose to the same opponents. That structural similarity is what circumplex
          theory predicts.
        </p>
        <p>
          This report applies Schwartz&apos;s circular-value theory to LLM forced-choice behavior,
          which is a novel use of the method rather than a previously validated measure for models.
          See Schwartz, 2012, <a
            href="https://doi.org/10.9707/2307-0919.1116"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-teal-700 hover:underline"
          >
            doi:10.9707/2307-0919.1116
          </a>.
        </p>
        <p>
          The raw Spearman ρ and p-value are shown next to the verdict band.
          The cutoffs are editorial, not psychometric, and the p-value should be read as
          directional only because the pairwise observations are not independent.
        </p>
      </div>
    </details>
  );
}
