/**
 * Delete Definition Modal
 *
 * Confirmation dialog for deleting a definition.
 */

import { Button } from '../../components/ui/Button';

type DeleteDefinitionModalProps = {
  isOpen: boolean;
  definitionName: string;
  childCount: number;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteDefinitionModal({
  isOpen,
  definitionName,
  childCount,
  isDeleting,
  onClose,
  onConfirm,
}: DeleteDefinitionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Delete Definition</h2>
        <p className="text-gray-600 mb-2">
          Are you sure you want to delete &quot;{definitionName}&quot;?
        </p>
        {childCount > 0 && (
          <p className="text-amber-600 text-sm mb-4">
            This will also delete {childCount} forked definition
            {childCount !== 1 ? 's' : ''}.
          </p>
        )}
        <p className="text-gray-500 text-sm mb-6">This action cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}
