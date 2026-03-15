import { gql } from 'urql';

export type JobChoicePairDefinition = { id: string; name: string };

export type CreateJobChoicePairResult = {
  createJobChoicePair: {
    aFirst: JobChoicePairDefinition;
    bFirst: JobChoicePairDefinition;
  };
};

export type CreateJobChoicePairVariables = {
  input: {
    name: string;
    domainId: string;
    contextId: string;
    valueFirstId: string;
    valueSecondId: string;
    preambleVersionId?: string | null;
    levelPresetVersionId?: string | null;
  };
};

export const CREATE_JOB_CHOICE_PAIR_MUTATION = gql`
  mutation CreateJobChoicePair($input: CreateJobChoicePairInput!) {
    createJobChoicePair(input: $input) {
      aFirst {
        id
        name
      }
      bFirst {
        id
        name
      }
    }
  }
`;
