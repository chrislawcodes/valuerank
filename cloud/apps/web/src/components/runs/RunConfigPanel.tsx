type RunConfigPanelProps = {
  temperatureInput: string;
  samplesPerScenario: number;
  estimatedScenarios: number | null;
  selectedModelCount: number;
  totalJobs: number | null;
  isSubmitting: boolean;
  onTemperatureChange: (value: string) => void;
  onSamplesPerScenarioChange: (value: number) => void;
};

const SAMPLES_PER_SCENARIO_OPTIONS = [
  { value: 1, label: '1 (standard)' },
  { value: 3, label: '3' },
  { value: 5, label: '5' },
  { value: 10, label: '10' },
];

export function RunConfigPanel({
  temperatureInput,
  samplesPerScenario,
  estimatedScenarios,
  selectedModelCount,
  totalJobs,
  isSubmitting,
  onTemperatureChange,
  onSamplesPerScenarioChange,
}: RunConfigPanelProps) {
  return (
    <>
      <div>
        <label htmlFor="temperature" className="block text-sm font-medium text-gray-700 mb-2">
          Temperature
        </label>
        <input
          id="temperature"
          type="number"
          min={0}
          max={2}
          step={0.1}
          value={temperatureInput}
          onChange={(event) => onTemperatureChange(event.target.value)}
          placeholder="default"
          disabled={isSubmitting}
          className="w-48 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-50"
        />
        <p className="mt-2 text-xs text-gray-500">Leave blank to use provider default.</p>
      </div>

      <div className="p-4 bg-gray-50 rounded-lg space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Trials per Vignette
          </label>
          <div className="flex flex-wrap gap-2">
            {SAMPLES_PER_SCENARIO_OPTIONS.map((option) => (
              // eslint-disable-next-line react/forbid-elements -- Toggle chip requires custom styling
              <button
                key={option.value}
                type="button"
                onClick={() => onSamplesPerScenarioChange(option.value)}
                className={`px-3 py-2 text-sm rounded-md border transition-colors ${samplesPerScenario === option.value
                  ? 'border-teal-500 bg-teal-50 text-teal-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={isSubmitting}
              >
                {option.label}
              </button>
            ))}
          </div>
          {samplesPerScenario > 1 && totalJobs !== null && (
            <p className="mt-2 text-sm text-gray-500">
              {totalJobs} total probes ({estimatedScenarios} vignettes × {selectedModelCount} models × {samplesPerScenario} trials)
            </p>
          )}
        </div>
      </div>
    </>
  );
}
