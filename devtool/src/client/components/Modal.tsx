import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: 'default' | 'danger';
}

export function ConfirmModal({
  isOpen,
  onClose,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default',
}: ConfirmModalProps) {
  const handleCancel = () => {
    onCancel?.();
    onClose();
  };

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const confirmButtonClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-blue-600 hover:bg-blue-700 text-white';

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} title={title}>
      <p className="text-gray-600 mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button
          onClick={handleCancel}
          className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded"
        >
          {cancelLabel}
        </button>
        <button onClick={handleConfirm} className={`px-4 py-2 rounded ${confirmButtonClass}`}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

interface FileConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeepLocal: () => void;
  onLoadExternal: () => void;
}

export function FileConflictModal({
  isOpen,
  onClose,
  onKeepLocal,
  onLoadExternal,
}: FileConflictModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="File Changed on Disk">
      <p className="text-gray-600 mb-2">
        The file has been modified externally while you have unsaved changes.
      </p>
      <p className="text-gray-600 mb-6">What would you like to do?</p>
      <div className="flex flex-col gap-2">
        <button
          onClick={() => {
            onKeepLocal();
            onClose();
          }}
          className="w-full px-4 py-2 text-left rounded border border-gray-300 hover:bg-gray-50"
        >
          <div className="font-medium text-gray-900">Keep my changes</div>
          <div className="text-sm text-gray-500">Ignore the external changes and continue editing</div>
        </button>
        <button
          onClick={() => {
            onLoadExternal();
            onClose();
          }}
          className="w-full px-4 py-2 text-left rounded border border-gray-300 hover:bg-gray-50"
        >
          <div className="font-medium text-gray-900">Load external changes</div>
          <div className="text-sm text-gray-500">Discard my changes and load the file from disk</div>
        </button>
      </div>
    </Modal>
  );
}
