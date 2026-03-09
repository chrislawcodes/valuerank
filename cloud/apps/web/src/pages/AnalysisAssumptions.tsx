import { AnalysisPanel } from '../components/assumptions/AnalysisPanel';

export function AnalysisAssumptions() {
  return (
    <div className="space-y-6">
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
