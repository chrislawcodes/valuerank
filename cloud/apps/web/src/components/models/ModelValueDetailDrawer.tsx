import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { type ModelsAnalysisModelResult, type ModelsAnalysisValueResult } from '../../api/operations/modelsAnalysis';
import { VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';
import { Button } from '../ui/Button';
import { computeDots, computeWeightedMad, formatStabilityTooltip } from './stabilityDots';

type ModelValueDetailDrawerProps = {
  open: boolean;
  model: ModelsAnalysisModelResult | null;
  value: ModelsAnalysisValueResult | null;
  singleDomainActive: boolean;
  onClose: () => void;
};

function formatPercent(value: number | null): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  const rounded = value.toFixed(1);
  return rounded.endsWith('.0') ? `${rounded.slice(0, -2)}%` : `${rounded}%`;
}

function renderDots(score: number | null): string {
  return computeDots(score)
    .map((state) => {
      switch (state) {
        case 'full':
          return '●';
        case 'half':
          return '◐';
        case 'empty':
        case 'muted':
          return '○';
        default:
          return '○';
      }
    })
    .join('');
}

export function ModelValueDetailDrawer({
  open,
  model,
  value,
  singleDomainActive,
  onClose,
}: ModelValueDetailDrawerProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    // Lock both body and the layout's <main> scroll container. The app layout uses
    // overflow-auto on <main> (not body), so only locking body has no effect — scroll
    // events still reach <main> and scroll the background behind the drawer.
    const main = document.querySelector<HTMLElement>('main');
    const originalBodyOverflow = document.body.style.overflow;
    const originalMainOverflow = main?.style.overflow ?? '';
    document.body.style.overflow = 'hidden';
    if (main != null) main.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      if (main != null) main.style.overflow = originalMainOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || model == null || value == null) return null;

  const valueKey = value.valueKey as ValueKey;
  const valueLabel = VALUE_LABELS[valueKey] ?? value.valueKey;
  const mad = computeWeightedMad(value.domains);
  const tooltip = formatStabilityTooltip(value.stabilityScore, value.eligibleDomainCount, mad, singleDomainActive);
  const dots = renderDots(value.stabilityScore);
  const domains = [...value.domains].sort((left, right) => {
    const diff = right.evidenceWeight - left.evidenceWeight;
    return diff !== 0 ? diff : left.domainName.localeCompare(right.domainName);
  });

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-3xl border-l border-gray-200 bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-gray-900">{model.label}</h2>
            <p className="text-sm text-gray-600">
              {valueLabel} · {value.eligibleDomainCount} eligible domain{value.eligibleDomainCount === 1 ? '' : 's'}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close model value details">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pooled win rate</div>
              <div className="mt-2 text-4xl font-semibold text-gray-900">
                {formatPercent(value.pooledWinRate)}
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Weighted mean across the eligible domains shown below.
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cross-domain stability</div>
              <div className="mt-2 flex items-center gap-2 font-mono text-lg text-gray-900" title={tooltip}>
                <span aria-hidden="true">{dots}</span>
                <span>{value.stabilityScore == null ? 'n/a' : `${Math.round(value.stabilityScore)}/100`}</span>
              </div>
              <p className="mt-2 text-sm text-gray-600">{tooltip}</p>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Contributing domains</h3>
              <p className="text-xs text-gray-600">
                Each row shows the eligible domains that contributed to this cell. The link opens the existing domain value detail page.
              </p>
            </div>
            {domains.length === 0 ? (
              <div className="px-4 py-4 text-sm text-gray-500">
                No eligible domains contributed to this cell yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="border-b border-gray-200 px-4 py-3">Domain</th>
                      <th className="border-b border-gray-200 px-4 py-3">Win rate</th>
                      <th className="border-b border-gray-200 px-4 py-3">Evidence weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domains.map((domain) => (
                      <tr key={domain.domainId} className="hover:bg-gray-50">
                        <td className="border-b border-gray-100 px-4 py-3">
                          <Link
                            to={`/domains/analysis/value-detail?domainId=${encodeURIComponent(domain.domainId)}&modelId=${encodeURIComponent(model.modelId)}&valueKey=${encodeURIComponent(value.valueKey)}`}
                            className="font-medium text-teal-700 hover:text-teal-900 hover:underline"
                          >
                            {domain.domainName}
                          </Link>
                        </td>
                        <td className="border-b border-gray-100 px-4 py-3 font-mono text-gray-900">
                          {formatPercent(domain.winRate)}
                        </td>
                        <td className="border-b border-gray-100 px-4 py-3 font-mono text-gray-900">
                          {domain.evidenceWeight}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
