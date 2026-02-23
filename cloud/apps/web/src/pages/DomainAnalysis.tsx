import { DominanceSection } from '../components/domains/DominanceSection';
import { SimilaritySection } from '../components/domains/SimilaritySection';
import { ValuePrioritiesSection } from '../components/domains/ValuePrioritiesSection';
import { DOMAIN_ANALYSIS_UNAVAILABLE_MODELS } from '../data/domainAnalysisData';

export function DomainAnalysis() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Domain Analysis</h1>
        <p className="mt-1 text-sm text-gray-600">
          Structured model-value analysis across priorities, ranking behavior, and similarity.
        </p>
      </div>

      <ValuePrioritiesSection />
      <DominanceSection />
      <SimilaritySection />

      {DOMAIN_ANALYSIS_UNAVAILABLE_MODELS.length > 0 && (
        <footer className="text-xs text-gray-500">
          <p className="font-medium text-gray-600">Data availability note</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {DOMAIN_ANALYSIS_UNAVAILABLE_MODELS.map((model) => (
              <li key={model.model}>
                {model.label}: {model.reason} This model is excluded from analysis tables and graph selectors.
              </li>
            ))}
          </ul>
        </footer>
      )}
    </div>
  );
}
