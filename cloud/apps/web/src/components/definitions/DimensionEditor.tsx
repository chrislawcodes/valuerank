import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Dimension, DimensionLevel } from '../../api/operations/definitions';

type DimensionEditorProps = {
  dimension: Dimension;
  index: number;
  onChange: (dimension: Dimension) => void;
  onRemove: () => void;
  canRemove: boolean;
};

function createDefaultLevel(index: number): DimensionLevel {
  return {
    score: index + 1,
    label: '',
    description: undefined,
    options: undefined,
  };
}

export function DimensionEditor({
  dimension,
  index,
  onChange,
  onRemove,
  canRemove,
}: DimensionEditorProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Ensure levels array exists (handle legacy 'values' format gracefully)
  const levels = dimension.levels ?? [];

  const handleNameChange = (name: string) => {
    onChange({ ...dimension, name });
  };

  const handleLevelChange = (levelIndex: number, updates: Partial<DimensionLevel>) => {
    const newLevels = [...levels];
    const currentLevel = newLevels[levelIndex];
    if (!currentLevel) return;
    newLevels[levelIndex] = {
      score: updates.score ?? currentLevel.score,
      label: updates.label ?? currentLevel.label,
      description: updates.description !== undefined ? updates.description : currentLevel.description,
      options: updates.options !== undefined ? updates.options : currentLevel.options,
    };
    onChange({ ...dimension, levels: newLevels });
  };

  const handleLevelRemove = (levelIndex: number) => {
    const newLevels = levels.filter((_, i) => i !== levelIndex);
    onChange({ ...dimension, levels: newLevels });
  };

  const handleAddLevel = () => {
    const newLevel = createDefaultLevel(levels.length);
    onChange({ ...dimension, levels: [...levels, newLevel] });
  };

  const handleOptionsChange = (levelIndex: number, value: string) => {
    const options = value
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    handleLevelChange(levelIndex, { options: options.length > 0 ? options : undefined });
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <button
          type="button"
          className="text-gray-400"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        <input
          type="text"
          value={dimension.name}
          onChange={(e) => {
            e.stopPropagation();
            handleNameChange(e.target.value);
          }}
          onClick={(e) => e.stopPropagation()}
          placeholder="Dimension name"
          className="flex-1 px-2 py-1 text-sm font-medium border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
        />

        <span className="text-xs text-gray-500">
          {levels.length} level{levels.length !== 1 ? 's' : ''}
        </span>

        {canRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1 hover:bg-red-100 rounded"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        )}
      </div>

      {/* Levels - Compact Grid */}
      {isExpanded && (
        <div className="p-3">
          {/* Grid Header */}
          <div className="grid grid-cols-[3.5rem_1fr_2fr_1.5rem] gap-2 mb-1 px-1">
            <span className="text-xs text-gray-500">Score</span>
            <span className="text-xs text-gray-500">Label</span>
            <span className="text-xs text-gray-500">Options (comma-separated)</span>
            <span></span>
          </div>

          {/* Level Rows */}
          <div className="space-y-1">
            {levels.map((level, levelIndex) => (
              <div
                key={levelIndex}
                className="grid grid-cols-[3.5rem_1fr_2fr_1.5rem] gap-2 items-center"
              >
                <input
                  type="number"
                  step="0.1"
                  value={level.score}
                  onChange={(e) => {
                    const score = parseFloat(e.target.value);
                    if (!isNaN(score)) {
                      handleLevelChange(levelIndex, { score });
                    }
                  }}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <input
                  type="text"
                  value={level.label}
                  onChange={(e) => handleLevelChange(levelIndex, { label: e.target.value })}
                  placeholder="Label"
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <input
                  type="text"
                  value={level.options?.join(', ') || ''}
                  onChange={(e) => handleOptionsChange(levelIndex, e.target.value)}
                  placeholder="option1, option2, option3"
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                  type="button"
                  onClick={() => handleLevelRemove(levelIndex)}
                  disabled={levels.length <= 1}
                  className="p-1 hover:bg-red-100 rounded disabled:opacity-30 disabled:cursor-not-allowed justify-self-center"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddLevel}
            className="mt-2 text-sm text-teal-600 hover:text-teal-700"
          >
            + Add level
          </button>
        </div>
      )}
    </div>
  );
}
