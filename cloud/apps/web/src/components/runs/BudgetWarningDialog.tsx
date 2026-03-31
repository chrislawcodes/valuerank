/**
 * Budget Warning Dialog
 *
 * Non-blocking soft warning shown before starting a run when one or more
 * providers would be overdrawn. The user can still proceed.
 */

import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';

export type OverdraftProvider = {
  name: string;
  displayName: string;
  estimatedCost: number;
  balance: number;
};

type BudgetWarningDialogProps = {
  overdraftProviders: OverdraftProvider[];
  onProceed: () => void;
  onCancel: () => void;
};

function formatDollars(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function BudgetWarningDialog({
  overdraftProviders,
  onProceed,
  onCancel,
}: BudgetWarningDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-medium text-gray-900">Budget Warning</h3>
            <p className="text-sm text-gray-500 mt-1">
              This run may exceed your budget for the following providers:
            </p>
          </div>
        </div>

        <div className="border border-yellow-200 rounded-lg overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-yellow-50 text-left">
                <th className="px-3 py-2 text-xs font-medium text-yellow-800">Provider</th>
                <th className="px-3 py-2 text-xs font-medium text-yellow-800 text-right">
                  Est. Cost
                </th>
                <th className="px-3 py-2 text-xs font-medium text-yellow-800 text-right">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-yellow-100">
              {overdraftProviders.map((provider) => (
                <tr key={provider.name}>
                  <td className="px-3 py-2 text-gray-700">{provider.displayName}</td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {formatDollars(provider.estimatedCost)}
                  </td>
                  <td className="px-3 py-2 text-right text-red-600 font-medium">
                    {formatDollars(provider.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          You can proceed anyway or cancel to adjust your budget in Settings → Models.
        </p>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={onProceed}>
            Proceed Anyway
          </Button>
        </div>
      </div>
    </div>
  );
}
