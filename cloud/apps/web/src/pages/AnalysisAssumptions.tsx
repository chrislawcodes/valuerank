import { AnalysisPanel } from '../components/assumptions/AnalysisPanel';
import { TransitionNotice } from '../components/ui/TransitionNotice';

export function AnalysisAssumptions() {
  return (
    <div className="space-y-6">
      <TransitionNotice
        eyebrow="Legacy Analysis"
        title="This page keeps the legacy assumptions analysis view"
        description="The paired-vignette single/paired toggle now lives on the run analysis page. This screen remains available for the older assumptions workflow."
      />

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Vignette Analysis</h1>
          <p className="mt-1 text-sm text-gray-600">
            Review the legacy assumptions analysis view here. For the new single/paired mode switch, use the run analysis page.
          </p>
        </div>
      </div>

      <AnalysisPanel />
    </div>
  );
}
