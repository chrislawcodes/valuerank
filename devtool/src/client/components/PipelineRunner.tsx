import { useState, useRef, useEffect } from 'react';
import { runner, scenarios } from '../lib/api';
import { Play, Square, Terminal, X } from 'lucide-react';
import { ModelSelector, useAvailableModels } from './ModelSelector';

interface PipelineRunnerProps {
  scenariosFolder?: string;
}

type Command = 'probe' | 'summary';

interface ArgConfig {
  key: string;
  label: string;
  placeholder: string;
  required?: boolean;
  type?: 'text' | 'run-dir' | 'scenarios-folder';
}

interface CommandConfig {
  name: string;
  command: Command;
  description: string;
  args: ArgConfig[];
  /** If true, show model selector for this command */
  hasModelSelector?: boolean;
  /** The argument key to use for the model (e.g., 'summary-model') */
  modelArgKey?: string;
  /** localStorage key for persisting model selection */
  modelStorageKey?: string;
}

const COMMANDS: CommandConfig[] = [
  {
    name: 'Probe',
    command: 'probe',
    description: 'Deliver scenarios to target AI models and record transcripts',
    args: [
      { key: 'scenarios-folder', label: 'Scenarios Folder', placeholder: 'scenarios/User Preference', required: true, type: 'scenarios-folder' },
      { key: 'output-dir', label: 'Output Directory', placeholder: 'output' },
    ],
  },
  {
    name: 'Summary',
    command: 'summary',
    description: 'Generate natural language summaries',
    args: [
      { key: 'run-dir', label: 'Run Directory', placeholder: 'output/run_id', required: true, type: 'run-dir' },
      { key: 'scenarios-file', label: 'Scenarios Folder', placeholder: 'scenarios/folder', type: 'scenarios-folder' },
    ],
    hasModelSelector: true,
    modelArgKey: 'summary-model',
    modelStorageKey: 'devtool:runner:summary-model',
  },
];

export function PipelineRunner({ scenariosFolder }: PipelineRunnerProps) {
  const [selectedCommand, setSelectedCommand] = useState<CommandConfig>(COMMANDS[0]);
  const [argValues, setArgValues] = useState<Record<string, string>>({});
  const [runId, setRunId] = useState<string | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runs, setRuns] = useState<string[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Model selection for commands that support it
  const { models: availableModels, loading: modelsLoading, defaultModel } = useAvailableModels();
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Initialize model from localStorage or default
  useEffect(() => {
    if (selectedCommand.hasModelSelector && selectedCommand.modelStorageKey) {
      const saved = localStorage.getItem(selectedCommand.modelStorageKey);
      if (saved && availableModels.some(m => m.id === saved)) {
        setSelectedModel(saved);
      } else if (defaultModel) {
        setSelectedModel(defaultModel);
      }
    }
  }, [selectedCommand, availableModels, defaultModel]);

  // Handle model change with localStorage persistence
  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    if (selectedCommand.modelStorageKey) {
      localStorage.setItem(selectedCommand.modelStorageKey, modelId);
    }
  };

  useEffect(() => {
    loadRuns();
    loadFolders();
  }, []);

  useEffect(() => {
    if (scenariosFolder) {
      setArgValues((prev) => ({
        ...prev,
        'scenarios-folder': `scenarios/${scenariosFolder}`,
      }));
    }
  }, [scenariosFolder]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const loadRuns = async () => {
    try {
      const { runs } = await runner.getRuns();
      setRuns(runs);
    } catch (e) {
      console.error('Failed to load runs:', e);
    }
  };

  const loadFolders = async () => {
    try {
      const { folders } = await scenarios.getFolders();
      setFolders(folders);
    } catch (e) {
      console.error('Failed to load folders:', e);
    }
  };

  const handleStart = async () => {
    try {
      setOutput([]);
      setIsRunning(true);

      // Only pass args that are defined for the current command
      const validArgKeys = new Set(selectedCommand.args.map(a => a.key));
      const filteredArgs = Object.fromEntries(
        Object.entries(argValues).filter(([key]) => validArgKeys.has(key))
      );

      // Add model selection if this command supports it
      if (selectedCommand.hasModelSelector && selectedCommand.modelArgKey && selectedModel) {
        filteredArgs[selectedCommand.modelArgKey] = selectedModel;
      }

      const result = await runner.start(selectedCommand.command, filteredArgs);
      setRunId(result.runId);

      setOutput((prev) => [
        ...prev,
        `> python3 -m ${selectedCommand.command === 'probe' ? 'src.probe' : `src.${selectedCommand.command}`} ${result.args.slice(2).join(' ')}`,
        '',
      ]);

      cleanupRef.current = runner.streamOutput(result.runId, (type, data) => {
        if (type === 'stdout' || type === 'stderr') {
          setOutput((prev) => [...prev, data]);
        } else if (type === 'exit') {
          setOutput((prev) => [...prev, '', `Process exited with code ${data}`]);
          setIsRunning(false);
          setRunId(null);
          loadRuns();
        }
      });
    } catch (e) {
      setOutput((prev) => [...prev, `Error: ${e}`]);
      setIsRunning(false);
    }
  };

  const handleStop = async () => {
    if (runId) {
      try {
        await runner.stop(runId);
        cleanupRef.current?.();
        setOutput((prev) => [...prev, '', 'Process terminated by user']);
        setIsRunning(false);
        setRunId(null);
      } catch (e) {
        console.error('Failed to stop:', e);
      }
    }
  };

  const handleClear = () => {
    setOutput([]);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <Terminal size={20} className="text-green-600" />
          <h2 className="font-semibold text-gray-900">Pipeline Runner</h2>
        </div>

        {/* Command Selector */}
        <div className="flex gap-2 mb-4">
          {COMMANDS.map((cmd) => (
            <button
              key={cmd.command}
              onClick={() => setSelectedCommand(cmd)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                selectedCommand.command === cmd.command
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cmd.name}
            </button>
          ))}
        </div>

        {/* Description */}
        <p className="text-sm text-gray-500 mb-4">{selectedCommand.description}</p>

        {/* Arguments */}
        <div className="space-y-3 mb-4">
          {selectedCommand.args.map((arg) => (
            <div key={arg.key} className="flex items-center gap-3">
              <label className="text-sm text-gray-700 w-32 flex-shrink-0">
                {arg.label}
                {arg.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              {arg.type === 'run-dir' ? (
                <select
                  value={argValues[arg.key] || ''}
                  onChange={(e) =>
                    setArgValues((prev) => ({ ...prev, [arg.key]: e.target.value }))
                  }
                  className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-sm"
                >
                  <option value="">Select a run...</option>
                  {runs.map((run) => (
                    <option key={run} value={`output/${run}`}>
                      {run}
                    </option>
                  ))}
                </select>
              ) : arg.type === 'scenarios-folder' ? (
                <select
                  value={argValues[arg.key] || ''}
                  onChange={(e) =>
                    setArgValues((prev) => ({ ...prev, [arg.key]: e.target.value }))
                  }
                  className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-sm"
                >
                  <option value="">Select a folder...</option>
                  {folders.map((folder) => (
                    <option key={folder} value={`scenarios/${folder}`}>
                      {folder}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={argValues[arg.key] || ''}
                  onChange={(e) =>
                    setArgValues((prev) => ({ ...prev, [arg.key]: e.target.value }))
                  }
                  placeholder={arg.placeholder}
                  className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-sm placeholder-gray-400"
                />
              )}
            </div>
          ))}

          {/* Model Selector (for commands that support it) */}
          {selectedCommand.hasModelSelector && (
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-700 w-32 flex-shrink-0">
                Model
              </label>
              <ModelSelector
                models={availableModels}
                selectedModel={selectedModel}
                onModelChange={handleModelChange}
                loading={modelsLoading}
                disabled={isRunning}
                className="flex-1"
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              <Square size={16} />
              Stop
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              <Play size={16} />
              Run
            </button>
          )}
          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            <X size={16} />
            Clear
          </button>
        </div>
      </div>

      {/* Output */}
      <div
        ref={outputRef}
        className="flex-1 overflow-auto p-4 font-mono text-sm whitespace-pre-wrap bg-gray-900 text-gray-100"
      >
        {output.length === 0 ? (
          <span className="text-gray-500">Output will appear here...</span>
        ) : (
          output.map((line, i) => (
            <div key={i} className={line.startsWith('>') ? 'text-green-400' : ''}>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
