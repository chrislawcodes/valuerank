import { GitBranch, Unlink2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';

type UnforkDefinitionModalProps = {
  isOpen: boolean;
  definitionName: string;
  isUnforking: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function UnforkDefinitionModal({
  isOpen,
  definitionName,
  isUnforking,
  onClose,
  onConfirm,
}: UnforkDefinitionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-25 transition-opacity" onClick={onClose} />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md transform overflow-hidden rounded-lg bg-white shadow-xl transition-all">
          <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4">
            <Unlink2 className="h-5 w-5 text-teal-600" />
            <h2 className="text-lg font-medium text-gray-900">Unfork Vignette</h2>
          </div>

          <div className="space-y-4 px-6 py-4">
            <p className="text-sm text-gray-700">
              Detach <strong>{definitionName}</strong> from its parent and make it a standalone vignette?
            </p>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <div className="mb-2 flex items-center gap-1.5 font-medium">
                <GitBranch className="h-3.5 w-3.5" />
                What happens next
              </div>
              <ul className="space-y-1">
                <li>Current inherited content is copied into this vignette.</li>
                <li>Future parent changes will no longer affect this vignette.</li>
                <li>Scenario expansion will re-run to lock in standalone content.</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isUnforking}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={onConfirm} isLoading={isUnforking}>
              Unfork
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
