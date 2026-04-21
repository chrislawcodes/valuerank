import { Info } from 'lucide-react';
import { Select } from '../ui/Select';
import { Tooltip } from '../ui/Tooltip';
import { Button } from '../ui/Button';

type Props = {
  open: boolean;
  onToggleOpen: (open: boolean) => void;
};

const METHODOLOGY_OPTIONS = [
  { value: 'closed', label: 'Closed' },
  { value: 'open', label: 'Open' },
] as const;

const methodologyTooltip = (
  <div className="space-y-2">
    <p>
      <strong>Closed:</strong> keeps the header compact and hides the longer methodology notes.
    </p>
    <p>
      <strong>Open:</strong> shows the full explanation in the same controls area.
    </p>
  </div>
);

export function CircumplexMethodologyPanel({ open, onToggleOpen }: Props) {
  return (
    <div className="min-w-[220px] flex-1">
      <div className="mb-1 flex items-center gap-1.5">
        <label className="block text-sm font-medium text-gray-700">How this is computed</label>
        <Tooltip
          content={methodologyTooltip}
          position="bottom"
          variant="light"
          className="max-w-xs px-3 py-3 text-xs leading-relaxed"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 min-h-0 min-w-0 text-gray-400 hover:bg-transparent hover:text-gray-600"
            aria-label="Methodology display options"
          >
            <Info className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>

      <Select
        options={[...METHODOLOGY_OPTIONS]}
        value={open ? 'open' : 'closed'}
        onChange={(value) => onToggleOpen(value === 'open')}
      />

      {open && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-700">
          <div className="space-y-4">
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
        </div>
      )}
    </div>
  );
}
