import type { Prisma } from '@valuerank/db';
import type {
  DefinitionRow,
  DomainAnalysisMissingDefinition,
  DomainAnalysisValueCounts,
  resolveSignatureRuns,
} from '../../graphql/queries/domain/shared.js';
import type { DomainAnalysisScope } from './domain-analysis-scope.js';

export const DOMAIN_ANALYSIS_CACHE_STATUS = {
  FRESH: 'FRESH',
  UPDATING: 'UPDATING',
  OUT_OF_DATE: 'OUT_OF_DATE',
} as const;

export type DomainAnalysisCacheStatus =
  (typeof DOMAIN_ANALYSIS_CACHE_STATUS)[keyof typeof DOMAIN_ANALYSIS_CACHE_STATUS];

export const DOMAIN_ANALYSIS_SNAPSHOT_TYPE = 'domain_overview';
export const DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION = '1.12.0';
export const DOMAIN_ANALYSIS_ASSUMPTION_PREFIX = 'domain-analysis';
export const DOMAIN_ANALYSIS_NONE_SIGNATURE = '__none__';

export type SnapshotClient = Prisma.TransactionClient;

export type DomainAnalysisBuildProgress = {
  completedRuns: number;
  totalRuns: number;
  currentRunId: string | null;
  updatedAt: string;
};

export type DomainAnalysisSnapshotModel = {
  model: string;
  counts: Record<string, DomainAnalysisValueCounts>;
  pairwiseWins: Record<string, Record<string, number>>;
  // Per-pair neutral counts keyed by [winner][loser] (only stored from valueA side to avoid
  // double-counting). Optional for backward compat with snapshots built before v1.9.0.
  pairwiseNeutrals?: Record<string, Record<string, number>>;
  // Equal-weight per-vignette win rates (0–100) and vignette counts per value key.
  // Optional for backward compatibility with snapshots built before v1.3.0.
  valueWinRates?: Record<string, number>;
  vignetteCount?: Record<string, number>;
};

export type DomainAnalysisContributionSummary = {
  domainId: string;
  domainName: string;
  rawTrialCount: number;
  share: number;
};

export type DomainAnalysisExcludedDataSummary = {
  domainId: string;
  domainName: string;
  reasonCode: 'SCHEMA_INCOMPATIBLE' | 'NO_ANALYSIS';
  count: number;
};

export type DomainAnalysisSnapshotOutput = {
  domainId: string;
  domainName: string;
  scope: DomainAnalysisScope;
  totalDefinitions: number;
  targetedDefinitions: number;
  coveredDefinitions: number;
  definitionsWithAnalysis: number;
  missingDefinitions: DomainAnalysisMissingDefinition[];
  models: DomainAnalysisSnapshotModel[];
  contributionSummary: DomainAnalysisContributionSummary[];
  excludedDataSummary: DomainAnalysisExcludedDataSummary[];
  // Per-(definitionId::modelId) win/loss vote counts. Deprecated — superseded by
  // valuePairModelVotes in v1.11.0. Kept as optional for backward compatibility.
  definitionModelVotes?: Record<string, { wins: number; losses: number }>;
  // Per-(canonicalValueA::canonicalValueB::modelId) vote counts, where wins = number of times
  // the model chose canonicalValueA (alphabetically first value key) across ALL definitions
  // in this value pair (both directions combined). Produced from v1.11.0 onwards.
  // wins/(wins+losses) gives the model's true preference score for canonicalValueA,
  // free of the 50/50 cancellation that occurred with per-definition aggregation.
  valuePairModelVotes?: Record<string, { wins: number; losses: number }>;
  // Per-(definitionId, modelId, canonicalA, canonicalB, ownLevel, opponentLevel) outcome.
  // Key format: `${definitionId}::${modelId}::${canonicalA}::${canonicalB}::${ownLevel}::${opponentLevel}`
  // where canonicalA < canonicalB alphabetically.
  // `aChoices` = number of trials where the model chose canonicalA.
  // `bChoices` = number of trials where the model chose canonicalB.
  // `neutrals` = trials with no decisive choice.
  // Used by the modelAgreementOnTradeoffs resolver (v1.12.0+).
  cellLevelOutcomes?: Record<string, { aChoices: number; bChoices: number; neutrals: number }>;
  buildProgress?: DomainAnalysisBuildProgress;
};

export type AnalysisFingerprintRow = {
  runId: string;
  inputHash: string;
};

export type AnalysisOutputRow = {
  runId: string;
  inputHash: string;
  output: unknown;
};

export type DomainAnalysisPreparedState = {
  scope: DomainAnalysisScope;
  domain: { id: string; name: string; defaultModelIds: string[] };
  domains: Array<{ id: string; name: string; defaultModelIds: string[] }>;
  definitions: DefinitionRow[];
  latestDefinitions: DefinitionRow[];
  latestDefinitionIds: string[];
  definitionNameById: Map<string, string>;
  definitionDomainIdById: Map<string, string>;
  resolvedSignatureRuns: Awaited<ReturnType<typeof resolveSignatureRuns>>;
  selectedSignature: string | null;
  configSignature: string;
  fingerprintRows: AnalysisFingerprintRow[];
  inputHash: string;
};
