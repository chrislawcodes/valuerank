import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import { type ModelsAnalysisModelResult, type ModelsAnalysisValueResult } from '../../api/operations/modelsAnalysis';
import { VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { computeDots, computeSimpleMad, formatStabilityTooltip } from './stabilityDots';

type ModelValueDetailDrawerProps = {
  open: boolean;
  model: ModelsAnalysisModelResult | null;
  value: ModelsAnalysisValueResult | null;
  singleDomainActive: boolean;
  onClose: () => void;
};

function formatPercent(value: number | null): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return `${Math.round(value)}%`;
}

function InfoIcon() {
  return <Info className="h-3.5 w-3.5" />;
}

function Dots({ score }: { score: number | null }) {
  const states = computeDots(score);
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {states.map((state, i) => {
        if (state === 'full') {
          return <span key={i} className="inline-block w-3 h-3 rounded-full flex-shrink-0 bg-current" />;
        }
        if (state === 'half') {
          return (
            <span
              key={i}
              className="inline-block w-3 h-3 rounded-full flex-shrink-0"
              style={{
                background: 'linear-gradient(to right, currentColor 50%, transparent 50%)',
                boxShadow: '0 0 0 1px currentColor',
              }}
            />
          );
        }
        if (state === 'muted') {
          return <span key={i} className="inline-block w-3 h-3 rounded-full flex-shrink-0 border border-current opacity-30" />;
        }
        return <span key={i} className="inline-block w-3 h-3 rounded-full flex-shrink-0 border border-current" />;
      })}
    </span>
  );
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
  const mad = computeSimpleMad(value.domains);
  const stabilityCardText = formatStabilityTooltip(value.stabilityScore, value.eligibleDomainCount, mad, singleDomainActive);
  const domains = [...value.domains].sort((left, right) => {
    const diff = (right.evidenceWeight ?? 0) - (left.evidenceWeight ?? 0);
    return diff !== 0 ? diff : left.domainName.localeCompare(right.domainName);
  });

  // --- Pooled win rate tooltip data ---
  const pooledWinRateTooltip = (
    <div className="space-y-2">
      <p>
        <strong>What it means:</strong> A simple average of win rates across eligible domains.
        Each domain counts equally — a domain with more vignettes does not pull the average harder.
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

  const crossDomainStabilityTooltip = (
    <div className="space-y-2">
      <p>
        <strong>What it means:</strong> How consistently this model wins across different domains.
        A high score means the model behaves the same way no matter which domain it&apos;s tested in.
        A low score means the results vary a lot by domain.
      </p>
      <p>
        <strong>How the score is built:</strong> we compare each domain&apos;s win rate, measure how far those rates spread from the mean, and convert that spread into a score from 0 to 100.
      </p>
      {singleDomainActive && (
        <p className="text-amber-700 border-t border-gray-200 pt-2">
          Not available when a single domain is selected — you need at least 2 domains to compare consistency.
        </p>
      )}
      {!singleDomainActive && value.eligibleDomainCount < 2 && (
        <p className="text-amber-700 border-t border-gray-200 pt-2">
          Needs at least 2 eligible domains. Currently: {value.eligibleDomainCount}.
        </p>
      )}
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
                Simple mean across the eligible domains shown below — each domain counts equally.
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <span>Cross-domain stability</span>
                <Tooltip
                  content={crossDomainStabilityTooltip}
                  position="bottom"
                  variant="light"
                  className="w-96 px-3 py-3 text-xs leading-relaxed normal-case tracking-normal font-normal"
                >
                  <Button type="button" variant="ghost" size="icon" className="cursor-help p-0 min-w-0 min-h-0 h-4 w-4 text-gray-400 hover:text-gray-600 hover:bg-transparent" aria-label="How cross-domain stability is calculated">
                    <InfoIcon />
                  </Button>
                </Tooltip>
              </div>
              <div className="mt-2 flex items-center gap-2 text-lg text-gray-900">
                <Dots score={value.stabilityScore} />
                <span className="font-mono">{value.stabilityScore == null ? 'n/a' : `${Math.round(value.stabilityScore)}/100`}</span>
              </div>
              <p className="mt-2 text-sm text-gray-600">{stabilityCardText}</p>
            </div>
          </section>

        </div>
      </aside>
    </div>,
    document.body,
  );
}
