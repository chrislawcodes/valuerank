import { Badge } from '../ui/Badge';
import type { ValueKey } from '../../data/domainAnalysisData';

type Props = {
  rho: number | null;
  p: number | null;
  verdictBand: string;
  excludedValues: ValueKey[];
};

function verdictLabel(verdictBand: string): { label: string; variant: 'success' | 'warning' | 'neutral' | 'error' } {
  switch (verdictBand) {
    case 'clear':
      return { label: 'Clear circumplex structure', variant: 'success' };
    case 'partial':
      return { label: 'Partial circumplex structure', variant: 'warning' };
    case 'insufficient_data':
      return { label: 'Insufficient determinate pairs', variant: 'error' };
    case 'not_evident':
    default:
      return { label: 'Circumplex not evident', variant: 'neutral' };
  }
}

function formatStat(value: number | null, digits: number): string {
  return value == null ? '—' : value.toFixed(digits);
}

export function CircumplexVerdictPanel({ rho, p, verdictBand, excludedValues }: Props) {
  const verdict = verdictLabel(verdictBand);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Fit summary</h2>
          <p className="text-sm text-gray-600">Spearman ρ compares theoretical circle distance with empirical profile correlation.</p>
        </div>
        <Badge variant={verdict.variant} size="md">{verdict.label}</Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-gray-500">Spearman ρ</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{formatStat(rho, 2)}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-gray-500">p-value</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{formatStat(p, 3)}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-gray-500">Excluded values</div>
          <div className="mt-1 text-sm text-gray-700">
            {excludedValues.length === 0 ? 'None' : excludedValues.join(', ')}
          </div>
        </div>
      </div>
    </section>
  );
}
