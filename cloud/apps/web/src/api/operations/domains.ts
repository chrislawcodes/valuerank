import { gql } from 'urql';

export type Domain = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  definitionCount: number;
};

export const DOMAINS_QUERY = gql`
  query Domains($search: String, $limit: Int, $offset: Int) {
    domains(search: $search, limit: $limit, offset: $offset) {
      id
      name
      createdAt
      updatedAt
      definitionCount
    }
  }
`;

export const CREATE_DOMAIN_MUTATION = gql`
  mutation CreateDomain($name: String!) {
    createDomain(name: $name) {
      id
      name
      createdAt
      updatedAt
      definitionCount
    }
  }
`;

export const RENAME_DOMAIN_MUTATION = gql`
  mutation RenameDomain($id: ID!, $name: String!) {
    renameDomain(id: $id, name: $name) {
      id
      name
      createdAt
      updatedAt
      definitionCount
    }
  }
`;

export const DELETE_DOMAIN_MUTATION = gql`
  mutation DeleteDomain($id: ID!) {
    deleteDomain(id: $id) {
      success
      affectedDefinitions
    }
  }
`;

export const ASSIGN_DOMAIN_TO_DEFINITIONS_MUTATION = gql`
  mutation AssignDomainToDefinitions($definitionIds: [ID!]!, $domainId: ID) {
    assignDomainToDefinitions(definitionIds: $definitionIds, domainId: $domainId) {
      success
      affectedDefinitions
    }
  }
`;

export const ASSIGN_DOMAIN_TO_DEFINITIONS_BY_FILTER_MUTATION = gql`
  mutation AssignDomainToDefinitionsByFilter(
    $domainId: ID
    $rootOnly: Boolean
    $search: String
    $tagIds: [ID!]
    $hasRuns: Boolean
    $sourceDomainId: ID
    $withoutDomain: Boolean
  ) {
    assignDomainToDefinitionsByFilter(
      domainId: $domainId
      rootOnly: $rootOnly
      search: $search
      tagIds: $tagIds
      hasRuns: $hasRuns
      sourceDomainId: $sourceDomainId
      withoutDomain: $withoutDomain
    ) {
      success
      affectedDefinitions
    }
  }
`;

export const RUN_TRIALS_FOR_DOMAIN_MUTATION = gql`
  mutation RunTrialsForDomain($domainId: ID!, $temperature: Float) {
    runTrialsForDomain(domainId: $domainId, temperature: $temperature) {
      success
      totalDefinitions
      targetedDefinitions
      startedRuns
      failedDefinitions
    }
  }
`;

export type DomainsQueryResult = {
  domains: Domain[];
};

export type DomainsQueryVariables = {
  search?: string;
  limit?: number;
  offset?: number;
};

export type CreateDomainMutationResult = {
  createDomain: Domain;
};

export type CreateDomainMutationVariables = {
  name: string;
};

export type RenameDomainMutationResult = {
  renameDomain: Domain;
};

export type RenameDomainMutationVariables = {
  id: string;
  name: string;
};

export type DomainMutationResult = {
  success: boolean;
  affectedDefinitions: number;
};

export type DeleteDomainMutationResult = {
  deleteDomain: DomainMutationResult;
};

export type DeleteDomainMutationVariables = {
  id: string;
};

export type AssignDomainToDefinitionsMutationResult = {
  assignDomainToDefinitions: DomainMutationResult;
};

export type AssignDomainToDefinitionsMutationVariables = {
  definitionIds: string[];
  domainId?: string | null;
};

export type AssignDomainToDefinitionsByFilterMutationResult = {
  assignDomainToDefinitionsByFilter: DomainMutationResult;
};

export type AssignDomainToDefinitionsByFilterMutationVariables = {
  domainId?: string | null;
  rootOnly?: boolean;
  search?: string;
  tagIds?: string[];
  hasRuns?: boolean;
  sourceDomainId?: string;
  withoutDomain?: boolean;
};

export type RunTrialsForDomainMutationResult = {
  runTrialsForDomain: {
    success: boolean;
    totalDefinitions: number;
    targetedDefinitions: number;
    startedRuns: number;
    failedDefinitions: number;
  };
};

export type RunTrialsForDomainMutationVariables = {
  domainId: string;
  temperature?: number;
};
