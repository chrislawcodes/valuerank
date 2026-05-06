import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { type ModelEntry } from '../../data/domainAnalysisData';
import { Button } from '../ui/Button';
import { ValuePrioritiesHelpPanel } from './ValuePrioritiesHelpPanel';
import { ValuePrioritiesTable } from './ValuePrioritiesTable';
import { DISPLAY_METRICS, type DisplayMetric } from './valuePrioritiesMetric';

type ValuePrioritiesSectionProps = {
  models: ModelEntry[];
  selectedDomainId: string;
  selectedSignature: string | null;
  isReadOnly?: boolean;
  showStabilityDots?: boolean;
};

export function ValuePrioritiesSection({
  models,
  selectedDomainId,
  selectedSignature,
  isReadOnly = false,
  showStabilityDots = false,
}: ValuePrioritiesSectionProps) {
  const [showSectionHelp, setShowSectionHelp] = useState(false);
  const [displayMetric, setDisplayMetric] = useState<DisplayMetric>('winRate');

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-medium text-gray-900">Win Rate by Values by Model</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSectionHelp((v) => !v)}
              className="h-8 w-8 text-gray-500 hover:text-gray-700"
              aria-label={showSectionHelp ? 'Hide explanation' : 'Show explanation'}
            >
              {showSectionHelp ? <X className="h-8 w-8" /> : <HelpCircle className="h-8 w-8" />}
            </Button>
          </div>
          <p className="text-sm text-gray-600">Which values each model favors most and least.</p>
          {showSectionHelp && <ValuePrioritiesHelpPanel />}
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Cell metric</span>
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              {DISPLAY_METRICS.map((metric) => (
                <Button
                  key={metric.value}
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={displayMetric === metric.value}
                  onClick={() => setDisplayMetric(metric.value)}
                  className={
                    displayMetric === metric.value
                      ? 'rounded-md bg-white px-3 py-1.5 text-sm font-medium text-teal-800 shadow-sm ring-1 ring-teal-200'
                      : 'rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900'
                  }
                >
                  {metric.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ValuePrioritiesTable
        models={models}
        selectedDomainId={selectedDomainId}
        selectedSignature={selectedSignature}
        isReadOnly={isReadOnly}
        showStabilityDots={showStabilityDots}
        displayMetric={displayMetric}
      />
    </section>
  );
}
