import { OrderEffectPanel } from '../components/assumptions/OrderEffectPanel';
import { TransitionNotice } from '../components/ui/TransitionNotice';

export function OrderEffectAssumptions() {
  return (
    <div className="space-y-6">
      <TransitionNotice
        eyebrow="Validation Compatibility"
        title="Legacy validation view"
        description="This old v1 page remains accessible during migration. Use it when you need the legacy assumptions workflow, but prefer Validation for reporting and domain Runs for new validation launches."
        links={[
          { label: 'Open Validation home', to: '/validation' },
          { label: 'Open validation run history', to: '/runs?runCategory=VALIDATION' },
        ]}
      />
      <div>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Analysis (old v1)</h1>
        <p className="mt-1 text-sm text-gray-600">
          Legacy order-effect page preserved during migration to the backend-driven Analysis view.
        </p>
      </div>

      <OrderEffectPanel />
    </div>
  );
}
