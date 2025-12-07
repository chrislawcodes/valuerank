import { useMutation } from 'urql';
import {
  CREATE_DEFINITION_MUTATION,
  UPDATE_DEFINITION_MUTATION,
  FORK_DEFINITION_MUTATION,
  type CreateDefinitionInput,
  type CreateDefinitionResult,
  type UpdateDefinitionInput,
  type UpdateDefinitionResult,
  type ForkDefinitionInput,
  type ForkDefinitionResult,
  type Definition,
} from '../api/operations/definitions';

type UseDefinitionMutationsResult = {
  createDefinition: (input: CreateDefinitionInput) => Promise<Definition>;
  updateDefinition: (id: string, input: UpdateDefinitionInput) => Promise<Definition>;
  forkDefinition: (input: ForkDefinitionInput) => Promise<Definition>;
  isCreating: boolean;
  isUpdating: boolean;
  isForking: boolean;
  error: Error | null;
};

export function useDefinitionMutations(): UseDefinitionMutationsResult {
  const [createResult, executeCreate] = useMutation<
    CreateDefinitionResult,
    { input: CreateDefinitionInput }
  >(CREATE_DEFINITION_MUTATION);

  const [updateResult, executeUpdate] = useMutation<
    UpdateDefinitionResult,
    { id: string; input: UpdateDefinitionInput }
  >(UPDATE_DEFINITION_MUTATION);

  const [forkResult, executeFork] = useMutation<
    ForkDefinitionResult,
    { input: ForkDefinitionInput }
  >(FORK_DEFINITION_MUTATION);

  const createDefinition = async (input: CreateDefinitionInput): Promise<Definition> => {
    const result = await executeCreate({ input });
    if (result.error) {
      throw new Error(result.error.message);
    }
    if (!result.data?.createDefinition) {
      throw new Error('Failed to create definition');
    }
    return result.data.createDefinition;
  };

  const updateDefinition = async (
    id: string,
    input: UpdateDefinitionInput
  ): Promise<Definition> => {
    const result = await executeUpdate({ id, input });
    if (result.error) {
      throw new Error(result.error.message);
    }
    if (!result.data?.updateDefinition) {
      throw new Error('Failed to update definition');
    }
    return result.data.updateDefinition;
  };

  const forkDefinition = async (input: ForkDefinitionInput): Promise<Definition> => {
    const result = await executeFork({ input });
    if (result.error) {
      throw new Error(result.error.message);
    }
    if (!result.data?.forkDefinition) {
      throw new Error('Failed to fork definition');
    }
    return result.data.forkDefinition;
  };

  // Combine errors from all mutations
  const error = createResult.error || updateResult.error || forkResult.error;

  return {
    createDefinition,
    updateDefinition,
    forkDefinition,
    isCreating: createResult.fetching,
    isUpdating: updateResult.fetching,
    isForking: forkResult.fetching,
    error: error ? new Error(error.message) : null,
  };
}
