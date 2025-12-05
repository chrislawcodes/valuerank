import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { OptionsInput } from './OptionsInput';
import type { Dimension, DimensionValue } from './types';

interface DimensionEditorProps {
  dimensions: Dimension[];
  expandedDimensions: Set<number>;
  onToggle: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, updates: Partial<Dimension>) => void;
  onAddValue: (dimIndex: number) => void;
  onRemoveValue: (dimIndex: number, valueIndex: number) => void;
  onUpdateValue: (dimIndex: number, valueIndex: number, updates: Partial<DimensionValue>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function DimensionEditor({
  dimensions,
  expandedDimensions,
  onToggle,
  onAdd,
  onRemove,
  onUpdate,
  onAddValue,
  onRemoveValue,
  onUpdateValue,
  onFocus,
  onBlur,
}: DimensionEditorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">Dimensions ({dimensions.length})</h3>
        <button
          onClick={() => onAdd()}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
        >
          <Plus size={14} />
          Add Dimension
        </button>
      </div>

      {dimensions.map((dim, dimIndex) => {
        const isExpanded = expandedDimensions.has(dimIndex);
        return (
          <div key={dimIndex} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div
              className="flex items-center gap-3 p-3 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
              onClick={() => onToggle(dimIndex)}
            >
              {isExpanded ? (
                <ChevronDown size={16} className="text-gray-400" />
              ) : (
                <ChevronRight size={16} className="text-gray-400" />
              )}
              <input
                type="text"
                value={dim.name}
                onChange={(e) => {
                  e.stopPropagation();
                  onUpdate(dimIndex, { name: e.target.value });
                }}
                onClick={(e) => e.stopPropagation()}
                onFocus={onFocus}
                onBlur={onBlur}
                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm font-medium"
                placeholder="Dimension name"
              />
              <span className="text-xs text-gray-500">{dim.values.length} values</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(dimIndex);
                }}
                className="p-1 hover:bg-red-100 rounded"
              >
                <Trash2 size={14} className="text-red-500" />
              </button>
            </div>

            {isExpanded && (
              <div className="p-3">
                <div className="grid grid-cols-[4rem_1fr_2fr_2rem] gap-2 mb-1 px-1">
                  <span className="text-xs text-gray-500">Score</span>
                  <span className="text-xs text-gray-500">Label</span>
                  <span className="text-xs text-gray-500">Options (comma-separated)</span>
                  <span></span>
                </div>
                <div className="space-y-1">
                  {dim.values.map((val, valIndex) => (
                    <div key={valIndex} className="grid grid-cols-[4rem_1fr_2fr_2rem] gap-2 items-center">
                      <input
                        type="number"
                        value={val.score}
                        onChange={(e) =>
                          onUpdateValue(dimIndex, valIndex, { score: parseInt(e.target.value) || 0 })
                        }
                        onFocus={onFocus}
                        onBlur={onBlur}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <input
                        type="text"
                        value={val.label}
                        onChange={(e) => onUpdateValue(dimIndex, valIndex, { label: e.target.value })}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder="Score label"
                      />
                      <OptionsInput
                        value={val.options}
                        onChange={(options) => onUpdateValue(dimIndex, valIndex, { options })}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder="option1, option2, option3"
                        onFocus={onFocus}
                        onBlur={onBlur}
                      />
                      <button
                        onClick={() => onRemoveValue(dimIndex, valIndex)}
                        className="p-1 hover:bg-red-100 rounded justify-self-center"
                      >
                        <Trash2 size={14} className="text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => onAddValue(dimIndex)}
                  className="mt-2 text-sm text-purple-600 hover:text-purple-700"
                >
                  + Add score level
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
