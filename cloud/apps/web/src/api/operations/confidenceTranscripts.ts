import type {
  ConfidenceTranscriptsQuery as GeneratedConfidenceTranscriptsQuery,
  ConfidenceTranscriptsQueryVariables as GeneratedConfidenceTranscriptsQueryVariables,
} from '../../generated/graphql';
import type { TranscriptDecisionModelV2 } from './runs';

export { ConfidenceTranscriptsDocument as CONFIDENCE_TRANSCRIPTS_QUERY } from '../../generated/graphql';

export type ConfidenceTranscriptsQueryVariables = GeneratedConfidenceTranscriptsQueryVariables;
export type ConfidenceTranscriptsQueryResult = GeneratedConfidenceTranscriptsQuery;

// Derive base shape from codegen; narrow decisionModelV2 from unknown to the proper type.
export type ConfidenceTranscript = Omit<
  GeneratedConfidenceTranscriptsQuery['confidenceTranscripts'][number],
  'decisionModelV2'
> & { decisionModelV2?: TranscriptDecisionModelV2 | null };
