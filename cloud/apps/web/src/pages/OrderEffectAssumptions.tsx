import { OrderEffectPanel } from '../components/assumptions/OrderEffectPanel';

export function OrderEffectAssumptions() {
  return (
    <div className="space-y-6">
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
