import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import {
  ASSUMPTIONS_TEMP_ZERO_QUERY,
  LAUNCH_ASSUMPTIONS_TEMP_ZERO_MUTATION,
  type AssumptionsTempZeroQueryResult,
  type LaunchAssumptionsTempZeroResult,
  type TempZeroDecision,
  type TempZeroRow,
} from '../api/operations/assumptions';

function formatPercent(value: number | null): string {
  if (value === null) return 'n/a';
  return `${(value * 100).toFixed(1)}%`;
}

function formatInteger(value: number | null): string {
  if (value === null) return 'n/a';
  return new Intl.NumberFormat('en-US').format(value);
}

function formatCurrency(value: number | null): string {
  if (value === null) return 'n/a';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseAttributes(vignetteTitle: string): { attributeA: string; attributeB: string } {
  const match = vignetteTitle.match(/\((.+?)\s+vs\s+(.+?)\)$/);
  if (!match) {
    return { attributeA: 'n/a', attributeB: 'n/a' };
  }

  return {
    attributeA: match[1] ?? 'n/a',
    attributeB: match[2] ?? 'n/a',
  };
}

function parseConditionLevels(conditionKey: string): { levelA: string; levelB: string } {
  const match = conditionKey.match(/^(\d+)x(\d+)$/);
  if (!match) {
    return { levelA: conditionKey, levelB: conditionKey };
  }

  return {
    levelA: match[1] ?? 'n/a',
    levelB: match[2] ?? 'n/a',
  };
}

function extractTranscriptText(content: unknown): string {
  if (!content || typeof content !== 'object') {
    return '';
  }

  const turns = (content as { turns?: unknown }).turns;
  // Current assumptions transcripts are expected to use the turns array shape.
  // If that changes later, returning empty keeps the modal safe and makes the fallback explicit.
  if (!Array.isArray(turns)) {
    return '';
  }

  const messages: string[] = [];
  for (const turn of turns) {
    if (!turn || typeof turn !== 'object') continue;
    const turnObject = turn as Record<string, unknown>;
    const probePrompt = typeof turnObject.probePrompt === 'string' ? turnObject.probePrompt.trim() : '';
    const targetResponse = typeof turnObject.targetResponse === 'string' ? turnObject.targetResponse.trim() : '';
    const role = typeof turnObject.role === 'string' ? turnObject.role : '';
    const rawContent = typeof turnObject.content === 'string' ? turnObject.content.trim() : '';

    if (probePrompt !== '') messages.push(`Prompt\n${probePrompt}`);
    if (targetResponse !== '') messages.push(`Response\n${targetResponse}`);
    if (probePrompt === '' && targetResponse === '' && rawContent !== '') {
      messages.push(`${role || 'Message'}\n${rawContent}`);
    }
  }

  return messages.join('\n\n');
}

function groupRowsByVignette(rows: TempZeroRow[]): Array<{ vignetteId: string; vignetteTitle: string; rows: TempZeroRow[] }> {
  const groups = new Map<string, { vignetteId: string; vignetteTitle: string; rows: TempZeroRow[] }>();

  for (const row of rows) {
    const existing = groups.get(row.vignetteId);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    groups.set(row.vignetteId, {
      vignetteId: row.vignetteId,
      vignetteTitle: row.vignetteTitle,
      rows: [row],
    });
  }

  return Array.from(groups.values()).sort((left, right) => (
    left.vignetteTitle.localeCompare(right.vignetteTitle)
  ));
}

function groupRowsByModel(rows: TempZeroRow[]): Array<{ modelId: string; modelLabel: string; rows: TempZeroRow[] }> {
  const groups = new Map<string, { modelId: string; modelLabel: string; rows: TempZeroRow[] }>();

  for (const row of rows) {
    const existing = groups.get(row.modelId);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    groups.set(row.modelId, {
      modelId: row.modelId,
      modelLabel: row.modelLabel,
      rows: [row],
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((left, right) => (
        left.conditionKey.localeCompare(right.conditionKey, undefined, { numeric: true, sensitivity: 'base' })
      )),
    }))
    .sort((left, right) => left.modelLabel.localeCompare(right.modelLabel, undefined, { numeric: true, sensitivity: 'base' }));
}

function getMismatchSummary(rows: TempZeroRow[], matchedLabel: string): { text: string; toneClass: string } {
  const mismatchCount = rows.filter((row) => row.mismatchType === 'decision_flip').length;
  const missingTrialCount = rows.filter((row) => row.mismatchType === 'missing_trial').length;

  if (mismatchCount > 0) {
    return {
      text: `${mismatchCount} mismatch${mismatchCount === 1 ? '' : 'es'}`,
      toneClass: 'text-red-700',
    };
  }

  if (missingTrialCount === rows.length && rows.length > 0) {
    return {
      text: 'All pending',
      toneClass: 'text-amber-700',
    };
  }

  if (missingTrialCount > 0) {
    return {
      text: `${missingTrialCount} trial${missingTrialCount === 1 ? '' : 's'} missing`,
      toneClass: 'text-amber-700',
    };
  }

  return {
    text: matchedLabel,
    toneClass: 'text-gray-500',
  };
}

type SelectedTranscriptRow = {
  modelLabel: string;
  vignetteTitle: string;
  conditionKey: string;
  mismatchType: TempZeroRow['mismatchType'];
  decisions: TempZeroDecision[];
};

export function DomainAssumptions() {
  const [{ data, fetching, error }, reexecuteTempZeroQuery] = useQuery<AssumptionsTempZeroQueryResult>({
    query: ASSUMPTIONS_TEMP_ZERO_QUERY,
    requestPolicy: 'cache-and-network',
  });
  const [launchResult, executeLaunchTempZero] = useMutation<LaunchAssumptionsTempZeroResult>(
    LAUNCH_ASSUMPTIONS_TEMP_ZERO_MUTATION,
  );
  const [selectedRow, setSelectedRow] = useState<SelectedTranscriptRow | null>(null);
  const [isLaunchConfirmed, setIsLaunchConfirmed] = useState(false);
  const [launchFeedback, setLaunchFeedback] = useState<string | null>(null);

  const result = data?.assumptionsTempZero;
  const vignetteGroups = useMemo(
    () => groupRowsByVignette(result?.rows ?? []),
    [result?.rows],
  );
  const launchError = launchResult.error?.message ?? null;

  const handleLaunchTempZero = async () => {
    setLaunchFeedback(null);
    const response = await executeLaunchTempZero({});
    if (response.error) {
      return;
    }
    const payload = response.data?.launchAssumptionsTempZero;
    if (!payload) {
      setLaunchFeedback('Temp=0 confirmation launch returned no data.');
      return;
    }

    const failedSuffix = payload.failedVignetteIds.length > 0
      ? ` ${payload.failedVignetteIds.length} vignette${payload.failedVignetteIds.length === 1 ? '' : 's'} failed to launch.`
      : '';
    setLaunchFeedback(
      `Started ${payload.startedRuns} dedicated temp=0 run${payload.startedRuns === 1 ? '' : 's'} across ${payload.totalVignettes} locked vignette${payload.totalVignettes === 1 ? '' : 's'} using ${payload.modelCount} model${payload.modelCount === 1 ? '' : 's'}.${failedSuffix}`,
    );
    void reexecuteTempZeroQuery({ requestPolicy: 'network-only' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Assumptions</h1>
        <p className="mt-1 text-sm text-gray-600">
          Validate whether the current value-prioritization outputs are reliable enough to trust.
        </p>
      </div>

      {error && <ErrorMessage message={`Failed to load assumptions: ${error.message}`} />}

      {fetching && !result && <Loading text="Loading assumption checks..." />}

      {result && (
        <>
          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{result.preflight.title}</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Locked professional-domain vignette package for `#285`. This run always uses the same 5 vignettes with all 25 conditions each.
                </p>
              </div>
              <div className="text-xs text-gray-500">
                Generated {new Date(result.generatedAt).toLocaleString()}
              </div>
            </div>

            {result.note && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {result.note}
              </div>
            )}

            <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              This phase reads only dedicated runs tagged for <code>temp_zero_determinism</code>. If none have completed yet, the table below will stay empty until you launch the locked package and those runs finish.
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Projected Prompts</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {formatInteger(result.preflight.projectedPromptCount)}
                </div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Projected Comparisons</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {formatInteger(result.preflight.projectedComparisons)}
                </div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Selected Signature</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {result.preflight.selectedSignature ?? 'n/a'}
                </div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Estimated Cost</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {formatCurrency(result.preflight.estimatedCostUsd)}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Estimated Input Tokens</div>
                <div className="mt-1 text-base font-semibold text-gray-900">
                  {formatInteger(result.preflight.estimatedInputTokens)}
                </div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Estimated Output Tokens</div>
                <div className="mt-1 text-base font-semibold text-gray-900">
                  {formatInteger(result.preflight.estimatedOutputTokens)}
                </div>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Vignette</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Conditions</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {result.preflight.vignettes.map((vignette) => (
                    <tr key={vignette.vignetteId}>
                      <td className="px-3 py-3 font-medium text-gray-900">{vignette.title}</td>
                      <td className="px-3 py-3 text-gray-700">{vignette.conditionCount}</td>
                      <td className="px-3 py-3 text-gray-600">{vignette.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <label className="flex items-start gap-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-700 focus:ring-teal-500"
                  checked={isLaunchConfirmed}
                  onChange={(event) => setIsLaunchConfirmed(event.target.checked)}
                />
                <span>
                  I reviewed the locked temp=0 vignette package above and want to launch the dedicated confirmation run for this exact set.
                </span>
              </label>
              <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                <Button
                  type="button"
                  onClick={() => { void handleLaunchTempZero(); }}
                  disabled={!isLaunchConfirmed || launchResult.fetching}
                >
                  {launchResult.fetching ? 'Launching Temp=0 Runs...' : 'Launch Temp=0 Confirmation Run'}
                </Button>
                {!isLaunchConfirmed && (
                  <span className="text-xs text-gray-500">
                    Confirm the preflight review before launching.
                  </span>
                )}
              </div>
              {launchError && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {launchError}
                </div>
              )}
              {launchFeedback && !launchError && (
                <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  {launchFeedback}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{result.summary.title}</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Exact repeat agreement for each `(model, vignette, condition)` group using the latest three matching temp=0 trials.
                </p>
              </div>
              <div
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                  result.summary.status === 'INSUFFICIENT_DATA'
                    ? 'bg-gray-100 text-gray-700'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {result.summary.status === 'INSUFFICIENT_DATA' ? 'Insufficient Data' : 'Computed'}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Match Rate</div>
                <div className="mt-1 text-base font-semibold text-gray-900">{formatPercent(result.summary.matchRate)}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Difference Rate</div>
                <div className="mt-1 text-base font-semibold text-gray-900">{formatPercent(result.summary.differenceRate)}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Models Tested</div>
                <div className="mt-1 text-base font-semibold text-gray-900">{formatInteger(result.summary.modelsTested)}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Vignettes Tested</div>
                <div className="mt-1 text-base font-semibold text-gray-900">{formatInteger(result.summary.vignettesTested)}</div>
              </div>
            </div>

            {(result.summary.worstModelId || result.summary.worstModelMatchRate !== null) && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Worst model: {result.summary.worstModelLabel ?? result.summary.worstModelId ?? 'n/a'}
                {result.summary.worstModelMatchRate !== null && (
                  <span> ({formatPercent(result.summary.worstModelMatchRate)} match)</span>
                )}
              </div>
            )}

            <div className="mt-5 space-y-4">
              {vignetteGroups.map((group) => {
                const { attributeA, attributeB } = parseAttributes(group.vignetteTitle);
                const modelGroups = groupRowsByModel(group.rows);
                const groupMismatchSummary = getMismatchSummary(group.rows, 'No mismatches');

                return (
                  <details key={group.vignetteId} className="rounded-lg border border-gray-200">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-gray-50 px-4 py-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{group.vignetteTitle}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {modelGroups.length} model{modelGroups.length === 1 ? '' : 's'} · {group.rows.length} condition row{group.rows.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      <div className={`text-xs font-medium ${groupMismatchSummary.toneClass}`}>
                        {groupMismatchSummary.text}
                      </div>
                    </summary>
                    <div className="space-y-3 border-t border-gray-200 bg-white p-4">
                      {modelGroups.map((modelGroup) => {
                        const modelMismatchSummary = getMismatchSummary(modelGroup.rows, 'All matched');

                        return (
                          <details key={modelGroup.modelId} className="rounded-lg border border-gray-200">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-white px-4 py-3">
                              <div className="text-sm font-medium text-gray-900">{modelGroup.modelLabel}</div>
                              <div className={`text-xs font-medium ${modelMismatchSummary.toneClass}`}>
                                {modelMismatchSummary.text}
                              </div>
                            </summary>
                            <div className="overflow-x-auto border-t border-gray-200">
                              <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600">Condition</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600">{attributeA}</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600">{attributeB}</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600">Batch 1</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600">Batch 2</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600">Batch 3</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                  {modelGroup.rows.map((row) => {
                                    const { levelA, levelB } = parseConditionLevels(row.conditionKey);

                                    return (
                                      <tr
                                        key={`${row.modelId}-${row.vignetteId}-${row.conditionKey}`}
                                        className={`cursor-pointer transition-colors ${
                                          row.mismatchType === 'decision_flip' ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-teal-50'
                                        }`}
                                        onClick={() => setSelectedRow({
                                          modelLabel: row.modelLabel,
                                          vignetteTitle: row.vignetteTitle,
                                          conditionKey: row.conditionKey,
                                          mismatchType: row.mismatchType,
                                          decisions: row.decisions,
                                        })}
                                      >
                                        <td className="px-3 py-2 text-gray-900">{row.conditionKey}</td>
                                        <td className="px-3 py-2 text-gray-700">{levelA}</td>
                                        <td className="px-3 py-2 text-gray-700">{levelB}</td>
                                        <td className="px-3 py-2 text-gray-700">{row.batch1 ?? 'n/a'}</td>
                                        <td className="px-3 py-2 text-gray-700">{row.batch2 ?? 'n/a'}</td>
                                        <td className="px-3 py-2 text-gray-700">{row.batch3 ?? 'n/a'}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-dashed border-gray-300 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">`#286` Order invariance</h2>
            <p className="mt-2 text-sm text-gray-600">
              Placeholder for the flipped-order comparison. This chunk only implements `#285`.
            </p>
          </section>

          <section className="rounded-lg border border-dashed border-gray-300 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">`#287` Job-title invariance</h2>
            <p className="mt-2 text-sm text-gray-600">
              Placeholder for the generic-title rewrite comparison. This chunk only implements `#285`.
            </p>
          </section>
        </>
      )}

      <Modal
        isOpen={selectedRow !== null}
        onClose={() => setSelectedRow(null)}
        title={selectedRow ? `${selectedRow.modelLabel} · ${selectedRow.vignetteTitle}` : undefined}
        size="2xl"
      >
        {selectedRow && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              Condition: {selectedRow.conditionKey}
            </div>
            {selectedRow.mismatchType === 'missing_trial' && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                This condition needs more runs before all three batches are available. Existing transcript data is shown below.
              </div>
            )}
            {selectedRow.decisions.map((decision) => (
              <div key={decision.label} className="rounded-lg border border-gray-200">
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="text-sm font-semibold text-gray-900">
                    {decision.label} · Decision code {decision.decision ?? 'n/a'}
                  </div>
                  {decision.transcriptId && (
                    <div className="mt-1 text-xs text-gray-500">{decision.transcriptId}</div>
                  )}
                </div>
                <div className="p-4">
                  <pre className="whitespace-pre-wrap break-words text-sm text-gray-700">
                    {extractTranscriptText(decision.content) || 'Transcript not available for this batch.'}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
