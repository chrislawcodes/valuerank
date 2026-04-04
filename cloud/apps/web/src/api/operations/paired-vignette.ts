import { gql } from 'urql';

export type PairedVignetteDefinition = { id: string; name: string };

export type CreatePairedVignetteResult = {
  createJobChoicePair: {
    definitionA: PairedVignetteDefinition;
    definitionB: PairedVignetteDefinition;
  };
};

export type CreatePairedVignetteVariables = {
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

export type UpdatePairedVignetteResult = {
  updateJobChoicePair: {
    definitionA: PairedVignetteDefinition;
    definitionB: PairedVignetteDefinition;
  };
};

export type UpdatePairedVignetteVariables = {
  input: {
    definitionId: string;
    name: string;
    contextId: string;
    valueFirstId: string;
    valueSecondId: string;
    preambleVersionId?: string | null;
    levelPresetVersionId?: string | null;
  };
};

export const CREATE_PAIRED_VIGNETTE_MUTATION = gql`
  mutation CreatePairedVignette($input: CreatePairedVignetteInput!) {
    createJobChoicePair(input: $input) {
      definitionA {
        id
        name
      }
      definitionB {
        id
        name
      }
    }
  }
`;

export const UPDATE_PAIRED_VIGNETTE_MUTATION = gql`
  mutation UpdatePairedVignette($input: UpdatePairedVignetteInput!) {
    updateJobChoicePair(input: $input) {
      definitionA {
        id
        name
      }
      definitionB {
        id
        name
      }
    }
  }
`;
