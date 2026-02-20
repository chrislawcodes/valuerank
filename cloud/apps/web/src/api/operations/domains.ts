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

export type DomainsQueryResult = {
  domains: Domain[];
};

export type DomainsQueryVariables = {
  search?: string;
  limit?: number;
  offset?: number;
};
