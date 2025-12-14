/**
 * Infrastructure Panel
 *
 * Settings panel for configuring infrastructure models used
 * for internal tasks like scenario expansion and summarization.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'urql';
import { Settings, FileText } from 'lucide-react';
import { Loading } from '../../ui/Loading';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { ModelSelectorCard } from './ModelSelectorCard';
import { ExpansionSettings } from './ExpansionSettings';
import { ParallelismSettings } from './ParallelismSettings';
import type { LlmProvidersQueryResult } from '../../../api/operations/llm';
import {
  LLM_PROVIDERS_QUERY,
  UPDATE_SYSTEM_SETTING_MUTATION,
} from '../../../api/operations/llm';
import type {
  InfraModelResult,
  LowestCostModelResult,
  CodeGenerationSettingResult,
  SummarizationParallelismResult,
} from './types';

const INFRA_MODEL_QUERY = `
  query InfraModel($purpose: String!) {
    infraModel(purpose: $purpose) {
      id
      modelId
      displayName
      provider { id name displayName }
    }
  }
`;

const LOWEST_COST_MODEL_QUERY = `
  query LowestCostModel {
    llmModels(status: ACTIVE, availableOnly: true) {
      id modelId displayName costInputPerMillion costOutputPerMillion
      provider { id name displayName }
    }
  }
`;

const CODE_GENERATION_SETTING_QUERY = `
  query CodeGenerationSetting {
    systemSetting(key: "scenario_expansion_use_code_generation") {
      id key value
    }
  }
`;

const SUMMARIZATION_PARALLELISM_QUERY = `
  query SummarizationParallelism {
    systemSetting(key: "infra_max_parallel_summarizations") {
      id key value
    }
  }
`;

export function InfraPanel() {
  // Scenario expansion state
  const [expansionProviderId, setExpansionProviderId] = useState('');
  const [expansionModelId, setExpansionModelId] = useState('');
  const [isSavingExpansion, setIsSavingExpansion] = useState(false);
  const [saveExpansionSuccess, setSaveExpansionSuccess] = useState(false);

  // Summarizer state
  const [summarizerProviderId, setSummarizerProviderId] = useState('');
  const [summarizerModelId, setSummarizerModelId] = useState('');
  const [isSavingSummarizer, setIsSavingSummarizer] = useState(false);
  const [saveSummarizerSuccess, setSaveSummarizerSuccess] = useState(false);

  // Code generation state
  const [useCodeGeneration, setUseCodeGeneration] = useState(false);
  const [isSavingCodeGen, setIsSavingCodeGen] = useState(false);
  const [saveCodeGenSuccess, setSaveCodeGenSuccess] = useState(false);

  // Parallelism state
  const [parallelismValue, setParallelismValue] = useState(8);
  const [isSavingParallelism, setIsSavingParallelism] = useState(false);
  const [saveParallelismSuccess, setSaveParallelismSuccess] = useState(false);

  // Queries
  const [{ data: providersData, fetching: loadingProviders, error: providersError }] =
    useQuery<LlmProvidersQueryResult>({ query: LLM_PROVIDERS_QUERY });

  const [{ data: expansionData, fetching: loadingExpansion }, reexecuteExpansion] =
    useQuery<InfraModelResult>({ query: INFRA_MODEL_QUERY, variables: { purpose: 'scenario_expansion' } });

  const [{ data: summarizerData, fetching: loadingSummarizer }, reexecuteSummarizer] =
    useQuery<InfraModelResult>({ query: INFRA_MODEL_QUERY, variables: { purpose: 'summarizer' } });

  const [{ data: lowestCostData }] = useQuery<LowestCostModelResult>({ query: LOWEST_COST_MODEL_QUERY });

  const [{ data: codeGenData, fetching: loadingCodeGen }, reexecuteCodeGen] =
    useQuery<CodeGenerationSettingResult>({ query: CODE_GENERATION_SETTING_QUERY });

  const [{ data: parallelismData, fetching: loadingParallelism }, reexecuteParallelism] =
    useQuery<SummarizationParallelismResult>({ query: SUMMARIZATION_PARALLELISM_QUERY });

  const [, updateSetting] = useMutation(UPDATE_SYSTEM_SETTING_MUTATION);

  // Initialize state from current config
  useEffect(() => {
    if (expansionData?.infraModel) {
      setExpansionProviderId(expansionData.infraModel.provider.id);
      setExpansionModelId(expansionData.infraModel.modelId);
    }
  }, [expansionData]);

  useEffect(() => {
    if (summarizerData?.infraModel) {
      setSummarizerProviderId(summarizerData.infraModel.provider.id);
      setSummarizerModelId(summarizerData.infraModel.modelId);
    }
  }, [summarizerData]);

  useEffect(() => {
    if (codeGenData?.systemSetting) {
      setUseCodeGeneration(codeGenData.systemSetting.value?.enabled === true);
    }
  }, [codeGenData]);

  useEffect(() => {
    if (parallelismData?.systemSetting) {
      setParallelismValue(parallelismData.systemSetting.value?.value ?? 8);
    }
  }, [parallelismData]);

  const providers = providersData?.llmProviders ?? [];

  // Find the lowest cost model for fallback display
  const lowestCostModel = lowestCostData?.llmModels?.length
    ? lowestCostData.llmModels.reduce((min, m) =>
        m.costInputPerMillion + m.costOutputPerMillion < min.costInputPerMillion + min.costOutputPerMillion ? m : min
      )
    : undefined;

  // Save handlers
  const handleSaveExpansion = async () => {
    const provider = providers.find((p) => p.id === expansionProviderId);
    if (!provider || !expansionModelId) return;
    setIsSavingExpansion(true);
    setSaveExpansionSuccess(false);
    await updateSetting({ input: { key: 'infra_model_scenario_expansion', value: { providerId: provider.name, modelId: expansionModelId } } });
    setIsSavingExpansion(false);
    setSaveExpansionSuccess(true);
    reexecuteExpansion({ requestPolicy: 'network-only' });
    setTimeout(() => setSaveExpansionSuccess(false), 3000);
  };

  const handleSaveSummarizer = async () => {
    const provider = providers.find((p) => p.id === summarizerProviderId);
    if (!provider || !summarizerModelId) return;
    setIsSavingSummarizer(true);
    setSaveSummarizerSuccess(false);
    await updateSetting({ input: { key: 'infra_model_summarizer', value: { providerId: provider.name, modelId: summarizerModelId } } });
    setIsSavingSummarizer(false);
    setSaveSummarizerSuccess(true);
    reexecuteSummarizer({ requestPolicy: 'network-only' });
    setTimeout(() => setSaveSummarizerSuccess(false), 3000);
  };

  const handleCodeGenerationToggle = async () => {
    const newValue = !useCodeGeneration;
    setIsSavingCodeGen(true);
    setSaveCodeGenSuccess(false);
    await updateSetting({ input: { key: 'scenario_expansion_use_code_generation', value: { enabled: newValue } } });
    setUseCodeGeneration(newValue);
    setIsSavingCodeGen(false);
    setSaveCodeGenSuccess(true);
    reexecuteCodeGen({ requestPolicy: 'network-only' });
    setTimeout(() => setSaveCodeGenSuccess(false), 3000);
  };

  const handleSaveParallelism = async () => {
    if (parallelismValue < 1 || parallelismValue > 100) return;
    setIsSavingParallelism(true);
    setSaveParallelismSuccess(false);
    await updateSetting({ input: { key: 'infra_max_parallel_summarizations', value: { value: parallelismValue } } });
    setIsSavingParallelism(false);
    setSaveParallelismSuccess(true);
    reexecuteParallelism({ requestPolicy: 'network-only' });
    setTimeout(() => setSaveParallelismSuccess(false), 3000);
  };

  if (loadingProviders || loadingExpansion || loadingCodeGen || loadingSummarizer || loadingParallelism) {
    return <Loading text="Loading configuration..." />;
  }

  if (providersError) {
    return <ErrorMessage message={providersError.message} />;
  }

  const hasExpansionChanges = expansionData?.infraModel?.provider.id !== expansionProviderId || expansionData?.infraModel?.modelId !== expansionModelId;
  const hasSummarizerChanges = summarizerData?.infraModel?.provider.id !== summarizerProviderId || summarizerData?.infraModel?.modelId !== summarizerModelId;
  const hasParallelismChanges = (parallelismData?.systemSetting?.value?.value ?? 8) !== parallelismValue;

  return (
    <div className="space-y-6">
      <ModelSelectorCard
        title="Scenario Expansion Model"
        description="Model used for expanding scenario definitions into concrete scenarios"
        icon={<Settings className="w-5 h-5 text-purple-600" />}
        iconBgColor="bg-purple-100"
        currentModel={expansionData?.infraModel ?? null}
        fallbackMessage={<><p className="text-sm font-medium text-yellow-800">No model configured</p><p className="text-sm text-yellow-700">System will use default (Claude 3.5 Haiku) until you configure one.</p></>}
        providers={providers}
        selectedProviderId={expansionProviderId}
        selectedModelId={expansionModelId}
        onProviderChange={(id) => { setExpansionProviderId(id); setExpansionModelId(''); setSaveExpansionSuccess(false); }}
        onModelChange={(id) => { setExpansionModelId(id); setSaveExpansionSuccess(false); }}
        onSave={handleSaveExpansion}
        hasChanges={hasExpansionChanges}
        isSaving={isSavingExpansion}
        saveSuccess={saveExpansionSuccess}
      />

      <ModelSelectorCard
        title="Transcript Summarization Model"
        description="Model used to summarize AI responses and extract decision codes"
        icon={<FileText className="w-5 h-5 text-blue-600" />}
        iconBgColor="bg-blue-100"
        currentModel={summarizerData?.infraModel ?? null}
        fallbackMessage={<><p className="text-sm font-medium text-blue-800">Using lowest cost model</p><p className="text-sm text-blue-700">{lowestCostModel ? `${lowestCostModel.provider.displayName} / ${lowestCostModel.displayName} ($${lowestCostModel.costInputPerMillion}/M in, $${lowestCostModel.costOutputPerMillion}/M out)` : 'Will use the cheapest available model'}</p></>}
        providers={providers}
        selectedProviderId={summarizerProviderId}
        selectedModelId={summarizerModelId}
        onProviderChange={(id) => { setSummarizerProviderId(id); setSummarizerModelId(''); setSaveSummarizerSuccess(false); }}
        onModelChange={(id) => { setSummarizerModelId(id); setSaveSummarizerSuccess(false); }}
        onSave={handleSaveSummarizer}
        hasChanges={hasSummarizerChanges}
        isSaving={isSavingSummarizer}
        saveSuccess={saveSummarizerSuccess}
      />

      <ExpansionSettings
        useCodeGeneration={useCodeGeneration}
        isSaving={isSavingCodeGen}
        saveSuccess={saveCodeGenSuccess}
        onToggle={handleCodeGenerationToggle}
      />

      <ParallelismSettings
        currentValue={parallelismData?.systemSetting?.value?.value ?? 8}
        value={parallelismValue}
        hasChanges={hasParallelismChanges}
        isSaving={isSavingParallelism}
        saveSuccess={saveParallelismSuccess}
        onChange={setParallelismValue}
        onSave={handleSaveParallelism}
      />

      <div className="p-4 bg-blue-50 rounded-lg">
        <h3 className="text-sm font-medium text-blue-900 mb-2">About Infrastructure Models</h3>
        <p className="text-sm text-blue-700">
          Infrastructure models are used for internal tasks that don&apos;t directly evaluate AI behavior.
          The scenario expansion model generates concrete scenarios from definitions.
          The summarizer model extracts decision codes and explanations from AI transcripts.
          A cost-efficient model like Claude 3.5 Haiku or GPT-4o Mini is recommended for both.
        </p>
      </div>
    </div>
  );
}
