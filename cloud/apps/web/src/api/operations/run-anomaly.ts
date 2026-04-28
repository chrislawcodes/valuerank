import { gql } from 'urql';
import type {
  RunAnomaly,
  RunAnomalyType,
} from '../../generated/graphql';

export type { RunAnomalyType } from '../../generated/graphql';

type OpenRunAnomalyBase = Pick<
  RunAnomaly,
  'id' | 'runId' | 'type' | 'subject' | 'source' | 'details' | 'firstSeenAt' | 'lastSeenAt'
>;

export type OpenRunAnomaly = OpenRunAnomalyBase & {
  displayLabel: string;
  displaySubject: string;
  reprobeEligible: boolean;
  reprobeCount: number;
  reprobeLimitReached: boolean;
  estimatedCost: number | null;
  run: {
    id: string;
    name: string | null;
    status: string;
  };
  domain: {
    id: string;
    name: string;
  } | null;
};

export type OpenRunAnomaliesQueryResult = {
  openRunAnomalies: OpenRunAnomaly[];
};

export type OpenRunAnomaliesQueryVariables = {
  domainId?: string | null;
  type?: RunAnomalyType | null;
};

export type ReprobeAnomalySlotMutationResult = {
  reprobeAnomalySlot: {
    id: string;
    lastSeenAt: string;
    reprobeCount: number;
    reprobeLimitReached: boolean;
  };
};

export type ReprobeAnomalySlotMutationVariables = {
  anomalyId: string;
};

export type ResolveRunAnomalyMutationResult = {
  resolveRunAnomaly: {
    id: string;
    resolvedAt: string | null;
  };
};

export type ResolveRunAnomalyMutationVariables = {
  id: string;
};

export const OPEN_RUN_ANOMALIES_QUERY = gql`
  query OpenRunAnomalies($domainId: ID, $type: RunAnomalyType) {
    openRunAnomalies(domainId: $domainId, type: $type) {
      id
      runId
      type
      subject
      source
      details
      firstSeenAt
      lastSeenAt
      displayLabel
      displaySubject
      reprobeEligible
      reprobeCount
      reprobeLimitReached
      estimatedCost
      run {
        id
        name
        status
      }
      domain {
        id
        name
      }
    }
  }
`;

export const REPROBE_ANOMALY_SLOT_MUTATION = gql`
  mutation ReprobeAnomalySlot($anomalyId: ID!) {
    reprobeAnomalySlot(anomalyId: $anomalyId) {
      id
      lastSeenAt
      reprobeCount
      reprobeLimitReached
    }
  }
`;

export const RESOLVE_RUN_ANOMALY_MUTATION = gql`
  mutation ResolveRunAnomaly($id: ID!) {
    resolveRunAnomaly(id: $id) {
      id
      resolvedAt
    }
  }
`;
