import { useState, useMemo, useCallback } from 'react';
import { Plus, Save, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { DimensionEditor } from './DimensionEditor';
import { ScenarioPreview } from './ScenarioPreview';
import { CanonicalDimensionChips } from './CanonicalDimensionChips';
import type { CanonicalDimension } from '@valuerank/shared/canonical-dimensions';
import type {
  DefinitionContent,
  Dimension,
  DimensionLevel,
} from '../../api/operations/definitions';

type DefinitionEditorProps = {
  initialName?: string;
  initialContent?: DefinitionContent;
  onSave: (name: string, content: DefinitionContent) => Promise<void>;
  onCancel: () => void;
  isSaving?: boolean;
  mode: 'create' | 'edit';
};

function createDefaultContent(): DefinitionContent {
  return {
    schema_version: 1,
    preamble: '',
    template: '',
    dimensions: [],
  };
}

function createDefaultDimension(): Dimension {
  return {
    name: '',
    levels: [createDefaultLevel(0)],
  };
}

function createDefaultLevel(index: number): DimensionLevel {
  return {
    score: index + 1,
    label: '',
    description: undefined,
    options: undefined,
  };
}

// Highlight placeholders like [name] in the template
function TemplateHighlight({ template }: { template: string }) {
  const parts = template.split(/(\[[^\]]+\])/g);

  return (
    <div className="absolute inset-0 p-3 pointer-events-none whitespace-pre-wrap font-mono text-sm">
      {parts.map((part, index) => {
        if (part.match(/^\[[^\]]+\]$/)) {
          return (
            <span key={index} className="bg-teal-100 text-teal-800 rounded px-0.5">
              {part}
            </span>
          );
        }
        return <span key={index} className="text-transparent">{part}</span>;
      })}
    </div>
  );
}

export function DefinitionEditor({
  initialName = '',
  initialContent,
  onSave,
  onCancel,
  isSaving = false,
  mode,
}: DefinitionEditorProps) {
  const [name, setName] = useState(initialName);
  const [content, setContent] = useState<DefinitionContent>(
    initialContent || createDefaultContent()
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handlePreambleChange = useCallback((value: string) => {
    setContent((prev) => ({ ...prev, preamble: value }));
  }, []);

  const handleTemplateChange = useCallback((value: string) => {
    setContent((prev) => ({ ...prev, template: value }));
  }, []);

  const handleDimensionChange = useCallback((index: number, dimension: Dimension) => {
    setContent((prev) => {
      const newDimensions = [...prev.dimensions];
      newDimensions[index] = dimension;
      return { ...prev, dimensions: newDimensions };
    });
  }, []);

  const handleDimensionRemove = useCallback((index: number) => {
    setContent((prev) => ({
      ...prev,
      dimensions: prev.dimensions.filter((_, i) => i !== index),
    }));
  }, []);

  const handleAddDimension = useCallback(() => {
    setContent((prev) => ({
      ...prev,
      dimensions: [...prev.dimensions, createDefaultDimension()],
    }));
  }, []);

  const handleAddCanonicalDimension = useCallback((canonical: CanonicalDimension) => {
    const dimension: Dimension = {
      name: canonical.name,
      levels: canonical.levels.map((level) => ({
        score: level.score,
        label: level.label,
        description: undefined,
        options: [...level.options],
      })),
    };
    setContent((prev) => ({
      ...prev,
      dimensions: [...prev.dimensions, dimension],
    }));
  }, []);

  // Validate the form
  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!content.template.trim()) {
      newErrors.template = 'Template is required';
    }

    // Check that all placeholders in template have corresponding dimensions
    const placeholders = content.template.match(/\[([^\]]+)\]/g) || [];
    const dimensionNames = new Set(content.dimensions.map((d) => d.name.toLowerCase()));

    for (const placeholder of placeholders) {
      const name = placeholder.slice(1, -1).toLowerCase();
      if (!dimensionNames.has(name)) {
        newErrors.template = `Placeholder [${placeholder.slice(1, -1)}] has no matching dimension`;
        break;
      }
    }

    // Validate dimensions
    content.dimensions.forEach((dim, i) => {
      if (!dim.name.trim()) {
        newErrors[`dimension-${i}`] = 'Dimension name is required';
      }
      if (dim.levels.length === 0) {
        newErrors[`dimension-${i}`] = 'At least one level is required';
      }
      dim.levels.forEach((level, j) => {
        if (!level.label.trim()) {
          newErrors[`dimension-${i}-level-${j}`] = 'Level label is required';
        }
      });
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, content]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    await onSave(name.trim(), content);
  };

  // Extract placeholders from template for info display
  const placeholders = useMemo(() => {
    const matches = content.template.match(/\[([^\]]+)\]/g) || [];
    return [...new Set(matches.map((m) => m.slice(1, -1)))];
  }, [content.template]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <Input
        label="Definition Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g., Ethical Dilemma Scenarios v1"
        error={errors.name}
        disabled={isSaving}
      />

      {/* Preamble */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Preamble (optional)
        </label>
        <textarea
          value={content.preamble}
          onChange={(e) => handlePreambleChange(e.target.value)}
          placeholder="Context or instructions that appear before each scenario..."
          rows={3}
          disabled={isSaving}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100"
        />
      </div>

      {/* Template */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Scenario Template
        </label>
        <p className="text-sm text-gray-500 mb-2">
          Use placeholders like <code className="bg-gray-100 px-1 rounded">[situation]</code> that
          will be replaced with dimension values.
        </p>
        <div className="relative">
          <TemplateHighlight template={content.template} />
          <textarea
            value={content.template}
            onChange={(e) => handleTemplateChange(e.target.value)}
            placeholder="You encounter a [situation] involving [actor]. What do you do?"
            rows={4}
            disabled={isSaving}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 font-mono text-sm bg-transparent relative z-10"
          />
        </div>
        {errors.template && (
          <p className="text-sm text-red-600 mt-1">{errors.template}</p>
        )}
        {placeholders.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="text-sm text-gray-500">Placeholders:</span>
            {placeholders.map((p) => (
              <span
                key={p}
                className="inline-flex px-2 py-0.5 bg-teal-50 text-teal-700 text-xs rounded-full"
              >
                {p}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Dimensions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-gray-700">
            Dimensions
          </label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddDimension}
            disabled={isSaving}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Custom Dimension
          </Button>
        </div>

        {/* Canonical Dimension Chips */}
        <div className="mb-4">
          <CanonicalDimensionChips
            existingDimensionNames={content.dimensions.map((d) => d.name)}
            onAddDimension={handleAddCanonicalDimension}
            disabled={isSaving}
          />
        </div>

        {content.dimensions.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <p className="text-sm text-gray-500 mb-2">No dimensions yet</p>
            <p className="text-xs text-gray-400">
              Click a canonical dimension above or add a custom one
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {content.dimensions.map((dimension, index) => (
              <DimensionEditor
                key={index}
                dimension={dimension}
                index={index}
                onChange={(dim) => handleDimensionChange(index, dim)}
                onRemove={() => handleDimensionRemove(index)}
                canRemove={content.dimensions.length > 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Scenario Preview */}
      <ScenarioPreview content={content} maxSamples={10} />

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
        <Button type="submit" variant="primary" isLoading={isSaving}>
          <Save className="w-4 h-4 mr-2" />
          {mode === 'create' ? 'Create Definition' : 'Save Changes'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isSaving}
        >
          <X className="w-4 h-4 mr-2" />
          Cancel
        </Button>
      </div>
    </form>
  );
}
