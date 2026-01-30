import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { runner, scenarios, type CostEstimate, config } from '../lib/api';
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
    description: 'Deliver narratives to target AI models and record transcripts',
    args: [
      { key: 'scenarios-folder', label: 'Narratives Folder', placeholder: 'scenarios/User Preference', required: true, type: 'scenarios-folder' },
      { key: 'output-dir', label: 'Output Directory', placeholder: 'output' },
    ],
  },
  {
    name: 'Summary',
    command: 'summary',
    description: 'Generate natural language summaries',
    args: [
      { key: 'run-dir', label: 'Trial Directory', placeholder: 'output/run_id', required: true, type: 'run-dir' },
      { key: 'scenarios-file', label: 'Narratives Folder', placeholder: 'scenarios/folder', type: 'scenarios-folder' },
    ],
    hasModelSelector: true,
    modelArgKey: 'summary-model',
    modelStorageKey: 'devtool:runner:summary-model',
  },
];

const formatCost = (value: number): string => {
  if (value < 0.005) {
    return '< $0.01';
  }
  return `$${value.toFixed(value >= 1 ? 2 : 3)}`;
};

const formatRate = (input?: number, output?: number) => {
  if (typeof input !== 'number' || typeof output !== 'number') {
    return '';
  }
  const fmt = (n: number) => `$${n >= 1 ? n.toFixed(2) : n.toFixed(3)}`;
  return `${fmt(input)} in / ${fmt(output)} out per 1M`;
};

interface ModelCostEntry {
  input_per_million?: number;
  output_per_million?: number;
}

interface ModelCostsResponse {
  defaults?: ModelCostEntry;
  models?: Record<string, ModelCostEntry>;
}

interface ProviderGroup {
  providerId: string;
  providerName: string;
  providerIcon: string;
  models: {
    id: string;
    name: string;
    costLabel: string;
  }[];
}

export function PipelineRunner({ scenariosFolder }: PipelineRunnerProps) {
  const [selectedCommand, setSelectedCommand] = useState<CommandConfig>(COMMANDS[0]);
  const [argValues, setArgValues] = useState<Record<string, string>>({});
  const [runId, setRunId] = useState<string | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);
  const [estimatingCost, setEstimatingCost] = useState(false);
  const [modelCosts, setModelCosts] = useState<ModelCostsResponse | null>(null);
  const [loadingModelCosts, setLoadingModelCosts] = useState(true);
  const [runtimeConfig, setRuntimeConfig] = useState<any | null>(null);
  const [loadingRuntime, setLoadingRuntime] = useState(true);
  const [updatingProvider, setUpdatingProvider] = useState<string | null>(null);
  const [runs, setRuns] = useState<string[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const costRequestIdRef = useRef(0);

  // Model selection for commands that support it
  const { models: availableModels, loading: modelsLoading, defaultModel } = useAvailableModels();
  const [selectedModel, setSelectedModel] = useState<string>('');

  const getModelRatesForId = (modelId: string) => {
    const defaults = modelCosts?.defaults || {};
    const entry = modelCosts?.models?.[modelId] || {};
    const input = entry.input_per_million ?? defaults.input_per_million;
    const output = entry.output_per_million ?? defaults.output_per_million;
    return { input, output };
  };

  // Initialize model from localStorage or default
  useEffect(() => {
    if (selectedCommand.hasModelSelector && selectedCommand.modelStorageKey && !selectedModel) {
      const saved = localStorage.getItem(selectedCommand.modelStorageKey);
      const runtimeDefault = runtimeConfig?.defaults?.summary_model;
      if (saved && availableModels.some(m => m.id === saved)) {
        setSelectedModel(saved);
      } else if (runtimeDefault && availableModels.some(m => m.id === runtimeDefault)) {
        setSelectedModel(runtimeDefault);
      } else if (defaultModel) {
        setSelectedModel(defaultModel);
      }
    }
  }, [selectedCommand, availableModels, defaultModel, runtimeConfig, selectedModel]);

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
    let cancelled = false;
    async function fetchRuntime() {
      try {
        const data = await config.getRuntime();
        if (!cancelled) {
          setRuntimeConfig(data);
        }
      } catch (error) {
        console.error('Failed to load runtime config:', error);
      } finally {
        if (!cancelled) {
          setLoadingRuntime(false);
        }
      }
    }
    fetchRuntime();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchModelCosts() {
      try {
        const data = await config.getModelCosts();
        if (!cancelled) {
          setModelCosts(data as ModelCostsResponse);
        }
      } catch (error) {
        console.error('Failed to load model costs:', error);
      } finally {
        if (!cancelled) {
          setLoadingModelCosts(false);
        }
      }
    }
    fetchModelCosts();
    return () => {
      cancelled = true;
    };
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

  const providerSelections = useMemo(() => {
    const selections: Record<string, Set<string>> = {};
    const targets: string[] = runtimeConfig?.defaults?.target_models || [];
    targets.forEach((modelId) => {
      if (!modelId) return;
      const [providerId] = modelId.split(':');
      if (!providerId) return;
      if (!selections[providerId]) {
        selections[providerId] = new Set();
      }
      selections[providerId].add(modelId);
    });
    return selections;
  }, [runtimeConfig]);

  const providerGroups = useMemo<ProviderGroup[]>(() => {
    if (!availableModels.length) {
      return [];
    }
    const groups = new Map<string, ProviderGroup>();
    availableModels.forEach(model => {
      const existing = groups.get(model.providerId);
      const rates = getModelRatesForId(model.id);
      const costLabel = formatRate(rates.input, rates.output);
      if (existing) {
        existing.models.push({
          id: model.id,
          name: model.name,
          costLabel,
        });
      } else {
        groups.set(model.providerId, {
          providerId: model.providerId,
          providerName: model.providerName,
          providerIcon: model.providerIcon,
          models: [
            {
              id: model.id,
              name: model.name,
              costLabel,
            },
          ],
        });
      }
    });
    return Array.from(groups.values()).sort((a, b) => a.providerName.localeCompare(b.providerName));
  }, [availableModels, modelCosts]);

  const targetModelsSignature = runtimeConfig?.defaults?.target_models?.join('|') || '';

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

  const buildCommandArgs = useCallback(() => {
    const validArgKeys = new Set(selectedCommand.args.map(a => a.key));
    const filteredArgs = Object.fromEntries(
      Object.entries(argValues).filter(([key, value]) => validArgKeys.has(key) && value)
    );
    if (selectedCommand.hasModelSelector && selectedCommand.modelArgKey && selectedModel) {
      filteredArgs[selectedCommand.modelArgKey] = selectedModel;
    }
    return filteredArgs;
  }, [selectedCommand, argValues, selectedModel]);

  const recomputeCostEstimate = useCallback(async () => {
    const filteredArgs = buildCommandArgs();
    const requiresScenarioFolder =
      selectedCommand.command === 'probe' && !filteredArgs['scenarios-folder'];
    const requiresRunDir =
      selectedCommand.command === 'summary' && !filteredArgs['run-dir'];
    if (requiresScenarioFolder || requiresRunDir) {
      setCostEstimate(null);
      return;
    }
    if (Object.keys(filteredArgs).length === 0) {
      setCostEstimate(null);
      return;
    }
    const requestId = ++costRequestIdRef.current;
    setEstimatingCost(true);
    try {
      const { costEstimate } = await runner.estimate(selectedCommand.command, filteredArgs);
      if (costRequestIdRef.current === requestId) {
        setCostEstimate(costEstimate ?? null);
      }
    } catch {
      if (costRequestIdRef.current === requestId) {
        setCostEstimate(null);
      }
    } finally {
      if (costRequestIdRef.current === requestId) {
        setEstimatingCost(false);
      }
    }
  }, [buildCommandArgs, selectedCommand.command, targetModelsSignature]);

  useEffect(() => {
    recomputeCostEstimate();
  }, [recomputeCostEstimate]);

  const handleTargetModelChange = async (providerId: string, modelId: string, enabled: boolean) => {
    if (!runtimeConfig) return;
    setUpdatingProvider(providerId);
    try {
      const nextConfig = {
        ...runtimeConfig,
        defaults: {
          ...(runtimeConfig?.defaults || {}),
        },
      };
      const targets = Array.isArray(nextConfig.defaults?.target_models)
        ? [...nextConfig.defaults.target_models]
        : [];
      const existingIndex = targets.indexOf(modelId);
      if (enabled && existingIndex === -1) {
        targets.push(modelId);
      } else if (!enabled && existingIndex >= 0) {
        targets.splice(existingIndex, 1);
      }
      nextConfig.defaults.target_models = targets.filter(Boolean);
      await config.updateRuntime(nextConfig);
      setRuntimeConfig(nextConfig);
      setCostEstimate(null);
      await recomputeCostEstimate();
    } catch (error) {
      console.error('Failed to update target model:', error);
    } finally {
      setUpdatingProvider(null);
    }
  };

  const handleStart = async () => {
    try {
      setOutput([]);
      setIsRunning(true);

      const filteredArgs = buildCommandArgs();

      const result = await runner.start(selectedCommand.command, filteredArgs);
      setRunId(result.runId);
      if (result.costEstimate) {
        setCostEstimate(result.costEstimate);
      }

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
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${selectedCommand.command === cmd.command
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
                  <option value="">Select a trial...</option>
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

          {/* Summary model selector */}
          {selectedCommand.hasModelSelector && (
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-700 w-32 flex-shrink-0">
                Summary Model
              </label>
              <ModelSelector
                models={availableModels}
                selectedModel={selectedModel}
                onModelChange={handleModelChange}
                loading={modelsLoading}
                disabled={isRunning}
                className="flex-1"
                storageKey={selectedCommand.modelStorageKey}
              />
            </div>
          )}

          {/* Model selection per provider */}
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-medium text-gray-700">AI Provider Models</h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  Updates here modify the target AI entries in config/runtime.yaml for future probe runs.
                </p>
              </div>
              {(modelsLoading || loadingModelCosts) && (
                <span className="text-xs text-gray-500">Loading providers...</span>
              )}
            </div>
            {providerGroups.length === 0 ? (
              <div className="text-sm text-gray-500">No AI providers configured.</div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {providerGroups.map((group) => {
                  const selectedSet = providerSelections[group.providerId] || new Set<string>();
                  const isActive = selectedSet.size > 0;
                  const providerTotal =
                    costEstimate && isActive
                      ? Array.from(selectedSet).reduce((sum, id) => {
                        const value = costEstimate.breakdown?.[id] ?? 0;
                        return sum + value;
                      }, 0)
                      : null;
                  return (
                    <div
                      key={group.providerId}
                      className={`flex-1 min-w-[220px] border rounded-lg p-3 bg-gray-50 ${isActive ? 'border-blue-400 bg-blue-50/40' : 'border-gray-200'
                        }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="w-5 h-5"
                          dangerouslySetInnerHTML={{ __html: group.providerIcon }}
                        />
                        <span className="text-sm font-medium text-gray-700 flex-1">
                          {group.providerName}
                        </span>
                        {providerTotal != null && (
                          <span className="text-xs text-gray-600 whitespace-nowrap">
                            Total est: {formatCost(providerTotal)}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {group.models.map((model) => {
                          const isChecked = selectedSet.has(model.id);
                          const perModelEstimate =
                            costEstimate?.breakdown?.[model.id] != null
                              ? formatCost(costEstimate.breakdown[model.id])
                              : null;
                          return (
                            <label
                              key={model.id}
                              className="flex items-center gap-2 text-sm text-gray-700"
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                checked={isChecked}
                                disabled={loadingRuntime || updatingProvider === group.providerId}
                                onChange={(e) =>
                                  handleTargetModelChange(
                                    group.providerId,
                                    model.id,
                                    e.target.checked
                                  )
                                }
                              />
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <span>{model.name}</span>
                                  {perModelEstimate && (
                                    <span className="text-xs text-gray-500">
                                      Est {perModelEstimate}
                                    </span>
                                  )}
                                </div>
                                {model.costLabel && (
                                  <p className="text-xs text-gray-500">{model.costLabel}</p>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      {updatingProvider === group.providerId && (
                        <p className="text-xs text-blue-600 mt-2">Saving...</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-start">
            {isRunning ? (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                <Square size={16} />
                Stop
              </button>
            ) : (
              <>
                <button
                  onClick={handleStart}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  disabled={!selectedCommand}
                >
                  <Play size={16} />
                  Run Trial
                </button>
                <span className="mt-1 text-xs text-gray-500">
                  {estimatingCost
                    ? 'Estimating cost...'
                    : costEstimate
                      ? `Est. cost ${formatCost(costEstimate.total)}`
                      : 'Est. cost unavailable'}
                </span>
              </>
            )}
          </div>
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
