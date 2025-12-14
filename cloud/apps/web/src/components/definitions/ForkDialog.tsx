import { useState } from 'react';
import { X, GitBranch } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

type ForkDialogProps = {
  originalName: string;
  onFork: (newName: string) => Promise<void>;
  onClose: () => void;
  isForking: boolean;
};

export function ForkDialog({
  originalName,
  onFork,
  onClose,
  isForking,
}: ForkDialogProps) {
  const [name, setName] = useState(`${originalName} (Fork)`);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    try {
      await onFork(name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fork definition');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-25 transition-opacity"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md transform overflow-hidden rounded-lg bg-white shadow-xl transition-all">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-medium text-gray-900">Fork Definition</h2>
            </div>
            <Button
              type="button"
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-gray-500 hover:bg-transparent"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600 mb-4">
                Create a new variant of <strong>{originalName}</strong>. The fork will
                inherit all content from the parent definition.
              </p>

              {/* Inheritance explanation */}
              <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <h4 className="text-sm font-medium text-purple-800 mb-1">
                  Property Inheritance
                </h4>
                <ul className="text-xs text-purple-700 space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-500 mt-0.5">•</span>
                    <span>The fork inherits preamble, template, and dimensions from the parent</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-500 mt-0.5">•</span>
                    <span>Changes to the parent will be reflected in the fork</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-500 mt-0.5">•</span>
                    <span>Override any property to customize the fork independently</span>
                  </li>
                </ul>
              </div>

              <Input
                label="Name for the fork"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder="Enter a name for the forked definition"
                error={error || undefined}
                disabled={isForking}
                autoFocus
              />
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isForking}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isForking}>
                <GitBranch className="w-4 h-4 mr-2" />
                Create Fork
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
