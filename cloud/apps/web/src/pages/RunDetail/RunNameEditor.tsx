/**
 * Run Name Editor
 *
 * Inline editor for the run name with pencil icon trigger.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';

type RunNameEditorProps = {
  name: string | null;
  formattedName: string;
  onSave: (name: string | null) => Promise<void>;
};

export function RunNameEditor({ name, formattedName, onSave }: RunNameEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = useCallback(() => {
    setEditedName(name || '');
    setIsEditing(true);
  }, [name]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedName('');
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // If name is empty, set to null (use default algorithmic name)
      const newName = editedName.trim() || null;
      await onSave(newName);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }, [editedName, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        void handleSave();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={editedName}
          onChange={(e) => setEditedName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter run name..."
          className="text-xl font-medium text-gray-900 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          disabled={isSaving}
        />
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          variant="ghost"
          size="icon"
          className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50"
          title="Save"
          aria-label="Save name"
        >
          <Check className="w-5 h-5" />
        </Button>
        <Button
          type="button"
          onClick={handleCancel}
          disabled={isSaving}
          variant="ghost"
          size="icon"
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          title="Cancel"
          aria-label="Cancel editing"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <h1 className="text-xl font-medium text-gray-900">{formattedName}</h1>
      <Button
        type="button"
        onClick={handleStartEdit}
        variant="ghost"
        size="icon"
        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Edit name"
        aria-label="Edit run name"
      >
        <Pencil className="w-4 h-4" />
      </Button>
    </div>
  );
}
