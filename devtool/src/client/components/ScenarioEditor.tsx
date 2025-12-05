import { useState, useEffect } from 'react';
import { scenarios, config, type ScenarioFile, type Scenario } from '../lib/api';
import { Save, Plus, Trash2, Copy, ChevronDown, ChevronRight } from 'lucide-react';

interface ScenarioEditorProps {
  folder: string;
  filename: string;
  onSaved?: () => void;
}

export function ScenarioEditor({ folder, filename, onSaved }: ScenarioEditorProps) {
  const [data, setData] = useState<ScenarioFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canonicalValues, setCanonicalValues] = useState<string[]>([]);
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);

  // Shared metadata (same for all scenarios)
  const [sharedBaseId, setSharedBaseId] = useState('scenario_001');
  const [sharedCategory, setSharedCategory] = useState('');

  useEffect(() => {
    loadScenario();
    loadValues();
  }, [folder, filename]);

  const loadScenario = async () => {
    try {
      setLoading(true);
      const fileData = await scenarios.getFile(folder, filename);
      setData(fileData);
      // Expand all scenarios by default
      setExpandedScenarios(new Set(Object.keys(fileData.scenarios)));

      // Extract shared metadata from first scenario
      const firstScenario = Object.values(fileData.scenarios)[0];
      if (firstScenario) {
        setSharedBaseId(firstScenario.base_id || 'scenario_001');
        setSharedCategory(firstScenario.category || '');
      }

      setHasChanges(false);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadValues = async () => {
    try {
      const { values } = await config.getValues();
      setCanonicalValues(values);
    } catch (e) {
      console.error('Failed to load values:', e);
    }
  };

  const handleSave = async () => {
    if (!data) return;
    try {
      setSaving(true);
      await scenarios.updateFile(folder, filename, data);
      setHasChanges(false);
      onSaved?.();
    } catch (e) {
      setError(`Failed to save: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const updatePreamble = (preamble: string) => {
    if (!data) return;
    setData({ ...data, preamble });
    setHasChanges(true);
  };

  const updateSharedBaseId = (base_id: string) => {
    if (!data) return;
    setSharedBaseId(base_id);
    // Update all scenarios
    const updatedScenarios = { ...data.scenarios };
    for (const key of Object.keys(updatedScenarios)) {
      updatedScenarios[key] = { ...updatedScenarios[key], base_id };
    }
    setData({ ...data, scenarios: updatedScenarios });
    setHasChanges(true);
  };

  const updateSharedCategory = (category: string) => {
    if (!data) return;
    setSharedCategory(category);
    // Update all scenarios
    const updatedScenarios = { ...data.scenarios };
    for (const key of Object.keys(updatedScenarios)) {
      updatedScenarios[key] = { ...updatedScenarios[key], category };
    }
    setData({ ...data, scenarios: updatedScenarios });
    setHasChanges(true);
  };

  const updateScenario = (key: string, updates: Partial<Scenario>) => {
    if (!data) return;
    setData({
      ...data,
      scenarios: {
        ...data.scenarios,
        [key]: { ...data.scenarios[key], ...updates },
      },
    });
    setHasChanges(true);
  };

  const deleteScenario = (key: string) => {
    if (!data) return;
    if (!confirm(`Delete scenario "${key}"?`)) return;
    const newScenarios = { ...data.scenarios };
    delete newScenarios[key];
    setData({ ...data, scenarios: newScenarios });
    setHasChanges(true);
  };

  const duplicateScenario = (key: string) => {
    if (!data) return;
    const scenario = data.scenarios[key];
    const newKey = `${key}_copy`;
    setData({
      ...data,
      scenarios: {
        ...data.scenarios,
        [newKey]: { ...scenario, subject: `${scenario.subject} (copy)` },
      },
    });
    setExpandedScenarios((prev) => new Set([...prev, newKey]));
    setHasChanges(true);
  };

  const addScenario = () => {
    if (!data) return;
    const existingKeys = Object.keys(data.scenarios);
    const baseNum = existingKeys.length + 1;
    const newKey = `scenario_new_${baseNum}`;
    setData({
      ...data,
      scenarios: {
        ...data.scenarios,
        [newKey]: {
          base_id: sharedBaseId,
          category: sharedCategory,
          subject: 'New Scenario',
          body: 'Enter scenario description here...',
        },
      },
    });
    setExpandedScenarios((prev) => new Set([...prev, newKey]));
    setHasChanges(true);
  };

  const toggleScenario = (key: string) => {
    setExpandedScenarios((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (loading) {
    return <div className="p-8 text-gray-500">Loading scenario...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-red-500">
        Error: {error}
        <button onClick={loadScenario} className="ml-2 text-blue-500 underline">
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return <div className="p-8 text-gray-500">No scenario loaded</div>;
  }

  const scenarioKeys = Object.keys(data.scenarios);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <div>
          <h2 className="font-semibold text-lg">{filename}</h2>
          <p className="text-sm text-gray-500">{folder}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-sm text-orange-500">Unsaved changes</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Preamble */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Preamble
            <span className="text-gray-400 font-normal ml-2">
              (Instructions sent to the AI model)
            </span>
          </label>
          <textarea
            value={data.preamble}
            onChange={(e) => updatePreamble(e.target.value)}
            className="w-full h-32 p-3 border border-gray-300 rounded font-mono text-sm resize-y"
            placeholder="Enter preamble instructions..."
          />
        </div>

        {/* Shared Metadata */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Shared Metadata
            <span className="text-gray-400 font-normal ml-2">
              (Applied to all scenarios)
            </span>
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Base ID
              </label>
              <input
                type="text"
                value={sharedBaseId}
                onChange={(e) => updateSharedBaseId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="scenario_001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Category
              </label>
              <input
                type="text"
                value={sharedCategory}
                onChange={(e) => updateSharedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="Value1_vs_Value2"
              />
            </div>
          </div>
        </div>

        {/* Scenarios */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-700">
              Scenarios ({scenarioKeys.length})
            </h3>
            <button
              onClick={addScenario}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
            >
              <Plus size={14} />
              Add Scenario
            </button>
          </div>

          {scenarioKeys.map((key) => {
            const scenario = data.scenarios[key];
            const isExpanded = expandedScenarios.has(key);

            return (
              <div
                key={key}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden"
              >
                {/* Scenario Header */}
                <div
                  className="flex items-center gap-3 p-3 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleScenario(key)}
                >
                  {isExpanded ? (
                    <ChevronDown size={16} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-400" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{scenario.subject}</div>
                    <div className="text-xs text-gray-500">{key}</div>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => duplicateScenario(key)}
                      className="p-1.5 hover:bg-gray-200 rounded"
                      title="Duplicate"
                    >
                      <Copy size={14} className="text-gray-500" />
                    </button>
                    <button
                      onClick={() => deleteScenario(key)}
                      className="p-1.5 hover:bg-red-100 rounded"
                      title="Delete"
                    >
                      <Trash2 size={14} className="text-red-500" />
                    </button>
                  </div>
                </div>

                {/* Scenario Body */}
                {isExpanded && (
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={scenario.subject}
                        onChange={(e) =>
                          updateScenario(key, { subject: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Preference Frame
                          <span className="text-gray-400 font-normal ml-1">(optional)</span>
                        </label>
                        <select
                          value={scenario.preference_frame || ''}
                          onChange={(e) =>
                            updateScenario(key, {
                              preference_frame: e.target.value || undefined,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        >
                          <option value="">None</option>
                          <option value="neutral">neutral</option>
                          <option value="lean_follow">lean_follow</option>
                          <option value="strong_follow">strong_follow</option>
                          <option value="lean_ignore">lean_ignore</option>
                          <option value="strong_ignore">strong_ignore</option>
                          <option value="self_soft">self_soft</option>
                          <option value="self_strong">self_strong</option>
                          <option value="others_soft">others_soft</option>
                          <option value="others_strong">others_strong</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Preference Value Tilt
                          <span className="text-gray-400 font-normal ml-1">(optional)</span>
                        </label>
                        <select
                          value={scenario.preference_value_tilt || ''}
                          onChange={(e) =>
                            updateScenario(key, {
                              preference_value_tilt: e.target.value || undefined,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        >
                          <option value="">None</option>
                          {canonicalValues.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Body
                      </label>
                      <textarea
                        value={scenario.body}
                        onChange={(e) =>
                          updateScenario(key, { body: e.target.value })
                        }
                        className="w-full h-48 p-3 border border-gray-300 rounded font-mono text-sm resize-y"
                        placeholder="Enter the moral dilemma scenario..."
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
