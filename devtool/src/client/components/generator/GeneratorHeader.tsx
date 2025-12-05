import { useState } from 'react';
import { Save, Wand2, Check, Pencil } from 'lucide-react';

interface GeneratorHeaderProps {
  name: string;
  folder: string;
  hasChanges: boolean;
  saving: boolean;
  generating: boolean;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onGenerate: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function GeneratorHeader({
  name,
  folder,
  hasChanges,
  saving,
  generating,
  onNameChange,
  onSave,
  onGenerate,
  onFocus,
  onBlur,
}: GeneratorHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [tempName, setTempName] = useState(name);

  const handleCommit = () => {
    if (tempName && tempName !== name) {
      onNameChange(tempName);
    }
    setEditing(false);
    onBlur?.();
  };

  const startEditing = () => {
    setTempName(name);
    setEditing(true);
    onFocus?.();
  };

  return (
    <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-3">
        <Wand2 className="text-purple-500" size={24} />
        <div>
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={handleCommit}
                onKeyDown={(e) => e.key === 'Enter' && handleCommit()}
                className="px-2 py-1 border border-gray-300 rounded text-lg font-semibold"
                autoFocus
              />
              <button onClick={handleCommit} className="p-1 hover:bg-gray-100 rounded">
                <Check size={16} className="text-green-600" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-lg">{name}.md</h2>
              <button onClick={startEditing} className="p-1 hover:bg-gray-100 rounded">
                <Pencil size={14} className="text-gray-400" />
              </button>
            </div>
          )}
          <p className="text-sm text-gray-500">{folder}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {hasChanges && <span className="text-sm text-orange-500">Unsaved changes</span>}
        <button
          onClick={onSave}
          disabled={saving || !hasChanges}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onGenerate}
          disabled={generating || !name}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
        >
          <Wand2 size={16} />
          {generating ? 'Generating...' : 'Generate YAML'}
        </button>
      </div>
    </div>
  );
}
