import { Button } from '../../ui/Button';
import {
  cellKey,
  formatCost,
  getCellTone,
  getStageText,
  type DomainTrialCellStatus,
} from './helpers';

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
  started: boolean;
  pendingRetryCell: string | null;
  isRetrying: boolean;
  safeMode: boolean;
  retryAutoPaused: boolean;
  getCellStatus: (definitionId: string, modelId: string) => DomainTrialCellStatus;
  onRetryCell: (definitionId: string, modelId: string) => void;
};

export function TrialGridTable({
  loading,
  models,
  vignettes,
  cellEstimates,
  started,
  pendingRetryCell,
  isRetrying,
  safeMode,
  retryAutoPaused,
  getCellStatus,
  onRetryCell,
}: TrialGridTableProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 overflow-auto">
      {loading ? (
        <div className="text-sm text-gray-600">Loading trial plan...</div>
      ) : (
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-gray-600 border-b border-gray-200">
              <th className="sticky left-0 bg-white py-2 pr-3 z-10">Model \ Vignette</th>
              {vignettes.map((vignette) => (
                <th key={vignette.definitionId} className="py-2 px-3 min-w-[220px]">
                  <div className="font-medium text-gray-900">{vignette.definitionName}</div>
                  <div className="text-xs text-gray-500">
                    {vignette.signature ?? `v${vignette.definitionVersion}`} · {vignette.scenarioCount} conditions
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr key={model.modelId} className="border-b border-gray-100 align-top">
                <td className="sticky left-0 bg-white py-3 pr-3 z-10">
                  <div className="font-medium text-gray-900">{model.label}</div>
                  <div className="text-xs text-gray-500">{model.modelId}</div>
                </td>
                {vignettes.map((vignette) => {
                  const key = cellKey(vignette.definitionId, model.modelId);
                  const status = getCellStatus(vignette.definitionId, model.modelId);
                  const modelStatus = status.modelStatus;
                  const retryBusy = pendingRetryCell === key && isRetrying;
                  const tone = getCellTone(status);
                  return (
                    <td key={key} className="py-3 px-3">
                      <div className={`border rounded-md p-2 space-y-1 ${tone.container}`}>
                        <div className={`text-xs ${tone.text}`}>
                          Estimated cost: <span className="font-semibold">{formatCost(cellEstimates.get(key) ?? 0)}</span>
                        </div>
                        <div className={`text-xs ${tone.text}`}>{getStageText(status)}</div>
                        <div className={`text-[11px] ${tone.text}`}>
                          Gen: {modelStatus ? `${modelStatus.generationCompleted + modelStatus.generationFailed}/${modelStatus.generationTotal}` : '-'}
                        </div>
                        <div className={`text-[11px] ${tone.text}`}>
                          Sum: {modelStatus ? `${modelStatus.summarizationCompleted + modelStatus.summarizationFailed}/${modelStatus.summarizationTotal}` : '-'}
                        </div>
                        {modelStatus?.latestErrorMessage && (
                          <div className="text-[11px] text-red-800" title={modelStatus.latestErrorMessage}>
                            Error: {modelStatus.latestErrorMessage}
                          </div>
                        )}
                        {started && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="!h-7 !px-2 text-xs"
                            onClick={() => onRetryCell(vignette.definitionId, model.modelId)}
                            disabled={retryBusy || safeMode || retryAutoPaused}
                            title={safeMode ? 'Safe mode is enabled.' : retryAutoPaused ? 'Auto-paused due to high failure rate.' : undefined}
                          >
                            {retryBusy ? 'Retrying...' : 'Retry Cell'}
                          </Button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
