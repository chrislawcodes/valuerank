import { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery } from 'urql';
import { Plus, Save, X, Info } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { DimensionEditor } from './DimensionEditor';
import { ScenarioPreview } from './ScenarioPreview';
import { CanonicalDimensionChips } from './CanonicalDimensionChips';
import { InheritanceIndicator, InheritanceBanner } from './InheritanceIndicator';
import { TemplateEditor, type TemplateEditorHandle } from './TemplateEditor';
import type { CanonicalDimension } from '@valuerank/shared/canonical-dimensions';
import type {
  DefinitionContent,
  DefinitionOverrides,
  Dimension,
  DimensionLevel,
} from '../../api/operations/definitions';
import { DEFAULT_LEVEL_TEXTS } from './constants';

const PREAMBLES_LIST_QUERY = `
  query GetPreamblesList {
    preambles {
      id
      name
      latestVersion {
        id
        version
        content
      }
    }
  }
`;

type PreambleSummary = {
  id: string;
  name: string;
  latestVersion: {
    id: string;
    version: string;
    content: string;
  } | null;
};

type PreambleListQueryData = {
  preambles: PreambleSummary[];
};

export interface DefinitionEditorProps {
  initialName?: string;
  initialContent?: DefinitionContent;
  initialPreambleVersionId?: string | null;
  onSave: (name: string, content: DefinitionContent, preambleVersionId: string | null) => Promise<void>;
  onCancel: () => void;
  isSaving?: boolean;
  mode: 'create' | 'edit';
  isForked?: boolean;
  parentName?: string;
  parentId?: string;
  overrides?: DefinitionOverrides;
  onClearOverride?: (field: keyof DefinitionOverrides) => void;
  onViewParent?: () => void;
}

export function DefinitionEditor({
  initialName = '',
  initialContent,
  initialPreambleVersionId = null,
  onSave,
  onCancel,
  isSaving = false,
  mode,
  isForked = false,
  parentName,
  parentId,
  overrides,
  onClearOverride,
  onViewParent,
}: DefinitionEditorProps) {
  const [name, setName] = useState(initialName);
  const [content, setContent] = useState<DefinitionContent>(
    initialContent || createDefaultContent()
  );
  const [preambleVersionId, setPreambleVersionId] = useState<string | null>(initialPreambleVersionId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const templateEditorRef = useRef<TemplateEditorHandle>(null);

  // Fetch preambles
  const [{ data: preamblesData }] = useQuery<PreambleListQueryData>({ query: PREAMBLES_LIST_QUERY });

  // Get dimension names for template editor autocomplete
  const dimensionNames = useMemo(
    () => (content.dimensions ?? []).map((d) => d.name).filter((n) => n.trim() !== ''),
    [content.dimensions]
  );

  // Default overrides for non-forked definitions (everything is local)
  const effectiveOverrides: DefinitionOverrides = overrides ?? {
    template: true,
    dimensions: true,
    matchingRules: true,
  };

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
      // Always use the standard 5 levels with default text
      levels: Array.from({ length: 5 }, (_, i) => createDefaultLevel(i)),
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
    const dimensionNames = new Set((content.dimensions ?? []).map((d) => d.name.toLowerCase()));

    for (const placeholder of placeholders) {
      const name = placeholder.slice(1, -1).toLowerCase();
      if (!dimensionNames.has(name)) {
        newErrors.template = `Placeholder [${placeholder.slice(1, -1)}] has no matching dimension`;
        break;
      }
    }

    // Validate dimensions
    (content.dimensions ?? []).forEach((dim, i) => {
      if (!dim.name.trim()) {
        newErrors[`dimension-${i}`] = 'Dimension name is required';
      }
      const levels = dim.levels ?? [];
      if (levels.length === 0) {
        newErrors[`dimension-${i}`] = 'At least one level is required';
      }

      // Validate that each level has at least one option text
      levels.forEach((level, j) => {
        const optionText = level.options?.[0]?.trim();
        if (!optionText) {
          newErrors[`dimension-${i}-level-${j}`] = 'Level text is required';
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

    await onSave(name.trim(), content, preambleVersionId);
  };

  // Extract placeholders from template for info display
  const placeholders = useMemo(() => {
    const matches = content.template.match(/\[([^\]]+)\]/g) || [];
    return [...new Set(matches.map((m) => m.slice(1, -1)))];
  }, [content.template]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Inheritance Banner */}
      <InheritanceBanner
        isForked={isForked}
        parentName={parentName}
        parentId={parentId}
        onViewParent={onViewParent}
      />

      {/* Name */}
      <Input
        label="Vignette Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g., Ethical Dilemma Narratives v1"
        error={errors.name}
        disabled={isSaving}
      />

      {/* Preamble Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          System Preamble
        </label>
        <p className="text-sm text-gray-500 mb-2">
          Instructions prefixed to every scenario.
        </p>
        <div className="relative">
          <select
            value={preambleVersionId || ''}
            onChange={(e) => setPreambleVersionId(e.target.value || null)} // Handle empty string as null
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none appearance-none"
            disabled={isSaving}
          >
            <option value="">Default (None)</option>
            {preamblesData?.preambles?.map((p) => (
              <option key={p.id} value={p.latestVersion?.id || ''} disabled={!p.latestVersion}>
                {p.name} {p.latestVersion ? `(v${p.latestVersion.version})` : '(No versions)'}
              </option>
            ))}
          </select>
          {/* Custom arrow if needed, but default select is fine for MVP */}
        </div>
        {preambleVersionId && (
          <div className="mt-2 p-3 bg-gray-50 rounded border border-gray-200 text-xs text-gray-600 font-mono">
            <div className="flex items-center gap-1.5 mb-1 font-medium text-gray-500">
              <Info className="w-3 h-3" />
              Selected Preamble Preview
            </div>
            <div className="line-clamp-3">
              {preamblesData?.preambles?.find((p) => p.latestVersion?.id === preambleVersionId)?.latestVersion?.content || '(Loading content...)'}
            </div>
          </div>
        )}
      </div>

      {/* Template */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">
            Narrative
          </label>
          <InheritanceIndicator
            isOverridden={effectiveOverrides.template}
            isForked={isForked}
            fieldName="Template"
            onClearOverride={onClearOverride ? () => onClearOverride('template') : undefined}
          />
        </div>
        <p className="text-sm text-gray-500 mb-2">
          Use placeholders like <code className="bg-gray-100 px-1 rounded">[situation]</code> that
          will be replaced with dimension values. Type <code className="bg-gray-100 px-1 rounded">[</code> for autocomplete.
        </p>
        <TemplateEditor
          ref={templateEditorRef}
          value={content.template}
          dimensions={dimensionNames}
          onChange={handleTemplateChange}
          disabled={isSaving}
          placeholder="You encounter a [situation] involving [actor]. What do you do?"
        />
        {errors.template && (
          <p className="text-sm text-red-600 mt-1">{errors.template}</p>
        )}
        {placeholders.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="text-sm text-gray-500">Placeholders:</span>
            {placeholders.map((p) => (
              // eslint-disable-next-line react/forbid-elements -- Chip button requires custom styling
              <button
                key={p}
                type="button"
                onClick={() => templateEditorRef.current?.insertAtCursor(`[${p}]`)}
                className="inline-flex px-2 py-0.5 bg-teal-50 text-teal-700 text-xs rounded-full hover:bg-teal-100 cursor-pointer transition-colors"
                title={`Click to insert [${p}]`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dimensions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <label className="block text-sm font-medium text-gray-700">
              Attributes
            </label>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              1-2 recommended
            </span>
            <InheritanceIndicator
              isOverridden={effectiveOverrides.dimensions}
              isForked={isForked}
              fieldName="Attributes"
              onClearOverride={onClearOverride ? () => onClearOverride('dimensions') : undefined}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddDimension}
            disabled={isSaving}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Custom Attribute
          </Button>
        </div>

        {/* Canonical Dimension Chips */}
        <div className="mb-4">
          <CanonicalDimensionChips
            existingDimensionNames={(content.dimensions ?? []).map((d) => d.name)}
            onAddDimension={handleAddCanonicalDimension}
            disabled={isSaving}
          />
        </div>

        {(content.dimensions ?? []).length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <p className="text-sm text-gray-500 mb-2">No attributes yet</p>
            <p className="text-xs text-gray-400">
              Click a canonical attribute above or add a custom one
            </p>
          </div>
        ) : (content.dimensions ?? []).length > 2 ? (
          <>
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
              You have {(content.dimensions ?? []).length} attributes. Consider using 1-2 for clearer analysis and fewer scenarios.
            </div>
            <div className="space-y-4">
              {(content.dimensions ?? []).map((dimension, index) => (
                <DimensionEditor
                  key={index}
                  dimension={dimension}
                  index={index}
                  onChange={(dim) => handleDimensionChange(index, dim)}
                  onRemove={() => handleDimensionRemove(index)}
                  canRemove={(content.dimensions ?? []).length > 0}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            {(content.dimensions ?? []).map((dimension, index) => (
              <DimensionEditor
                key={index}
                dimension={dimension}
                index={index}
                onChange={(dim) => handleDimensionChange(index, dim)}
                onRemove={() => handleDimensionRemove(index)}
                canRemove={(content.dimensions ?? []).length > 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Scenario Preview */}
      <ScenarioPreview
        content={useMemo(
          () => ({
            ...content,
            preamble: preamblesData?.preambles?.find((p) => p.latestVersion?.id === preambleVersionId)?.latestVersion?.content,
          }),
          [content, preamblesData, preambleVersionId]
        )}
        maxSamples={10}
      />

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
        <Button type="submit" variant="primary" isLoading={isSaving}>
          <Save className="w-4 h-4 mr-2" />
          {mode === 'create' ? 'Create Vignette' : 'Save Changes'}
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

function createDefaultContent(): DefinitionContent {
  return {
    schema_version: 1,
    template: '',
    dimensions: [],
  };
}

function createDefaultDimension(): Dimension {
  return {
    name: '',
    levels: Array.from({ length: 5 }, (_, i) => createDefaultLevel(i)),
  };
}

function createDefaultLevel(index: number): DimensionLevel {
  const text = DEFAULT_LEVEL_TEXTS[index] || '';
  return {
    score: index + 1,
    description: '',
    options: [text],
    label: text,
  };
}
