import { gql } from 'urql';

export type DomainContext = {
  id: string;
  domainId: string;
  domain?: { id: string; name: string } | null;
  text: string;
  version: number;
  createdAt?: string;
  updatedAt: string;
};

export const DOMAIN_CONTEXTS_QUERY = gql`
  query DomainContexts($domainId: String) {
    domainContexts(domainId: $domainId) {
      id
      domainId
      domain {
        id
        name
      }
      text
      version
      updatedAt
    }
  }
`;

export const CREATE_DOMAIN_CONTEXT_MUTATION = gql`
  mutation CreateDomainContext($input: CreateDomainContextInput!) {
    createDomainContext(input: $input) {
      id
      domainId
      text
      version
      updatedAt
    }
  }
`;

export const UPDATE_DOMAIN_CONTEXT_MUTATION = gql`
  mutation UpdateDomainContext($id: ID!, $input: UpdateDomainContextInput!) {
    updateDomainContext(id: $id, input: $input) {
      id
      domainId
      text
      version
      updatedAt
    }
  }
`;

export const DELETE_DOMAIN_CONTEXT_MUTATION = gql`
  mutation DeleteDomainContext($id: ID!) {
    deleteDomainContext(id: $id)
  }
`;

export type DomainContextsQueryResult = { domainContexts: DomainContext[] };
export type DomainContextsQueryVariables = { domainId?: string };
export type CreateDomainContextResult = { createDomainContext: DomainContext };
export type UpdateDomainContextResult = { updateDomainContext: DomainContext };
