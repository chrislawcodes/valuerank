import { formatCost, type DomainTrialCellStatus } from './helpers';

type TrialGridTableProps = {
  loading: boolean;
  models: Array<{ modelId: string; label: string }>;
  vignettes: Array<{
    definitionId: string;
    definitionName: string;
    definitionVersion: number;
    signature?: string;
    scenarioCount: number;
  }>;
  cellEstimates: Map<string, number>;
  getCellStatus: (definitionId: string, modelId: string) => DomainTrialCellStatus;
};

export function TrialGridTable({
  loading,
  models,
  vignettes,
  cellEstimates,
  getCellStatus,
}: TrialGridTableProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 overflow-auto">
      {loading ? (
        <div className="text-sm text-gray-600">Loading batch plan...</div>
      ) : (
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-gray-600 border-b border-gray-200">
              <th className="py-2 pr-3">Vignette</th>
              <th className="py-2 pr-3">Conditions per batch</th>
              <th className="py-2 pr-3">Batches</th>
              <th className="py-2 pr-3">Projected cost</th>
              <th className="py-2 pr-3">Batch coverage</th>
            </tr>
          </thead>
          <tbody>
            {vignettes.map((vignette) => {
              const projectedBatchCost = models.reduce(
                (sum, model) => sum + (cellEstimates.get(`${vignette.definitionId}::${model.modelId}`) ?? 0),
                0,
              );
              const statuses = models.map((model) => getCellStatus(vignette.definitionId, model.modelId));
              const completed = statuses.filter((status) => status.runStatus?.status === 'COMPLETED').length;
              const active = statuses.filter((status) => ['PENDING', 'RUNNING', 'SUMMARIZING', 'PAUSED'].includes(status.runStatus?.status ?? '')).length;
              const failed = statuses.filter((status) => ['FAILED', 'CANCELLED'].includes(status.runStatus?.status ?? '')).length;
              const idle = statuses.length - completed - active - failed;

              return (
                <tr key={vignette.definitionId} className="border-b border-gray-100 align-top">
                  <td className="py-3 pr-3">
                    <div className="font-medium text-gray-900">{vignette.definitionName}</div>
                    <div className="text-xs text-gray-500">{vignette.signature ?? `v${vignette.definitionVersion}`}</div>
                  </td>
                  <td className="py-3 pr-3 text-gray-700">
                    <div>{vignette.scenarioCount} condition{vignette.scenarioCount === 1 ? '' : 's'}</div>
                    <div className="text-xs text-gray-500">Each batch runs all configured conditions for this vignette.</div>
                    {vignette.scenarioCount <= 1 && (
                      <div className="text-xs text-amber-700">This vignette only has 1 configured condition right now.</div>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-gray-700">{models.length}</td>
                  <td className="py-3 pr-3 text-gray-700">{formatCost(projectedBatchCost)}</td>
                  <td className="py-3 pr-3 text-gray-700">
                    <div className="text-xs text-gray-700">{completed} complete · {active} active · {failed} failed · {idle} not started</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
