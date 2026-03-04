import { OrderEffectPanel } from '../components/assumptions/OrderEffectPanel';

export function OrderEffectAssumptions() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Order Effect</h1>
        <p className="mt-1 text-sm text-gray-600">
          Compare the same value pair in both slot orders to see whether position changes the outcome.
        </p>
      </div>

      <OrderEffectPanel />
    </div>
  );
}
