/**
 * Provider Settings Modal
 *
 * Modal for editing provider rate limit settings.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import type { ProviderSettingsModalProps } from './types';

export function ProviderSettingsModal({
  provider,
  onClose,
  onSave,
}: ProviderSettingsModalProps) {
  const [requestsPerMinute, setRequestsPerMinute] = useState(provider.requestsPerMinute.toString());
  const [maxParallelRequests, setMaxParallelRequests] = useState(
    provider.maxParallelRequests.toString()
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    await onSave({
      requestsPerMinute: parseInt(requestsPerMinute, 10),
      maxParallelRequests: parseInt(maxParallelRequests, 10),
    });

    setIsSaving(false);
  };

  const hasChanges =
    parseInt(requestsPerMinute, 10) !== provider.requestsPerMinute ||
    parseInt(maxParallelRequests, 10) !== provider.maxParallelRequests;

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
