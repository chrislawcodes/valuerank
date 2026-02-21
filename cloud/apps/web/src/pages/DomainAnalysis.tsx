import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { DominanceSection } from '../components/domains/DominanceSection';
import { ValuePrioritiesSection } from '../components/domains/ValuePrioritiesSection';
import { Button } from '../components/ui/Button';

function SectionPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-base font-medium text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-600">{description}</p>
      <p className="mt-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
        This section is being rolled out in stages and will appear here soon.
      </p>
    </section>
  );
}

export function DomainAnalysis() {
  const [showInterpretation, setShowInterpretation] = useState(true);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Domain Analysis</h1>
          <p className="mt-1 text-sm text-gray-600">
            Structured model-value analysis across priorities, ranking behavior, and similarity.
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
          <h2 className="text-sm font-semibold text-blue-900">How to read this page</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-blue-900">
            <li>Section 1 shows what each model prioritizes by value strengths.</li>
            <li>Section 2 ranks values and surfaces cyclical value relationships.</li>
            <li>Section 3 compares model profiles to find nearest neighbors and outliers.</li>
            <li>All charts currently use a curated snapshot and will be wired to live per-domain data.</li>
          </ul>
        </section>
      )}

      <ValuePrioritiesSection />
      <DominanceSection />
      <SectionPlaceholder
        title="3. Similarity and Differences"
        description="Pairwise model similarity matrix and nearest/farthest pairs."
      />
    </div>
  );
}
