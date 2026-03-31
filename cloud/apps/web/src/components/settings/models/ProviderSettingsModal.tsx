/**
 * Provider Settings Modal
 *
 * Modal for editing provider rate limit settings and syncing budget balance.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import type { ProviderSettingsModalProps } from './types';

function formatSyncDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ProviderSettingsModal({
  provider,
  onClose,
  onSave,
}: ProviderSettingsModalProps) {
  const [requestsPerMinute, setRequestsPerMinute] = useState(provider.requestsPerMinute.toString());
  const [maxParallelRequests, setMaxParallelRequests] = useState(
    provider.maxParallelRequests.toString()
  );
  const [balanceInput, setBalanceInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const syncBalance =
      balanceInput.trim() !== '' && !Number.isNaN(parseFloat(balanceInput))
        ? parseFloat(balanceInput)
        : undefined;

    await onSave({
      requestsPerMinute: parseInt(requestsPerMinute, 10),
      maxParallelRequests: parseInt(maxParallelRequests, 10),
      syncBalance,
    });

    setIsSaving(false);
  };

  const rateLimitChanged =
    parseInt(requestsPerMinute, 10) !== provider.requestsPerMinute ||
    parseInt(maxParallelRequests, 10) !== provider.maxParallelRequests;

  const balanceChanged =
    balanceInput.trim() !== '' && !Number.isNaN(parseFloat(balanceInput));

  const hasChanges = rateLimitChanged || balanceChanged;

  const isValid =
    requestsPerMinute &&
    maxParallelRequests &&
    parseInt(requestsPerMinute, 10) > 0 &&
    parseInt(maxParallelRequests, 10) > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {provider.displayName} Settings
          </h3>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="text-gray-400 hover:text-gray-600 hover:bg-transparent"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Rate Limit (requests/minute)"
            type="number"
            min="1"
            max="10000"
            value={requestsPerMinute}
            onChange={(e) => setRequestsPerMinute(e.target.value)}
            required
          />

          <Input
            label="Max Parallel Requests"
            type="number"
            min="1"
            max="100"
            value={maxParallelRequests}
            onChange={(e) => setMaxParallelRequests(e.target.value)}
            required
          />

          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            <p>
              <strong>Rate Limit:</strong> Maximum API calls per minute to this provider.
            </p>
            <p className="mt-1">
              <strong>Parallel Requests:</strong> Maximum concurrent API calls. Set to 1 for
              conservative usage that avoids rate limit errors.
            </p>
          </div>

          {/* Budget Balance Section */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Set / Sync Balance ($)
              </label>
              {provider.balance !== null && provider.balance !== undefined && (
                <span className="text-xs text-gray-500">
                  Current: ${provider.balance.toFixed(2)}
                </span>
              )}
            </div>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder={
                provider.balance !== null && provider.balance !== undefined
                  ? `Current: $${provider.balance.toFixed(2)}`
                  : 'e.g. 50.00'
              }
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
            />
            {provider.lastSyncedAt && (
              <p className="text-xs text-gray-400 mt-1">
                Last synced: {formatSyncDate(provider.lastSyncedAt)}
                {provider.lastSyncedBalance !== null &&
                  provider.lastSyncedBalance !== undefined &&
                  ` (was $${provider.lastSyncedBalance.toFixed(2)})`}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Enter the current balance from your provider dashboard. The system will track
              spend and deduct run costs automatically.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!isValid || !hasChanges || isSaving}
              isLoading={isSaving}
            >
              Save Settings
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
