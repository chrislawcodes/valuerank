import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Info, X } from 'lucide-react';
import { type ModelsAnalysisModelResult, type ModelsAnalysisValueResult } from '../../api/operations/modelsAnalysis';
import { VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';

type ModelValueDetailDrawerProps = {
  open: boolean;
  model: ModelsAnalysisModelResult | null;
  value: ModelsAnalysisValueResult | null;
  onClose: () => void;
};

function formatPercent(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(value)}%`;
}

function InfoIcon() {
  return <Info className="h-3.5 w-3.5" />;
}

export function ModelValueDetailDrawer({
  open,
  model,
  value,
  onClose,
}: ModelValueDetailDrawerProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || model == null || value == null) return null;

  const valueKey = value.valueKey as ValueKey;
  const valueLabel = VALUE_LABELS[valueKey] ?? value.valueKey;
  const domains = [...value.domains].sort((left, right) => {
    const diff = (right.evidenceWeight ?? 0) - (left.evidenceWeight ?? 0);
    return diff !== 0 ? diff : left.domainName.localeCompare(right.domainName);
  });

  const pooledWinRateTooltip = (
    <div className="space-y-2">
      <p>
        <strong>What it means:</strong> A simple average of win rates across eligible domains.
        Each domain counts equally - a domain with more vignettes does not pull the average harder.
        Win rate per domain = prioritized ÷ (prioritized + deprioritized + neutral) across all its vignettes for this value.
      </p>
      <p>
        <strong>Formula:</strong> add up all domain win rates, then divide by the number of domains.
      </p>
      {domains.length > 0 && (
        <div className="border-t border-gray-200 pt-2">
          <p className="font-semibold mb-1">Calculation for this cell:</p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="text-left pb-1 pr-3 font-medium">Domain</th>
                <th className="text-right pb-1 px-2 font-medium">Vignettes</th>
                <th className="text-right pb-1 pl-2 font-medium">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.domainId} className="border-b border-gray-100">
                  <td className="py-0.5 pr-3">{d.domainName}</td>
                  <td className="text-right py-0.5 px-2">{d.evidenceWeight ?? '—'}</td>
                  <td className="text-right py-0.5 pl-2">{formatPercent(d.winRate)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-300 font-semibold">
                <td className="pt-1 pr-3 text-gray-500 font-normal" colSpan={2}>
                  sum ÷ {domains.length} =
                </td>
                <td className="text-right pt-1 pl-2">{formatPercent(value.pooledWinRate)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );

  const vignetteCountTooltip = (
    <div className="space-y-2">
      <p>
        <strong>What it means:</strong> The number of distinct vignettes in this domain that test this value.
        A vignette is a head-to-head scenario set where two values are compared.
      </p>
      <p>
        Multiple runs of the same vignette are pooled into a single win rate before counting,
        so this number reflects distinct vignettes, not total scenarios or runs.
      </p>
      <p>
        Every vignette counts equally when computing the domain win rate -
        a domain with 5 vignettes does not pull the average harder than one with 1.
      </p>
    </div>
  );

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
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <span>Pooled win rate</span>
                <Tooltip
                  content={pooledWinRateTooltip}
                  position="bottom"
                  variant="light"
                  className="w-96 px-3 py-3 text-xs leading-relaxed normal-case tracking-normal font-normal"
                >
                  <Button type="button" variant="ghost" size="icon" className="cursor-help p-0 min-w-0 min-h-0 h-4 w-4 text-gray-400 hover:text-gray-600 hover:bg-transparent" aria-label="How pooled win rate is calculated">
                    <InfoIcon />
                  </Button>
                </Tooltip>
              </div>
              <div className="mt-2 text-4xl font-semibold text-gray-900">
                {formatPercent(value.pooledWinRate)}
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Simple mean across the eligible domains shown below - each domain counts equally.
              </p>
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
                      <th className="border-b border-gray-200 px-4 py-3">
                        <div className="flex items-center gap-1">
                          <span>Vignette count</span>
                          <Tooltip
                            content={vignetteCountTooltip}
                            position="bottom"
                            variant="light"
                            className="w-72 px-3 py-3 text-xs leading-relaxed normal-case tracking-normal font-normal"
                          >
                            <Button type="button" variant="ghost" size="icon" className="cursor-help p-0 min-w-0 min-h-0 h-4 w-4 text-gray-400 hover:text-gray-600 hover:bg-transparent" aria-label="What vignette count means">
                              <InfoIcon />
                            </Button>
                          </Tooltip>
                        </div>
                      </th>
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
                          {domain.evidenceWeight ?? '—'}
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
