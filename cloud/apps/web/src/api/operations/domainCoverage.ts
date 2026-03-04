import { gql } from 'urql';

export const DOMAIN_VALUE_COVERAGE_QUERY = gql`
  query DomainValueCoverage($domainId: ID!, $modelIds: [String!]) {
    domainValueCoverage(domainId: $domainId, modelIds: $modelIds) {
      domainId
      values
      cells {
        valueA
        valueB
        batchCount
        definitionId
        definitionName
      }
      availableModels {
        modelId
        label
      }
    }
  }
`;

export type DomainValueCoverageCell = {
  valueA: string;
  valueB: string;
  batchCount: number;
  definitionId: string | null;
  definitionName: string | null;
};

export type CoverageModelOption = {
  modelId: string;
  label: string;
};

export type DomainValueCoverageResult = {
  domainId: string;
  values: string[];
  cells: DomainValueCoverageCell[];
  availableModels: CoverageModelOption[];
};

export type DomainValueCoverageQueryResult = {
  domainValueCoverage: DomainValueCoverageResult | null;
};

export type DomainValueCoverageQueryVariables = {
  domainId: string;
  modelIds?: string[];
};
