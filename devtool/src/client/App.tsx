import { useState, useRef } from 'react';
import { ScenarioList, type ScenarioListHandle } from './components/ScenarioList';
import { ScenarioEditor } from './components/ScenarioEditor';
import { PipelineRunner } from './components/PipelineRunner';
import { ScenarioGenerator } from './components/ScenarioGenerator';
import { FileText, Terminal, Settings } from 'lucide-react';

type EditorMode = 'yaml' | 'definition' | 'new-definition' | 'none';

interface EditorState {
  mode: EditorMode;
  folder: string;
  file: string; // filename for yaml, name (without ext) for definition
}

function App() {
  const [view, setView] = useState<'editor' | 'runner' | 'settings'>('editor');
  const [editorState, setEditorState] = useState<EditorState>({
    mode: 'none',
    folder: '',
    file: '',
  });
  const scenarioListRef = useRef<ScenarioListHandle>(null);

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
    // Generate default name based on folder
    const baseName = `${folder}-scenario`;
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

        {view === 'settings' && (
          <main className="flex-1 p-8 bg-gray-50">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold mb-6">Settings</h2>
              <div className="bg-white rounded-lg border border-gray-200 p-6">
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
                <p className="text-gray-500 text-sm mt-4">
                  Edit these files directly or use a text editor for advanced configuration.
                </p>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
                <h3 className="font-semibold mb-4">LLM API Keys</h3>
                <p className="text-sm text-gray-600 mb-3">
                  The Generator requires an API key. Add one of these to your{' '}
                  <code className="bg-gray-100 px-1 rounded">.env</code> file:
                </p>
                <div className="space-y-2 text-sm font-mono bg-gray-50 p-3 rounded">
                  <div>ANTHROPIC_API_KEY=sk-ant-...</div>
                  <div>OPENAI_API_KEY=sk-...</div>
                </div>
              </div>

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

              <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
                <h3 className="font-semibold mb-4">14 Canonical Values</h3>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Physical_Safety',
                    'Compassion',
                    'Fair_Process',
                    'Equal_Outcomes',
                    'Freedom',
                    'Social_Duty',
                    'Harmony',
                    'Loyalty',
                    'Economics',
                    'Human_Worthiness',
                    'Childrens_Rights',
                    'Animal_Rights',
                    'Environmental_Rights',
                    'Tradition',
                  ].map((value) => (
                    <span
                      key={value}
                      className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm"
                    >
                      {value}
                    </span>
                  ))}
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
