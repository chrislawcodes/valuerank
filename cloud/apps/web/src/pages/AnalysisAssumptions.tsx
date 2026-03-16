import { AnalysisPanel } from '../components/assumptions/AnalysisPanel';
import { TransitionNotice } from '../components/ui/TransitionNotice';

export function AnalysisAssumptions() {
  return (
    <div className="space-y-6">
      <TransitionNotice
        eyebrow="Validation Compatibility"
        title="This page remains live during the Validation migration"
        description="Validation is now the top-level home for methodology reporting. This detailed analysis view remains live, but execution should stay domain-scoped in Runs and reporting should start from Validation."
        links={[
          { label: 'Open Validation home', to: '/validation' },
          { label: 'Open validation run history', to: '/runs?runCategory=VALIDATION' },
        ]}
      />
      <div>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Analysis</h1>
        <p className="mt-1 text-sm text-gray-600">
          Backend-driven order-effect analysis for the locked assumption vignette set.
        </p>
      </div>

      <AnalysisPanel />
    </div>
  );
}
