import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { DimensionLevelEditor } from './DimensionLevelEditor';
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

  const handleNameChange = (name: string) => {
    onChange({ ...dimension, name });
  };

  const handleLevelChange = (levelIndex: number, level: DimensionLevel) => {
    const newLevels = [...dimension.levels];
    newLevels[levelIndex] = level;
    onChange({ ...dimension, levels: newLevels });
  };

  const handleLevelRemove = (levelIndex: number) => {
    const newLevels = dimension.levels.filter((_, i) => i !== levelIndex);
    onChange({ ...dimension, levels: newLevels });
  };

  const handleAddLevel = () => {
    const newLevel = createDefaultLevel(dimension.levels.length);
    onChange({ ...dimension, levels: [...dimension.levels, newLevel] });
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 bg-white border-b border-gray-200">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-500 hover:text-gray-700"
        >
          {isExpanded ? (
            <ChevronDown className="w-5 h-5" />
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
        </button>

        <div className="flex-1">
          <Input
            value={dimension.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Dimension name (e.g., situation, actor)"
            className="font-medium"
          />
        </div>

        <span className="text-sm text-gray-500">
          {dimension.levels.length} level{dimension.levels.length !== 1 ? 's' : ''}
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

      {/* Levels */}
      {isExpanded && (
        <div className="p-4 bg-gray-50 space-y-3">
          {dimension.levels.map((level, levelIndex) => (
            <DimensionLevelEditor
              key={levelIndex}
              level={level}
              index={levelIndex}
              onChange={(updatedLevel) => handleLevelChange(levelIndex, updatedLevel)}
              onRemove={() => handleLevelRemove(levelIndex)}
              canRemove={dimension.levels.length > 1}
            />
          ))}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddLevel}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Level
          </Button>
        </div>
      )}
    </div>
  );
}
