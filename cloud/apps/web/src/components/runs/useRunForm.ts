import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AvailableModel } from '../../api/operations/models';
import type { StartRunInput } from '../../api/operations/runs';

export const SPECIFIC_CONDITION_TRIAL = -2;

export type RunFormState = {
  selectedModels: string[];
  samplePercentage: number;
  samplesPerScenario: number;
  temperatureInput: string;
  launchMode: 'PAIRED_BATCH' | 'AD_HOC_BATCH';
};

type UseRunFormOptions = {
  definitionId: string;
  scenarioCount?: number;
  initialTemperature?: number | null;
  defaultLaunchMode?: 'PAIRED_BATCH' | 'AD_HOC_BATCH';
  onSubmit: (input: StartRunInput) => Promise<void>;
  models: AvailableModel[];
  loadingModels: boolean;
};

type UseRunFormResult = {
  formState: RunFormState;
  validationError: string | null;
  isFinalTrial: boolean;
  isSpecificConditionTrial: boolean;
  estimatedScenarios: number | null;
  isConditionModalOpen: boolean;
  selectedConditionRowLevel: string | null;
  selectedConditionColLevel: string | null;
  selectedConditionScenarioIds: string[];
  conditionSelectionTouched: boolean;
  modalRowLevel: string | null;
  modalColLevel: string | null;
  handleModelSelectionChange: (models: string[]) => void;
  handleSampleChange: (value: number) => void;
  handleSamplesPerScenarioChange: (value: number) => void;
  handleTemperatureChange: (value: string) => void;
  handleLaunchModeChange: (launchMode: 'PAIRED_BATCH' | 'AD_HOC_BATCH') => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleCloseConditionModal: () => void;
  handleImmediateConditionSelect: (rowLevel: string, colLevel: string, scenarioIds: string[]) => void;
};

export function useRunForm({
  definitionId,
  scenarioCount,
  initialTemperature = null,
  defaultLaunchMode = 'PAIRED_BATCH',
  onSubmit,
  models,
  loadingModels,
}: UseRunFormOptions): UseRunFormResult {
  const [formState, setFormState] = useState<RunFormState>({
    selectedModels: [],
    samplePercentage: 10,
    samplesPerScenario: 1,
    temperatureInput: initialTemperature === null ? '' : String(initialTemperature),
    launchMode: defaultLaunchMode,
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasUserChangedSelection, setHasUserChangedSelection] = useState(false);
  const [isConditionModalOpen, setIsConditionModalOpen] = useState(false);
  const [selectedConditionRowLevel, setSelectedConditionRowLevel] = useState<string | null>(null);
  const [selectedConditionColLevel, setSelectedConditionColLevel] = useState<string | null>(null);
  const [selectedConditionScenarioIds, setSelectedConditionScenarioIds] = useState<string[]>([]);
  const [conditionSelectionTouched, setConditionSelectionTouched] = useState(false);
  const [modalRowLevel, setModalRowLevel] = useState<string | null>(null);
  const [modalColLevel, setModalColLevel] = useState<string | null>(null);

  const isFinalTrial = formState.samplePercentage === -1;
  const isSpecificConditionTrial = formState.samplePercentage === SPECIFIC_CONDITION_TRIAL;

  useEffect(() => {
    if (loadingModels || hasUserChangedSelection) {
      return;
    }

    const defaultModels = models
      .filter((model) => model.isDefault && model.isAvailable)
      .map((model) => model.id)
      .sort();

    setFormState((previousState) => {
      const currentSelection = [...previousState.selectedModels].sort();
      const isSameSelection =
        currentSelection.length === defaultModels.length &&
        currentSelection.every((id, index) => id === defaultModels[index]);

      if (isSameSelection) {
        return previousState;
      }

      return {
        ...previousState,
        selectedModels: defaultModels,
      };
    });
  }, [models, loadingModels, hasUserChangedSelection]);

  useEffect(() => {
    setFormState((previousState) => ({
      ...previousState,
      temperatureInput: initialTemperature === null ? '' : String(initialTemperature),
    }));
  }, [initialTemperature]);

  useEffect(() => {
    setFormState((previousState) => ({
      ...previousState,
      launchMode: defaultLaunchMode,
    }));
  }, [defaultLaunchMode]);

  const handleModelSelectionChange = useCallback((selectedModels: string[]) => {
    setHasUserChangedSelection(true);
    setFormState((previousState) => ({
      ...previousState,
      selectedModels,
    }));
    setValidationError(null);
  }, []);

  const handleSampleChange = useCallback((value: number) => {
    setFormState((previousState) => ({
      ...previousState,
      samplePercentage: value,
    }));
    setValidationError(null);
    if (value === SPECIFIC_CONDITION_TRIAL) {
      setModalRowLevel(selectedConditionRowLevel);
      setModalColLevel(selectedConditionColLevel);
      setIsConditionModalOpen(true);
    }
  }, [selectedConditionColLevel, selectedConditionRowLevel]);

  const handleSamplesPerScenarioChange = useCallback((value: number) => {
    setFormState((previousState) => ({
      ...previousState,
      samplesPerScenario: value,
    }));
  }, []);

  const handleTemperatureChange = useCallback((value: string) => {
    setFormState((previousState) => ({
      ...previousState,
      temperatureInput: value,
    }));
    setValidationError(null);
  }, []);

  const handleLaunchModeChange = useCallback((launchMode: 'PAIRED_BATCH' | 'AD_HOC_BATCH') => {
    setFormState((previousState) => ({
      ...previousState,
      launchMode,
    }));
    setValidationError(null);
  }, []);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (formState.selectedModels.length === 0) {
      setValidationError('Please select at least one model');
      return;
    }

    if (isSpecificConditionTrial && selectedConditionScenarioIds.length === 0) {
      setValidationError('Please select a condition before starting this trial');
      setConditionSelectionTouched(true);
      return;
    }

    const trimmedTemperature = formState.temperatureInput.trim();
    let temperature: number | undefined;
    if (trimmedTemperature !== '') {
      const parsedTemperature = Number.parseFloat(trimmedTemperature);
      if (!Number.isFinite(parsedTemperature) || parsedTemperature < 0 || parsedTemperature > 2) {
        setValidationError('Temperature must be between 0 and 2');
        return;
      }
      temperature = parsedTemperature;
    }

    const input: StartRunInput = {
      definitionId,
      models: formState.selectedModels,
      samplePercentage: isFinalTrial || isSpecificConditionTrial ? undefined : formState.samplePercentage,
      samplesPerScenario: isFinalTrial ? undefined : formState.samplesPerScenario,
      scenarioIds: isSpecificConditionTrial ? selectedConditionScenarioIds : undefined,
      temperature,
      finalTrial: isFinalTrial,
    };

    try {
      await onSubmit(input);
    } catch {
      // Error handling is done by the parent.
    }
  }, [definitionId, formState, isFinalTrial, isSpecificConditionTrial, onSubmit, selectedConditionScenarioIds]);

  const handleCloseConditionModal = useCallback(() => {
    setIsConditionModalOpen(false);
    if (selectedConditionScenarioIds.length === 0) {
      setConditionSelectionTouched(true);
    }
  }, [selectedConditionScenarioIds.length]);

  const handleImmediateConditionSelect = useCallback((rowLevel: string, colLevel: string, scenarioIds: string[]) => {
    if (scenarioIds.length === 0) {
      return;
    }

    setModalRowLevel(rowLevel);
    setModalColLevel(colLevel);
    setSelectedConditionRowLevel(rowLevel);
    setSelectedConditionColLevel(colLevel);
    setSelectedConditionScenarioIds(scenarioIds);
    setConditionSelectionTouched(false);
    setValidationError(null);
    setIsConditionModalOpen(false);
  }, []);

  const estimatedScenarios = isSpecificConditionTrial
    ? selectedConditionScenarioIds.length
    : scenarioCount !== undefined
      ? Math.ceil((scenarioCount * formState.samplePercentage) / 100)
      : null;

  return {
    formState,
    validationError,
    isFinalTrial,
    isSpecificConditionTrial,
    estimatedScenarios,
    isConditionModalOpen,
    selectedConditionRowLevel,
    selectedConditionColLevel,
    selectedConditionScenarioIds,
    conditionSelectionTouched,
    modalRowLevel,
    modalColLevel,
    handleModelSelectionChange,
    handleSampleChange,
    handleSamplesPerScenarioChange,
    handleTemperatureChange,
    handleLaunchModeChange,
    handleSubmit,
    handleCloseConditionModal,
    handleImmediateConditionSelect,
  };
}
