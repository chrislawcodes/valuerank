import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Info, X } from 'lucide-react';
import { type ModelsAnalysisModelResult, type ModelsAnalysisValueResult } from '../../api/operations/modelsAnalysis';
import { VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { computeDots, computeWeightedMad, computeWeightedMean, formatStabilityTooltip } from './stabilityDots';

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
  const stabilityCardText = formatStabilityTooltip(value.stabilityScore, value.eligibleDomainCount, mad, singleDomainActive);
  const domains = [...value.domains].sort((left, right) => {
    const diff = right.evidenceWeight - left.evidenceWeight;
    return diff !== 0 ? diff : left.domainName.localeCompare(right.domainName);
  });

  // --- Pooled win rate tooltip data ---
  const totalWeight = domains.reduce((sum, d) => sum + d.evidenceWeight, 0);
  const weightedSum = domains.reduce((sum, d) => sum + d.evidenceWeight * d.winRate, 0);

  const pooledWinRateTooltip = (
    <div className="space-y-2">
      <p>
        <strong>What it means:</strong> A weighted average of win rates across each eligible domain.
        Each scenario pitted two values head-to-head and was scored as prioritized, deprioritized, or neutral.
        Win rate = prioritized ÷ (prioritized + deprioritized + neutral) — all outcomes count in the denominator.
        Domains with more scenarios (higher evidence weight) count more in the average.
      </p>
      <p>
        <strong>Formula:</strong> add up (weight × win rate) for every domain, then divide by the total weight.
      </p>
      {domains.length > 0 && (
        <div className="border-t border-gray-200 pt-2">
          <p className="font-semibold mb-1">Calculation for this cell:</p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="text-left pb-1 pr-3 font-medium">Domain</th>
                <th className="text-right pb-1 px-2 font-medium">Weight</th>
                <th className="text-right pb-1 px-2 font-medium">Win rate</th>
                <th className="text-right pb-1 pl-2 font-medium">W × WR</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.domainId} className="border-b border-gray-100">
                  <td className="py-0.5 pr-3">{d.domainName}</td>
                  <td className="text-right py-0.5 px-2">{d.evidenceWeight}</td>
                  <td className="text-right py-0.5 px-2">{formatPercent(d.winRate)}</td>
                  <td className="text-right py-0.5 pl-2">{Math.round(d.evidenceWeight * d.winRate)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-300 font-semibold">
                <td className="pt-1 pr-3 text-gray-500 font-normal" colSpan={3}>
                  {Math.round(weightedSum)} ÷ {totalWeight} =
                </td>
                <td className="text-right pt-1 pl-2">{formatPercent(value.pooledWinRate)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );

  // --- Cross-domain stability tooltip data ---
  const pooledMean = computeWeightedMean(domains);

  const crossDomainStabilityTooltip = (
    <div className="space-y-2">
      <p>
        <strong>What it means:</strong> How consistently this model wins across different domains.
        A high score means the model behaves the same way no matter which domain it&apos;s tested in.
        A low score means the results vary a lot by domain.
      </p>
      <p>
        <strong>How the score is built:</strong>
      </p>
      <ol className="list-decimal pl-4 space-y-0.5">
        <li>Find each domain&apos;s win rate (table below).</li>
        <li>Measure how far each domain&apos;s win rate is from the pooled mean — the &quot;spread.&quot;</li>
        <li>
          Take a weighted average of those distances, where domains with more comparisons count more.
          This is called the <strong>weighted MAD</strong> (Mean Absolute Deviation) — it&apos;s just
          the average distance between each domain&apos;s win rate and the overall mean,
          with bigger domains pulling the average more than smaller ones.
        </li>
        <li>
          Convert to a score: <strong>score = 100 × (1 − MAD ÷ 50)</strong>.
          A MAD of 0 → score 100 (all domains identical).
          A MAD of 50 → score 0 (maximum disagreement possible).
        </li>
      </ol>
      {!singleDomainActive && value.eligibleDomainCount >= 2 && pooledMean != null && domains.length > 0 && (
        <div className="border-t border-gray-200 pt-2">
          <p className="font-semibold mb-1">
            Calculation for this cell <span className="font-normal text-gray-500">(pooled mean: {formatPercent(pooledMean)})</span>:
          </p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="text-left pb-1 pr-3 font-medium">Domain</th>
                <th className="text-right pb-1 px-2 font-medium">Win rate</th>
                <th className="text-right pb-1 pl-2 font-medium">Distance from mean</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.domainId} className="border-b border-gray-100">
                  <td className="py-0.5 pr-3">{d.domainName}</td>
                  <td className="text-right py-0.5 px-2">{formatPercent(d.winRate)}</td>
                  <td className="text-right py-0.5 pl-2">{Math.round(Math.abs(d.winRate - pooledMean))} pts</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-300 font-semibold">
                <td className="pt-1 pr-3" colSpan={2}>Weighted MAD</td>
                <td className="text-right pt-1 pl-2">{mad != null ? `${Math.round(mad)} pts` : 'n/a'}</td>
              </tr>
              <tr className="font-semibold">
                <td className="pt-0.5 pr-3 font-normal text-gray-500" colSpan={2}>
                  {mad != null ? `100 × (1 − MAD ${Math.round(mad)} ÷ 50) =` : 'Score'}
                </td>
                <td className="text-right pt-0.5 pl-2">
                  {value.stabilityScore != null ? `${Math.round(value.stabilityScore)}/100` : 'n/a'}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-1.5 text-gray-500">Score guide: 75–100 very consistent · 50–74 some variation · 0–49 changes a lot by domain.</p>
        </div>
      )}
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

  // --- Evidence weight tooltip ---
  const evidenceWeightTooltip = (
    <div className="space-y-2">
      <p>
        <strong>What it means:</strong> The total number of scenario-level decisions recorded
        for this model and value in this domain — prioritized, deprioritized, and neutral outcomes
        all count. One scenario = one decision = one unit of evidence.
      </p>
      <p>
        Each vignette runs 25 scenarios, so the count tends to land near multiples of 25.
        Multiple runs of the same vignette add to the total.
      </p>
      <p>
        Domains with more evidence get more weight when calculating the pooled win rate —
        a domain with 2000 decisions pulls the average twice as hard as one with 1000.
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
                Weighted mean across the eligible domains shown below.
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
                          <span>Evidence weight</span>
                          <Tooltip
                            content={evidenceWeightTooltip}
                            position="bottom"
                            variant="light"
                            className="w-72 px-3 py-3 text-xs leading-relaxed normal-case tracking-normal font-normal"
                          >
                            <Button type="button" variant="ghost" size="icon" className="cursor-help p-0 min-w-0 min-h-0 h-4 w-4 text-gray-400 hover:text-gray-600 hover:bg-transparent" aria-label="What evidence weight means">
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
