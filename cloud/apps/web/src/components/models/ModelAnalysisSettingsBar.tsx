import { Button } from '../ui/Button';
import { CALCULATION_METHODS, type CalculationMethod } from './ModelSimilarityMetrics';

type DataSource = 'log-odds' | 'win-rate';

type ModelAnalysisSettingsBarProps = {
  dataSource: DataSource;
  onDataSourceChange: (value: DataSource) => void;
  similarityMethod: CalculationMethod;
  onSimilarityMethodChange: (value: CalculationMethod) => void;
};

const DATA_SOURCE_OPTIONS: Array<{ value: DataSource; label: string }> = [
  { value: 'log-odds', label: 'Log Odds' },
  { value: 'win-rate', label: 'Win Rate' },
];

export function ModelAnalysisSettingsBar({
  dataSource,
  onDataSourceChange,
  similarityMethod,
  onSimilarityMethodChange,
}: ModelAnalysisSettingsBarProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Analysis settings</p>
        <p className="text-sm text-gray-600">Affects all reports on this page.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
          <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Data source</span>
          <div className="inline-flex rounded-md border border-gray-200 bg-white p-1">
            {DATA_SOURCE_OPTIONS.map((option) => {
              const active = dataSource === option.value;
              return (
                <Button
                  key={option.value}
                  type="button"
                  variant={active ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => onDataSourceChange(option.value)}
                  className={`rounded-md px-3 py-1 text-xs font-medium min-h-0 ${
                    active ? 'bg-teal-600 text-white hover:bg-teal-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
          <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Similarity method</span>
          <div className="inline-flex rounded-md border border-gray-200 bg-white p-1">
            {CALCULATION_METHODS.map((option) => {
              const active = similarityMethod === option.value;
              return (
                <Button
                  key={option.value}
                  type="button"
                  variant={active ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => onSimilarityMethodChange(option.value)}
                  className={`rounded-md px-3 py-1 text-xs font-medium min-h-0 ${
                    active ? 'bg-teal-600 text-white hover:bg-teal-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
