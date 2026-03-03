import { useRef, useState } from 'react';
import { useQuery, useMutation } from 'urql';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import { ErrorMessage } from '../ui/ErrorMessage';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import {
  TEMP_ZERO_VERIFICATION_REPORT_QUERY,
  type TempZeroVerificationReportQueryResult,
  type TempZeroVerificationReportQueryVariables,
} from '../../api/operations/temp-zero-verification';
import {
  LAUNCH_ASSUMPTIONS_TEMP_ZERO_MUTATION,
  type LaunchAssumptionsTempZeroResult,
  type LaunchAssumptionsTempZeroVariables,
} from '../../api/operations/assumptions';

function formatPercent(value: number | null): string {
  if (value === null) return 'n/a';
  return `${value.toFixed(1)}%`;
}

function formatFingerprintStablePercent(driftPct: number | null): string {
  if (driftPct === null) return 'n/a';
  return `${(100 - driftPct).toFixed(1)}%`;
}

export function TempZeroVerification() {
  const [launchFeedback, setLaunchFeedback] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [launchResult, executeLaunch] = useMutation<LaunchAssumptionsTempZeroResult, LaunchAssumptionsTempZeroVariables>(
    LAUNCH_ASSUMPTIONS_TEMP_ZERO_MUTATION,
  );

  const handleRerun = async () => {
    setLaunchFeedback(null);
    const response = await executeLaunch({ force: true });
    if (response.error != null) {
      setLaunchFeedback(`Launch failed: ${response.error.message}`);
      return;
    }
    const payload = response.data?.launchAssumptionsTempZero;
    if (payload == null) {
      setLaunchFeedback('Launch returned no data.');
      return;
    }
    setLaunchFeedback(
      `Started ${payload.startedRuns} run(s) across ${payload.totalVignettes} vignettes using ${payload.modelCount} model(s). Refresh the report once runs complete.`,
    );
  };

  const [{ data, fetching, error }] = useQuery<
    TempZeroVerificationReportQueryResult,
    TempZeroVerificationReportQueryVariables
  >({
    query: TEMP_ZERO_VERIFICATION_REPORT_QUERY,
    requestPolicy: 'cache-and-network',
  });

  const report = data?.tempZeroVerificationReport;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Temp=0 Verification Report</h2>
          {report ? (
            <p className="mt-1 text-sm text-gray-600">
              Per-model stability metrics from the most recent temp=0 execution batch. {report.transcriptCount} transcripts analyzed.
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-600">
              Generate a per-model stability report from recent temp=0 transcripts.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="button" onClick={() => { void handleRerun(); }} disabled={launchResult.fetching}>
            {launchResult.fetching ? 'Re-running...' : 'Re-run Vignettes'}
          </Button>
        </div>
      </div>

      {launchFeedback != null && (
        <p className="mt-3 text-sm text-gray-600">{launchFeedback}</p>
      )}

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

      {report && !error && (
        <div className="mt-5 overflow-x-auto relative">
          <div className="mb-2 flex justify-end">
            <CopyVisualButton targetRef={tableRef} label="Temp=0 Report" />
          </div>
          <div ref={tableRef} className="inline-block bg-white p-3">
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
        </div>
      )}
    </section>
  );
}
