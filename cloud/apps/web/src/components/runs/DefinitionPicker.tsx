import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import type { AvailableModel } from '../../api/operations/models';
import type { FinalTrialPlan } from '../../api/operations/final-trial';
import type { RunConditionGrid } from '../../api/operations/scenarios';

type DefinitionPickerProps = {
  samplePercentage: number;
  estimatedScenarios: number | null;
  isFinalTrial: boolean;
  isSpecificConditionTrial: boolean;
  isSubmitting: boolean;
  selectedConditionRowLevel: string | null;
  selectedConditionColLevel: string | null;
  selectedConditionScenarioIds: string[];
  conditionSelectionTouched: boolean;
  conditionGrid: RunConditionGrid | null;
  loadingConditionGrid: boolean;
  conditionGridError: Error | null;
  isConditionModalOpen: boolean;
  modalRowLevel: string | null;
  modalColLevel: string | null;
  finalTrialPlan: FinalTrialPlan | null;
  loadingFinalTrialPlan: boolean;
  models: AvailableModel[];
  onSampleChange: (value: number) => void;
  onCloseConditionModal: () => void;
  onImmediateConditionSelect: (rowLevel: string, colLevel: string, scenarioIds: string[]) => void;
};

const SAMPLE_OPTIONS = [
  { value: -2, label: 'Trial specific condition' },
  { value: 10, label: '10%' },
  { value: 100, label: '100%' },
  { value: -1, label: 'Final Trial' },
];

function sortLevels(levels: string[]): string[] {
  const deduped = Array.from(new Set(levels));
  return deduped.sort((left, right) => {
    const leftNum = Number(left);
    const rightNum = Number(right);
    const leftIsNum = Number.isFinite(leftNum);
    const rightIsNum = Number.isFinite(rightNum);

    if (leftIsNum && rightIsNum) {
      return leftNum - rightNum;
    }
    if (leftIsNum) {
      return -1;
    }
    if (rightIsNum) {
      return 1;
    }

    return left.localeCompare(right);
  });
}

function FinalTrialInfo({
  finalTrialPlan,
  loadingFinalTrialPlan,
  models,
}: {
  finalTrialPlan: FinalTrialPlan | null;
  loadingFinalTrialPlan: boolean;
  models: AvailableModel[];
}) {
  return (
    <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-md text-sm text-blue-800">
      <p className="font-medium mb-1">Adaptive Trial Strategy</p>
      <ul className="list-disc pl-4 space-y-1 text-xs text-blue-700">
        <li>Target: 10 trials per condition per AI.</li>
        <li>More Investigation: Adds 10 trials if score variability is marginal.</li>
        <li>Stops automatically if scores are stable or too chaotic.</li>
      </ul>
      {loadingFinalTrialPlan ? (
        <p className="mt-2 text-xs italic text-gray-500">Calculating plan...</p>
      ) : finalTrialPlan ? (
        <p className="mt-2 font-medium">
          Plan: {finalTrialPlan.totalJobs} total new jobs required across {finalTrialPlan.models.length} models.
        </p>
      ) : null}

      {finalTrialPlan && (
        <div className="mt-3 pt-2 border-t border-blue-200">
          {(() => {
            const investigations = finalTrialPlan.models.flatMap((modelPlan) =>
              modelPlan.conditions
                .filter((condition) => condition.status === 'MORE_INVESTIGATION')
                .map((condition) => ({
                  modelName: models.find((model) => model.id === modelPlan.modelId)?.displayName || modelPlan.modelId,
                  key: condition.conditionKey,
                  sem: condition.currentSEM,
                  needed: condition.neededSamples,
                }))
            );

            const initials = finalTrialPlan.models.flatMap((modelPlan) =>
              modelPlan.conditions
                .filter((condition) => condition.status === 'INSUFFICIENT_DATA')
                .map((condition) => ({
                  modelName: models.find((model) => model.id === modelPlan.modelId)?.displayName || modelPlan.modelId,
                  key: condition.conditionKey,
                  needed: condition.neededSamples,
                }))
            );

            const initialCount = initials.reduce((sum, item) => sum + item.needed, 0);
            const investCount = investigations.reduce((sum, item) => sum + item.needed, 0);

            return (
              <div className="space-y-3">
                {initialCount > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-blue-800 mb-1">
                      Initial Trials ({initialCount} jobs):
                    </p>
                    <p className="text-xs text-blue-600 mb-1">
                      Collecting baseline trial data (N &lt; 10) for {initials.length} conditions.
                    </p>
                    <details className="text-xs text-blue-500">
                      <summary className="cursor-pointer hover:text-blue-700">Show details</summary>
                      <div className="mt-1 max-h-20 overflow-y-auto pr-1 pl-2 border-l-2 border-blue-100">
                        <ul className="space-y-1">
                          {initials.map((item, index) => (
                            <li key={index} className="break-all">
                              <span className="font-medium">{item.modelName}</span>
                              <span className="mx-1">•</span>
                              {item.key} (+{item.needed})
                            </li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-blue-800 mb-1">
                    Extended Investigation ({investCount} jobs):
                  </p>
                  {investigations.length === 0 ? (
                    <p className="text-xs text-blue-600 italic">None (No marginal stability cases found)</p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto pr-1">
                      <ul className="space-y-1">
                        {investigations.map((item, index) => (
                          <li key={index} className="text-xs text-blue-700 break-all">
                            <span className="font-medium">{item.modelName}</span>
                            <span className="mx-1">•</span>
                            {item.key}
                            <span className="ml-1 text-blue-500">
                              (variability: {item.sem?.toFixed(3)}) → +{item.needed}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function ConditionGridModal({
  isOpen,
  loading,
  error,
  conditionGrid,
  modalRowLevel,
  modalColLevel,
  onClose,
  onImmediateConditionSelect,
}: {
  isOpen: boolean;
  loading: boolean;
  error: Error | null;
  conditionGrid: RunConditionGrid | null;
  modalRowLevel: string | null;
  modalColLevel: string | null;
  onClose: () => void;
  onImmediateConditionSelect: (rowLevel: string, colLevel: string, scenarioIds: string[]) => void;
}) {
  if (!isOpen) {
    return null;
  }

  const rowLevels = conditionGrid ? sortLevels(conditionGrid.rowLevels) : [];
  const colLevels = conditionGrid ? sortLevels(conditionGrid.colLevels) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-4xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="text-base font-medium text-gray-900">Select Trial Condition</h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            onClick={onClose}
            aria-label="Close condition selector"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-[70vh] overflow-auto px-4 py-3">
          {loading ? (
            <p className="text-sm text-gray-600">Loading condition grid...</p>
          ) : error ? (
            <p className="text-sm text-red-600">Failed to load condition grid: {error.message}</p>
          ) : !conditionGrid ? (
            <p className="text-sm text-gray-600">No condition grid is available for this vignette.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-gray-200 bg-gray-50 px-3 py-2" />
                  <th
                    colSpan={rowLevels.length}
                    className="border border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700"
                  >
                    {conditionGrid.attributeA}
                  </th>
                </tr>
                <tr>
                  <th className="border border-gray-200 bg-gray-100 px-3 py-2 text-left font-semibold text-gray-700">
                    {conditionGrid.attributeB}
                  </th>
                  {rowLevels.map((attributeALevel) => (
                    <th
                      key={attributeALevel}
                      className="border border-gray-200 bg-gray-100 px-3 py-2 text-left font-semibold text-gray-700"
                    >
                      {attributeALevel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colLevels.map((attributeBLevel) => (
                  <tr key={attributeBLevel}>
                    <th className="border border-gray-200 bg-gray-100 px-3 py-2 text-left font-semibold text-gray-700">
                      {attributeBLevel}
                    </th>
                    {rowLevels.map((attributeALevel) => {
                      const cell = conditionGrid.cells.find(
                        (item) => item.rowLevel === attributeALevel && item.colLevel === attributeBLevel
                      );
                      const isSelected = modalRowLevel === attributeALevel && modalColLevel === attributeBLevel;
                      const scenarioIds = cell?.scenarioIds ?? [];

                      return (
                        <td key={`${attributeALevel}-${attributeBLevel}`} className="border border-gray-200 p-0">
                          <Button
                            type="button"
                            variant="ghost"
                            className={`flex h-full w-full flex-col items-start gap-1 rounded-none border-2 px-3 py-2 text-left transition-colors ${isSelected
                              ? 'border-teal-600 bg-teal-200 text-teal-950 shadow-inner'
                              : 'bg-white text-gray-700 hover:bg-gray-50'
                              } ${scenarioIds.length === 0 ? 'cursor-not-allowed opacity-60' : ''}`}
                            onClick={() => onImmediateConditionSelect(attributeALevel, attributeBLevel, scenarioIds)}
                            disabled={scenarioIds.length === 0}
                          >
                            <span className="font-medium">n = {cell?.trialCount ?? 0}</span>
                          </Button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DefinitionPicker({
  samplePercentage,
  estimatedScenarios,
  isFinalTrial,
  isSpecificConditionTrial,
  isSubmitting,
  selectedConditionRowLevel,
  selectedConditionColLevel,
  selectedConditionScenarioIds,
  conditionSelectionTouched,
  conditionGrid,
  loadingConditionGrid,
  conditionGridError,
  isConditionModalOpen,
  modalRowLevel,
  modalColLevel,
  finalTrialPlan,
  loadingFinalTrialPlan,
  models,
  onSampleChange,
  onCloseConditionModal,
  onImmediateConditionSelect,
}: DefinitionPickerProps) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Trial Size
        </label>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_OPTIONS.map((option) => (
            // eslint-disable-next-line react/forbid-elements -- Toggle chip requires custom styling
            <button
              key={option.value}
              type="button"
              onClick={() => onSampleChange(option.value)}
              className={`px-3 py-2 text-sm rounded-md border transition-colors ${samplePercentage === option.value
                ? 'border-teal-500 bg-teal-50 text-teal-700'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isSubmitting}
            >
              {option.label}
            </button>
          ))}
        </div>

        {!isFinalTrial && estimatedScenarios !== null && (
          <p className="mt-2 text-sm text-gray-500">
            ~{estimatedScenarios} narrative{estimatedScenarios !== 1 ? 's' : ''} will be probed
          </p>
        )}

        {isSpecificConditionTrial && (
          <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
            {selectedConditionScenarioIds.length > 0 && conditionGrid ? (
              <p className="mt-2 text-sm text-teal-700">
                {conditionGrid.attributeA}, level {selectedConditionRowLevel} / {conditionGrid.attributeB}, level {selectedConditionColLevel}
              </p>
            ) : (
              <p className="text-sm text-gray-700">Choose one condition to run.</p>
            )}
            {selectedConditionScenarioIds.length === 0 && (
              <p className="mt-1 text-xs text-gray-500">
                Click <span className="font-medium">Trial specific condition</span> again to open the selector.
              </p>
            )}
            {selectedConditionScenarioIds.length === 0 && conditionSelectionTouched && (
              <p className="mt-2 text-sm text-red-600">[no condition selected]</p>
            )}
            {selectedConditionScenarioIds.length === 0 && !conditionSelectionTouched && conditionGridError && (
              <p className="mt-2 text-sm text-red-600">Failed to load condition grid: {conditionGridError.message}</p>
            )}
            {selectedConditionScenarioIds.length > 0 && conditionGridError && (
              <p className="mt-2 text-sm text-red-600">Failed to load condition grid: {conditionGridError.message}</p>
            )}
            {selectedConditionScenarioIds.length > 0 && !conditionGridError && (
              <p className="mt-1 text-xs text-gray-500">
                Click <span className="font-medium">Trial specific condition</span> again to change selection.
              </p>
            )}
          </div>
        )}

        {isFinalTrial && (
          <FinalTrialInfo
            finalTrialPlan={finalTrialPlan}
            loadingFinalTrialPlan={loadingFinalTrialPlan}
            models={models}
          />
        )}
      </div>

      <ConditionGridModal
        isOpen={isConditionModalOpen}
        loading={loadingConditionGrid}
        error={conditionGridError}
        conditionGrid={conditionGrid}
        modalRowLevel={modalRowLevel}
        modalColLevel={modalColLevel}
        onClose={onCloseConditionModal}
        onImmediateConditionSelect={onImmediateConditionSelect}
      />
    </>
  );
}
