import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { BTChart } from '../components/domains/BTChart';
import { Button } from '../components/ui/Button';

export function DomainAnalysis() {
  const [showInterpretation, setShowInterpretation] = useState(true);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Domain Analysis</h1>
          <p className="mt-1 text-sm text-gray-600">
            Cross-model Bradley-Terry analysis for value preferences across models.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={() => setShowInterpretation((current) => !current)}
          aria-expanded={showInterpretation}
          aria-controls="domain-analysis-interpretation"
        >
          {showInterpretation ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
          {showInterpretation ? 'Hide interpretation guide' : 'Show interpretation guide'}
        </Button>
      </div>

      {showInterpretation && (
        <section id="domain-analysis-interpretation" className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <h2 className="text-sm font-semibold text-blue-900">How to interpret this chart</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-blue-900">
            <li>Each row is a model and each column is a Schwartz value.</li>
            <li>Cell number is Bradley-Terry log strength. Higher means that value is selected more often by that model.</li>
            <li>Corner badge is rank within that model (<code>1</code> is most favored for that model).</li>
            <li>Use <code>SORT BY</code> to compare models on one value at a time and quickly find outliers.</li>
            <li>Quadrant color bars label Schwartz higher-order groups to help read broader value orientation.</li>
          </ul>
          <p className="mt-3 text-xs text-blue-800">
            Current chart is a curated snapshot. Dynamic per-domain fetching and filtering will be wired in a follow-up.
          </p>
        </section>
      )}

      {/* TODO: Replace static chart snapshot with domain-scoped API-backed data. */}
      <BTChart />
    </div>
  );
}
