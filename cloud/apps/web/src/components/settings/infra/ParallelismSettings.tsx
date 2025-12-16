/**
 * Parallelism Settings
 *
 * Configure the number of concurrent summarization jobs.
 */

import { Layers, Check } from 'lucide-react';
import { Button } from '../../ui/Button';

type ParallelismSettingsProps = {
  currentValue: number;
  value: number;
  hasChanges: boolean;
  isSaving: boolean;
  saveSuccess: boolean;
  onChange: (value: number) => void;
  onSave: () => Promise<void>;
};

export function ParallelismSettings({
  currentValue,
  value,
  hasChanges,
  isSaving,
  saveSuccess,
  onChange,
  onSave,
}: ParallelismSettingsProps) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
            <Layers className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">Summarization Parallelism</h2>
            <p className="text-sm text-gray-500">
              Number of transcript summarizations to run concurrently
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        {/* Current Configuration */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-500 mb-1">Currently configured:</p>
          <p className="font-medium text-gray-900">{currentValue} parallel jobs</p>
        </div>

        {/* Parallelism Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Max Parallel Summarizations
          </label>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min={1}
              max={500}
              value={value}
              onChange={(e) => onChange(parseInt(e.target.value, 10) || 1)}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
            <span className="text-sm text-gray-500">Range: 1-500 (default: 8)</span>
          </div>
        </div>

        {/* Description */}
        <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
          <p>
            Controls how many transcript summarization jobs run at the same time. Higher values
            speed up summarization but increase load on the summarizer model API. Adjust based on
            your API rate limits.
          </p>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between pt-4">
          {saveSuccess && (
            <div className="flex items-center gap-2 text-green-600">
              <Check className="w-4 h-4" />
              <span className="text-sm">Configuration saved</span>
            </div>
          )}
          <div className="ml-auto">
            <Button
              variant="primary"
              onClick={onSave}
              disabled={!hasChanges || isSaving || value < 1 || value > 500}
              isLoading={isSaving}
            >
              Save Configuration
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
