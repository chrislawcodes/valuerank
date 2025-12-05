import { useState, useEffect, useRef, useCallback } from 'react';
import { generator, config, type CanonicalDimension, type ScenarioDefinition } from '../lib/api';
import {
  GeneratorHeader,
  DimensionEditor,
  YamlPreview,
  TemplateEditor,
  DEFAULT_DEFINITION,
  type Dimension,
  type TemplateEditorHandle,
} from './generator';
import { FileConflictModal } from './Modal';
import { useAvailableModels } from './ModelSelector';

interface ScenarioGeneratorProps {
  folder: string;
  name: string;
  isNew?: boolean;
  onSaved?: () => void;
  onClose?: () => void;
}

export function ScenarioGenerator({ folder, name, isNew, onSaved, onClose }: ScenarioGeneratorProps) {
  const [definition, setDefinition] = useState<ScenarioDefinition>({ ...DEFAULT_DEFINITION, name });
  const [originalName, setOriginalName] = useState(name);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isUnsaved, setIsUnsaved] = useState(isNew ?? false);
  const [canonicalValues, setCanonicalValues] = useState<string[]>([]);
  const [canonicalDimensions, setCanonicalDimensions] = useState<Record<string, CanonicalDimension>>({});
  const [expandedDimensions, setExpandedDimensions] = useState<Set<number>>(new Set([0]));
  const [generatedYaml, setGeneratedYaml] = useState<string | null>(null);

  // Model selection
  const { models: availableModels, loading: modelsLoading, defaultModel } = useAvailableModels();
  const [selectedModel, setSelectedModel] = useState<string>('');

  // File watcher state
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [pendingExternalDefinition, setPendingExternalDefinition] = useState<ScenarioDefinition | null>(null);

  // Template editor ref for inserting at cursor
  const templateEditorRef = useRef<TemplateEditorHandle>(null);

  // Use ref to access latest definition in callbacks without stale closures
  const definitionRef = useRef(definition);
  definitionRef.current = definition;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;
  const isUnsavedRef = useRef(isUnsaved);
  isUnsavedRef.current = isUnsaved;
  const originalNameRef = useRef(originalName);
  originalNameRef.current = originalName;

  // Track if we just saved to ignore our own file change events
  const justSavedRef = useRef(false);

  useEffect(() => {
    if (!isNew) {
      loadDefinition();
    }
    loadValues();
  }, [folder, name, isNew]);

  // Set default model when available and nothing is selected
  useEffect(() => {
    if (!selectedModel && defaultModel) {
      // Check localStorage first
      const saved = localStorage.getItem('devtool:generator:model');
      if (saved && availableModels.some(m => m.id === saved)) {
        setSelectedModel(saved);
      } else {
        setSelectedModel(defaultModel);
      }
    }
  }, [defaultModel, availableModels, selectedModel]);

  // Set up file watcher for non-new files
  useEffect(() => {
    if (isNew || !originalName) return;

    const cleanup = generator.watchDefinition(
      folder,
      originalName,
      () => {
        // Connected - no action needed
      },
      (externalDefinition) => {
        // File changed on disk
        // Ignore if we just saved (our own change)
        if (justSavedRef.current) {
          justSavedRef.current = false;
          return;
        }

        // If user is editing or has unsaved changes, show conflict modal
        if (isDirtyRef.current || isEditingRef.current) {
          setPendingExternalDefinition(externalDefinition);
          setShowConflictModal(true);
        } else {
          // No local changes, just reload
          setDefinition(externalDefinition);
          setExpandedDimensions(new Set(externalDefinition.dimensions.map((_, i) => i)));
        }
      },
      () => {
        // File was deleted - navigate back to root
        onClose?.();
      },
      (error) => {
        console.error('File watcher error:', error);
      }
    );

    return cleanup;
  }, [folder, originalName, isNew, onClose]);

  const loadDefinition = async () => {
    try {
      setLoading(true);
      const def = await generator.getDefinition(folder, name);
      setDefinition(def);
      setOriginalName(def.name);
      setExpandedDimensions(new Set(def.dimensions.map((_, i) => i)));
      setIsDirty(false);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadValues = async () => {
    try {
      const [valuesResult, dimensionsResult] = await Promise.all([
        config.getValues(),
        config.getCanonicalDimensions(),
      ]);
      setCanonicalValues(valuesResult.values);
      setCanonicalDimensions(dimensionsResult.dimensions || {});
    } catch (e) {
      console.error('Failed to load values:', e);
    }
  };

  // Core save function that uses refs to avoid stale closures
  const doSave = useCallback(async () => {
    const def = definitionRef.current;
    const origName = originalNameRef.current;
    const unsaved = isUnsavedRef.current;

    try {
      setSaving(true);
      setError(null);

      // Mark that we're about to save so we ignore our own file change event
      justSavedRef.current = true;

      if (origName !== def.name && !unsaved) {
        await generator.renameDefinition(folder, origName, def.name);
        setOriginalName(def.name);
      }

      if (unsaved) {
        await generator.createDefinition(folder, def.name, def);
        setIsUnsaved(false);
        setOriginalName(def.name);
      } else {
        await generator.saveDefinition(folder, def.name, def);
      }

      setIsDirty(false);
      onSaved?.();
    } catch (e) {
      justSavedRef.current = false; // Reset on error
      setError(`Failed to save: ${e}`);
      throw e;
    } finally {
      setSaving(false);
    }
  }, [folder, onSaved]);

  // Save only if there are unsaved changes
  const saveIfDirty = useCallback(async () => {
    if (isDirtyRef.current || isUnsavedRef.current) {
      await doSave();
    }
  }, [doSave]);

  // Manual save handler (for the Save button)
  const handleSave = async () => {
    await doSave();
  };

  const handleGenerate = async () => {
    try {
      await saveIfDirty();
    } catch {
      return;
    }

    try {
      setGenerating(true);
      setError(null);
      setGeneratedYaml(null);

      const result = await generator.generate(folder, definition.name, selectedModel);
      setGeneratedYaml(result.yaml);
      onSaved?.();
    } catch (e) {
      setError(`Generation failed: ${e}`);
    } finally {
      setGenerating(false);
    }
  };

  const updateDefinition = (updates: Partial<ScenarioDefinition>) => {
    setDefinition((prev) => ({ ...prev, ...updates }));
    setIsDirty(true);
  };

  const addDimension = async (name?: string) => {
    await saveIfDirty();

    const dimName = name || `Dimension_${definitionRef.current.dimensions.length + 1}`;

    // Check if we have canonical dimension data for this value
    const canonical = name ? canonicalDimensions[name] : null;
    const values = canonical
      ? canonical.levels.map((level) => ({
          score: level.score,
          label: level.label,
          options: [...level.options],
        }))
      : [
          { score: 1, label: 'Low', options: ['option1'] },
          { score: 3, label: 'Medium', options: ['option2'] },
          { score: 5, label: 'High', options: ['option3'] },
        ];

    setDefinition((prev) => ({
      ...prev,
      dimensions: [
        ...prev.dimensions,
        { name: dimName, values },
      ],
    }));
    setExpandedDimensions((prev) => new Set([...prev, definitionRef.current.dimensions.length]));
    setIsDirty(true);
    // Auto-save after adding dimension
    setTimeout(() => saveIfDirty(), 0);
  };

  const removeDimension = async (index: number) => {
    await saveIfDirty();
    setDefinition((prev) => ({
      ...prev,
      dimensions: prev.dimensions.filter((_, i) => i !== index),
    }));
    setIsDirty(true);
    setTimeout(() => saveIfDirty(), 0);
  };

  const updateDimension = (index: number, updates: Partial<Dimension>) => {
    setDefinition((prev) => ({
      ...prev,
      dimensions: prev.dimensions.map((d, i) => (i === index ? { ...d, ...updates } : d)),
    }));
    setIsDirty(true);
  };

  const addDimensionValue = async (dimIndex: number) => {
    await saveIfDirty();
    const dim = definitionRef.current.dimensions[dimIndex];
    const maxScore = Math.max(...dim.values.map((v) => v.score), 0);
    setDefinition((prev) => ({
      ...prev,
      dimensions: prev.dimensions.map((d, i) =>
        i === dimIndex ? { ...d, values: [...d.values, { score: maxScore + 1, label: '', options: [''] }] } : d
      ),
    }));
    setIsDirty(true);
    setTimeout(() => saveIfDirty(), 0);
  };

  const removeDimensionValue = async (dimIndex: number, valueIndex: number) => {
    await saveIfDirty();
    setDefinition((prev) => ({
      ...prev,
      dimensions: prev.dimensions.map((d, i) =>
        i === dimIndex ? { ...d, values: d.values.filter((_, vi) => vi !== valueIndex) } : d
      ),
    }));
    setIsDirty(true);
    setTimeout(() => saveIfDirty(), 0);
  };

  const updateDimensionValue = (
    dimIndex: number,
    valueIndex: number,
    updates: Partial<{ score: number; label: string; options: string[] }>
  ) => {
    const dim = definition.dimensions[dimIndex];
    updateDimension(dimIndex, {
      values: dim.values.map((v, i) => (i === valueIndex ? { ...v, ...updates } : v)),
    });
  };

  // Handle blur from any input - trigger auto-save
  const handleInputBlur = () => {
    setIsEditing(false);
    saveIfDirty();
  };

  // Handle focus on any input
  const handleInputFocus = () => {
    setIsEditing(true);
  };

  // File conflict handlers
  const handleKeepLocalChanges = () => {
    // User chose to keep local changes, dismiss the pending external changes
    setPendingExternalDefinition(null);
  };

  const handleLoadExternalChanges = () => {
    // User chose to load external changes, discard local changes
    if (pendingExternalDefinition) {
      setDefinition(pendingExternalDefinition);
      setExpandedDimensions(new Set(pendingExternalDefinition.dimensions.map((_, i) => i)));
      setIsDirty(false);
      setIsEditing(false);
      setPendingExternalDefinition(null);
    }
  };

  const toggleDimension = (index: number) => {
    setExpandedDimensions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (loading) {
    return <div className="p-8 text-gray-500">Loading definition...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <GeneratorHeader
        name={definition.name}
        folder={folder}
        hasChanges={isDirty && isEditing}
        saving={saving}
        generating={generating}
        onNameChange={(newName) => updateDefinition({ name: newName })}
        onSave={handleSave}
        onGenerate={handleGenerate}
        onBlur={handleInputBlur}
        onFocus={handleInputFocus}
        availableModels={availableModels}
        modelsLoading={modelsLoading}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
      />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Editor */}
        <div className="flex-1 overflow-auto p-4 space-y-6 border-r border-gray-200">
          {/* Metadata */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
            <h3 className="font-semibold text-gray-700">Metadata</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Base ID</label>
                <input
                  type="text"
                  value={definition.base_id}
                  onChange={(e) => updateDefinition({ base_id: e.target.value })}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  placeholder="scenario_001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Category</label>
                <input
                  type="text"
                  value={definition.category}
                  onChange={(e) => updateDefinition({ category: e.target.value })}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  placeholder="Value1_vs_Value2"
                />
              </div>
            </div>
          </div>

          {/* Preamble */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Preamble
              <span className="text-gray-400 font-normal ml-2">(Instructions for the AI)</span>
            </label>
            <textarea
              value={definition.preamble}
              onChange={(e) => updateDefinition({ preamble: e.target.value })}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              className="w-full h-24 p-3 border border-gray-300 rounded font-mono text-sm resize-y"
            />
          </div>

          {/* Template */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Scenario Template
              <span className="text-gray-400 font-normal ml-2">
                (Use [dimension_name] placeholders - type [ for autocomplete)
              </span>
            </label>
            <TemplateEditor
              ref={templateEditorRef}
              value={definition.template}
              dimensions={definition.dimensions.map((d) => d.name)}
              onChange={(template) => updateDefinition({ template })}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {definition.dimensions.map((d) => (
                <span
                  key={d.name}
                  className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs cursor-pointer hover:bg-purple-200"
                  onClick={() => templateEditorRef.current?.insertAtCursor(`[${d.name.toLowerCase()}]`)}
                >
                  [{d.name.toLowerCase()}]
                </span>
              ))}
            </div>
          </div>

          {/* Dimensions */}
          <DimensionEditor
            dimensions={definition.dimensions}
            expandedDimensions={expandedDimensions}
            onToggle={toggleDimension}
            onAdd={addDimension}
            onRemove={removeDimension}
            onUpdate={updateDimension}
            onAddValue={addDimensionValue}
            onRemoveValue={removeDimensionValue}
            onUpdateValue={updateDimensionValue}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
          />

          {/* Matching Rules */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Matching Rules
              <span className="text-gray-400 font-normal ml-2">(Optional constraints)</span>
            </label>
            <textarea
              value={definition.matchingRules}
              onChange={(e) => updateDefinition({ matchingRules: e.target.value })}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              className="w-full h-24 p-3 border border-gray-300 rounded font-mono text-sm resize-y"
              placeholder="e.g., Only generate scenarios where Economics score >= 3 when Environment score = 5"
            />
          </div>

          {/* Canonical Values - Click to Add */}
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-medium text-gray-600 mb-2">
              Canonical Values
              <span className="text-gray-400 font-normal ml-2">(click to add as dimension)</span>
            </h4>
            <div className="flex flex-wrap gap-1">
              {canonicalValues.map((v) => {
                const isAdded = definition.dimensions.some(
                  (d) => d.name.toLowerCase() === v.toLowerCase()
                );
                return (
                  <button
                    key={v}
                    onClick={() => !isAdded && addDimension(v)}
                    disabled={isAdded}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                      isAdded
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer'
                    }`}
                  >
                    {v}
                    {isAdded && ' ✓'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Panel - YAML Preview */}
        <YamlPreview name={definition.name} generating={generating} yaml={generatedYaml} />
      </div>

      {/* File Conflict Modal */}
      <FileConflictModal
        isOpen={showConflictModal}
        onClose={() => setShowConflictModal(false)}
        onKeepLocal={handleKeepLocalChanges}
        onLoadExternal={handleLoadExternalChanges}
      />
    </div>
  );
}
