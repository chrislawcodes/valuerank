import { useState } from 'react';
import { useQuery } from 'urql';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import { ErrorMessage } from '../ui/ErrorMessage';
import {
  TEMP_ZERO_VERIFICATION_REPORT_QUERY,
  type TempZeroVerificationReportQueryResult,
  type TempZeroVerificationReportQueryVariables,
} from '../../api/operations/temp-zero-verification';

function formatPercent(value: number | null): string {
  if (value === null) return 'n/a';
  return `${value.toFixed(1)}%`;
}

function formatFingerprintStablePercent(driftPct: number | null): string {
  if (driftPct === null) return 'n/a';
  return `${(100 - driftPct).toFixed(1)}%`;
}

function copyReportToClipboard(report: NonNullable<TempZeroVerificationReportQueryResult['tempZeroVerificationReport']>) {
  const headers = ['Model', 'Transcripts', 'Adapter Mode', 'Prompt Hash Stable', 'Fingerprint Stable', 'Decision Match'];
  const rows = report.models.map((m) => [
    m.modelId,
    String(m.transcriptCount),
    m.adapterModes.length > 0 ? m.adapterModes.join(', ') : 'n/a',
    formatPercent(m.promptHashStabilityPct),
    formatFingerprintStablePercent(m.fingerprintDriftPct),
    formatPercent(m.decisionMatchRatePct),
  ]);
  const text = [headers, ...rows].map((row) => row.join('\t')).join('\n');
  void navigator.clipboard.writeText(text);
}

export function TempZeroVerification() {
  const [fetchCount, setFetchCount] = useState(0);
  const [days, setDays] = useState(30);
  const [copied, setCopied] = useState(false);
  const [{ data, fetching, error }] = useQuery<
    TempZeroVerificationReportQueryResult,
    TempZeroVerificationReportQueryVariables
  >({
    query: TEMP_ZERO_VERIFICATION_REPORT_QUERY,
    variables: { days },
    pause: fetchCount === 0,
    requestPolicy: 'network-only',
  });

  const report = data?.tempZeroVerificationReport;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Temp=0 Verification Report</h2>
          {report ? (
            <p className="mt-1 text-sm text-gray-600">
              Per-model stability metrics from the last {report.daysLookedBack} days of temp=0 transcripts. {report.transcriptCount} transcripts analyzed.
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-600">
              Generate a per-model stability report from recent temp=0 transcripts.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span>Days</span>
            <select
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              disabled={fetching}
            >
              {[7, 14, 30, 90].map((option) => (
                <option key={option} value={option}>
                  {option} days
                </option>
              ))}
            </select>
          </label>
          <Button type="button" onClick={() => setFetchCount((c) => c + 1)} disabled={fetching}>
            {fetchCount === 0 ? 'Generate Verification Report' : 'Refresh'}
          </Button>
        </div>
      </div>

      {fetching && (
        <div className="mt-4">
          <Loading size="sm" text="Loading..." />
        </div>
      )}

      {error && (
        <div className="mt-4">
          <ErrorMessage message={error.message} />
        </div>
      )}

      {report && !fetching && !error && (
        <div className="mt-5 overflow-x-auto">
          <div className="mb-2 flex justify-end">
            <Button
              type="button"
              onClick={() => {
                copyReportToClipboard(report);
                setCopied(true);
                setTimeout(() => { setCopied(false); }, 2000);
              }}
            >
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </Button>
          </div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Model</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Transcripts</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Adapter Mode</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Prompt Hash Stable</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Fingerprint Stable</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Decision Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {report.models.map((model) => (
                <tr key={model.modelId}>
                  <td className="px-3 py-3 font-medium text-gray-900">{model.modelId}</td>
                  <td className="px-3 py-3 text-gray-700">{model.transcriptCount}</td>
                  <td className="px-3 py-3 text-gray-700">
                    {model.adapterModes.length > 0 ? model.adapterModes.join(', ') : 'n/a'}
                  </td>
                  <td className="px-3 py-3 text-gray-700">{formatPercent(model.promptHashStabilityPct)}</td>
                  <td className="px-3 py-3 text-gray-700">{formatFingerprintStablePercent(model.fingerprintDriftPct)}</td>
                  <td className="px-3 py-3 text-gray-700">{formatPercent(model.decisionMatchRatePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
