import { useState, useRef, useEffect } from 'react';
import { ScenarioList, type ScenarioListHandle } from './components/ScenarioList';
import { ScenarioEditor } from './components/ScenarioEditor';
import { PipelineRunner } from './components/PipelineRunner';
import { ScenarioGenerator } from './components/ScenarioGenerator';
import { Analyze } from './components/Analyze';
import { FileText, Terminal, Settings, BarChart3, Check, X } from 'lucide-react';

type ViewType = 'editor' | 'runner' | 'analyze' | 'settings';

const VALID_VIEWS: ViewType[] = ['editor', 'runner', 'analyze', 'settings'];

/** Parse URL path and params to get initial state */
function parseUrlState(): { view: ViewType; folder?: string; file?: string } {
  // Extract view from pathname (e.g., /editor, /runner, /analyze, /settings)
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const viewFromPath = pathParts[0] as ViewType | undefined;
  const view = viewFromPath && VALID_VIEWS.includes(viewFromPath) ? viewFromPath : 'editor';

  const params = new URLSearchParams(window.location.search);
  const folder = params.get('folder') || undefined;
  const file = params.get('file') || undefined;

  return { view, folder, file };
}

/** Update URL without triggering a page reload */
function updateUrl(view: ViewType, folder?: string, file?: string) {
  const params = new URLSearchParams();
  if (view === 'editor' && folder) {
    params.set('folder', folder);
    if (file) {
      params.set('file', file);
    }
  }
  const queryString = params.toString();
  const newUrl = `/${view}${queryString ? `?${queryString}` : ''}`;
  window.history.replaceState({}, '', newUrl);
}

interface LLMProvider {
  id: string;
  name: string;
  envKey: string;
  icon: string;
  configured: boolean;
}

interface DimensionLevel {
  score: number;
  label: string;
  options: string[];
}

interface CanonicalDimension {
  description: string;
  levels: DimensionLevel[];
}

type EditorMode = 'yaml' | 'definition' | 'new-definition' | 'none';

interface EditorState {
  mode: EditorMode;
  folder: string;
  file: string; // filename for yaml, name (without ext) for definition
}

function App() {
  // Initialize state from URL
  const initialState = parseUrlState();
  const [view, setView] = useState<ViewType>(initialState.view);
  const [editorState, setEditorState] = useState<EditorState>(() => {
    // If URL has folder/file, we need to determine the mode
    if (initialState.folder && initialState.file) {
      if (initialState.file.endsWith('.yaml') || initialState.file.endsWith('.yml')) {
        return { mode: 'yaml', folder: initialState.folder, file: initialState.file };
      } else if (initialState.file.endsWith('.md')) {
        return { mode: 'definition', folder: initialState.folder, file: initialState.file.replace(/\.md$/, '') };
      }
      // Assume yaml if no extension
      return { mode: 'yaml', folder: initialState.folder, file: initialState.file };
    }
    return { mode: 'none', folder: initialState.folder || '', file: '' };
  });
  const scenarioListRef = useRef<ScenarioListHandle>(null);

  // Update URL when view or editor state changes
  useEffect(() => {
    const file = editorState.mode === 'yaml'
      ? editorState.file
      : editorState.mode === 'definition' || editorState.mode === 'new-definition'
      ? `${editorState.file}.md`
      : undefined;
    updateUrl(view, editorState.folder || undefined, file);
  }, [view, editorState]);

  // Settings state
  const [llmProviders, setLlmProviders] = useState<LLMProvider[]>([]);
  const [dimensions, setDimensions] = useState<Record<string, CanonicalDimension>>({});
  const [selectedDimension, setSelectedDimension] = useState<string | null>(null);

  // Fetch settings data when settings view is shown
  useEffect(() => {
    if (view === 'settings') {
      // Fetch LLM providers
      fetch('/api/config/llm-providers')
        .then(res => res.json())
        .then(data => setLlmProviders(data.providers || []))
        .catch(console.error);

      // Fetch canonical dimensions
      fetch('/api/config/canonical-dimensions')
        .then(res => res.json())
        .then(data => {
          setDimensions(data.dimensions || {});
          // Select first dimension if none selected
          if (!selectedDimension && data.dimensions) {
            const keys = Object.keys(data.dimensions);
            if (keys.length > 0) {
              setSelectedDimension(keys[0]);
            }
          }
        })
        .catch(console.error);
    }
  }, [view]);

  // Save dimension on blur
  const saveDimension = async (name: string, dimension: CanonicalDimension) => {
    try {
      await fetch(`/api/config/canonical-dimensions/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dimension),
      });
    } catch (error) {
      console.error('Failed to save dimension:', error);
    }
  };

  const updateDimensionField = (name: string, field: keyof CanonicalDimension, value: string | DimensionLevel[]) => {
    setDimensions(prev => ({
      ...prev,
      [name]: {
        ...prev[name],
        [field]: value,
      },
    }));
  };

  const updateLevelField = (dimName: string, levelIndex: number, field: keyof DimensionLevel, value: string | number | string[]) => {
    setDimensions(prev => {
      const dim = prev[dimName];
      if (!dim) return prev;
      const newLevels = [...dim.levels];
      newLevels[levelIndex] = {
        ...newLevels[levelIndex],
        [field]: value,
      };
      return {
        ...prev,
        [dimName]: {
          ...dim,
          levels: newLevels,
        },
      };
    });
  };

  const handleSelectYaml = (folder: string, file: string) => {
    setEditorState({ mode: 'yaml', folder, file });
  };

  const handleSelectDefinition = (folder: string, name: string, isNew: boolean) => {
    setEditorState({
      mode: isNew ? 'new-definition' : 'definition',
      folder,
      file: name,
    });
  };

  const handleCreateNew = (folder: string) => {
    // Generate default name with exp- prefix (required for summary script)
    const baseName = `exp-${folder}.new`;
    setEditorState({
      mode: 'new-definition',
      folder,
      file: baseName,
    });
  };

  const handleSaved = () => {
    // Refresh the current folder in the scenario list
    if (editorState.folder) {
      scenarioListRef.current?.refreshFolder(editorState.folder);
    }
  };

  const handleCloseGenerator = () => {
    setEditorState({ mode: 'none', folder: '', file: '' });
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Top Nav */}
      <header className="bg-gray-800 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">ValueRank DevTool</h1>
          <span className="text-xs bg-gray-700 px-2 py-0.5 rounded">v1.0</span>
        </div>
        <nav className="flex items-center gap-1">
          <button
            onClick={() => setView('editor')}
            className={`flex items-center gap-2 px-4 py-2 rounded transition-colors ${
              view === 'editor'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <FileText size={18} />
            Editor
          </button>
          <button
            onClick={() => setView('runner')}
            className={`flex items-center gap-2 px-4 py-2 rounded transition-colors ${
              view === 'runner'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Terminal size={18} />
            Runner
          </button>
          <button
            onClick={() => setView('analyze')}
            className={`flex items-center gap-2 px-4 py-2 rounded transition-colors ${
              view === 'analyze'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <BarChart3 size={18} />
            Analyze
          </button>
          <button
            onClick={() => setView('settings')}
            className={`flex items-center gap-2 px-4 py-2 rounded transition-colors ${
              view === 'settings'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Settings size={18} />
            Settings
          </button>
        </nav>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {view === 'editor' && (
          <>
            {/* Sidebar */}
            <aside className="w-144 border-r border-gray-200 bg-white flex-shrink-0">
              <ScenarioList
                ref={scenarioListRef}
                onSelectYaml={handleSelectYaml}
                onSelectDefinition={handleSelectDefinition}
                onCreateNew={handleCreateNew}
                selectedFolder={editorState.folder}
                selectedFile={
                  editorState.mode === 'yaml'
                    ? editorState.file
                    : editorState.mode === 'definition'
                    ? `${editorState.file}.md`
                    : undefined
                }
              />
            </aside>

            {/* Editor */}
            <main className="flex-1 bg-gray-50 overflow-hidden">
              {editorState.mode === 'yaml' && (
                <ScenarioEditor
                  folder={editorState.folder}
                  filename={editorState.file}
                  onSaved={handleSaved}
                />
              )}

              {(editorState.mode === 'definition' || editorState.mode === 'new-definition') && (
                <ScenarioGenerator
                  folder={editorState.folder}
                  name={editorState.file}
                  isNew={editorState.mode === 'new-definition'}
                  onSaved={handleSaved}
                  onClose={handleCloseGenerator}
                />
              )}

              {editorState.mode === 'none' && (
                <div className="h-full flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <FileText size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Select a scenario file from the sidebar</p>
                    <p className="text-sm mt-2">
                      Click <span className="text-purple-500">+</span> on a folder to create a new scenario definition
                    </p>
                  </div>
                </div>
              )}
            </main>
          </>
        )}

        {view === 'runner' && (
          <main className="flex-1">
            <PipelineRunner scenariosFolder={editorState.folder} />
          </main>
        )}

        {view === 'analyze' && (
          <main className="flex-1">
            <Analyze />
          </main>
        )}

        {view === 'settings' && (
          <main className="flex-1 p-8 bg-gray-50 overflow-auto">
            <div className="max-w-5xl">
              <h2 className="text-2xl font-bold mb-6">Settings</h2>

              {/* LLM API Keys Section */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="font-semibold mb-4">LLM API Keys</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Configure API keys in your <code className="bg-gray-100 px-1 rounded">.env</code> file.
                </p>
                <div className="space-y-2">
                  {llmProviders.map(provider => (
                    <div
                      key={provider.id}
                      className="flex items-center justify-between py-2 px-3 rounded bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-5 h-5 flex-shrink-0"
                          dangerouslySetInnerHTML={{ __html: provider.icon }}
                        />
                        <span className={provider.configured ? 'text-gray-900' : 'text-gray-500'}>
                          {provider.name}
                        </span>
                        {provider.configured ? (
                          <Check size={16} className="text-green-500" />
                        ) : (
                          <X size={16} className="text-gray-300" />
                        )}
                      </div>
                      <code className="text-xs text-gray-400">{provider.envKey}</code>
                    </div>
                  ))}
                </div>
              </div>

              {/* Canonical Dimensions Section */}
              <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
                <h3 className="font-semibold mb-4">Canonical Dimensions</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Define the moral dimensions used for scenario generation. Changes are saved automatically on blur.
                </p>
                <div className="flex gap-4">
                  {/* Dimension List (Left Pane) */}
                  <div className="w-56 flex-shrink-0 border-r border-gray-200 pr-4">
                    <div className="space-y-1">
                      {Object.keys(dimensions).map(name => (
                        <button
                          key={name}
                          onClick={() => setSelectedDimension(name)}
                          className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                            selectedDimension === name
                              ? 'bg-blue-100 text-blue-800'
                              : 'hover:bg-gray-100 text-gray-700'
                          }`}
                        >
                          {name.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dimension Editor (Right Pane) */}
                  <div className="flex-1 min-w-0">
                    {selectedDimension && dimensions[selectedDimension] && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Description
                          </label>
                          <input
                            type="text"
                            value={dimensions[selectedDimension].description}
                            onChange={e => updateDimensionField(selectedDimension, 'description', e.target.value)}
                            onBlur={() => saveDimension(selectedDimension, dimensions[selectedDimension])}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Score Levels
                          </label>
                          <div className="space-y-3">
                            {dimensions[selectedDimension].levels.map((level, idx) => (
                              <div key={idx} className="p-3 bg-gray-50 rounded-md">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="text-sm font-medium text-gray-500 w-16">
                                    Score {level.score}
                                  </span>
                                  <input
                                    type="text"
                                    value={level.label}
                                    onChange={e => updateLevelField(selectedDimension, idx, 'label', e.target.value)}
                                    onBlur={() => saveDimension(selectedDimension, dimensions[selectedDimension])}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Label"
                                  />
                                </div>
                                <textarea
                                  value={level.options.join('\n')}
                                  onChange={e => updateLevelField(selectedDimension, idx, 'options', e.target.value.split('\n'))}
                                  onBlur={() => saveDimension(selectedDimension, dimensions[selectedDimension])}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  rows={Math.max(2, level.options.length)}
                                  placeholder="Options (one per line)"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {!selectedDimension && (
                      <div className="text-gray-400 text-sm">
                        Select a dimension to edit
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Configuration Files Section */}
              <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
                <h3 className="font-semibold mb-4">Configuration Files</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">Runtime Config</span>
                    <code className="bg-gray-100 px-2 py-1 rounded">config/runtime.yaml</code>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">Values Rubric</span>
                    <code className="bg-gray-100 px-2 py-1 rounded">config/values_rubric.yaml</code>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-gray-600">Model Costs</span>
                    <code className="bg-gray-100 px-2 py-1 rounded">config/model_costs.yaml</code>
                  </div>
                </div>
              </div>

              {/* File Types Section */}
              <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
                <h3 className="font-semibold mb-4">File Types</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <span className="text-purple-500 font-mono">.md</span>
                    <span className="text-gray-600">
                      Scenario definition files. These define dimensions and templates for generating
                      scenario combinations.
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-gray-500 font-mono">.yaml</span>
                    <span className="text-gray-600">
                      Generated scenario files. These contain the actual scenarios that get sent to AI
                      models during evaluation.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}

export default App;
