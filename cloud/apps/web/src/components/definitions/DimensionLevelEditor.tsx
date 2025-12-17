import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { DimensionLevel } from '../../api/operations/definitions';

type DimensionLevelEditorProps = {
  level: DimensionLevel;
  index: number;
  onChange: (level: DimensionLevel) => void;
  onRemove: () => void;
  canRemove: boolean;
};

export function DimensionLevelEditor({
  level,
  index,
  onChange,
  onRemove,
  canRemove,
}: DimensionLevelEditorProps) {
  // Keep raw text for options to allow proper typing of commas and spaces
  const [optionsText, setOptionsText] = useState(level.options?.join(', ') || '');

  // Sync optionsText when level.options changes externally
  useEffect(() => {
    setOptionsText(level.options?.join(', ') || '');
  }, [level.options]);

  const handleScoreChange = (value: string) => {
    const score = parseFloat(value);
    if (!isNaN(score)) {
      onChange({ ...level, score });
    }
  };

  const handleLabelChange = (value: string) => {
    onChange({ ...level, label: value });
  };

  const handleDescriptionChange = (value: string) => {
    onChange({ ...level, description: value || undefined });
  };

  const handleOptionsTextChange = (value: string) => {
    setOptionsText(value);
  };

  const handleOptionsBlur = () => {
    const options = optionsText
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    onChange({ ...level, options: options.length > 0 ? options : undefined });
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">
          Level {index + 1}
        </span>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-gray-400 hover:text-red-500"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Score"
          type="number"
          step="0.1"
          value={level.score}
          onChange={(e) => handleScoreChange(e.target.value)}
          placeholder="e.g., 1.0"
        />
        <Input
          label="Label"
          value={level.label}
          onChange={(e) => handleLabelChange(e.target.value)}
          placeholder="e.g., Low Risk"
        />
      </div>

      <div className="mt-3">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description (optional)
        </label>
        <textarea
          value={level.description || ''}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          placeholder="A brief description of this level..."
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
      </div>

      <div className="mt-3">
        <Input
          label="Alternative options (comma-separated)"
          value={optionsText}
          onChange={(e) => handleOptionsTextChange(e.target.value)}
          onBlur={handleOptionsBlur}
          placeholder="e.g., minimal, negligible, trivial"
        />
      </div>
    </div>
  );
}
