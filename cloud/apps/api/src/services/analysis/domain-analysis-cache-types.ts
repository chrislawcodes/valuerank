import type { db, Prisma } from '@valuerank/db';
import type {
  DefinitionRow,
  DomainAnalysisMissingDefinition,
  DomainAnalysisValueCounts,
  resolveSignatureRuns,
} from '../../graphql/queries/domain/shared.js';

export const DOMAIN_ANALYSIS_CACHE_STATUS = {
  FRESH: 'FRESH',
  UPDATING: 'UPDATING',
  OUT_OF_DATE: 'OUT_OF_DATE',
} as const;

export type DomainAnalysisCacheStatus =
  (typeof DOMAIN_ANALYSIS_CACHE_STATUS)[keyof typeof DOMAIN_ANALYSIS_CACHE_STATUS];

export const DOMAIN_ANALYSIS_SNAPSHOT_TYPE = 'domain_overview';
export const DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION = '1.3.0';
export const DOMAIN_ANALYSIS_ASSUMPTION_PREFIX = 'domain-analysis';
export const DOMAIN_ANALYSIS_NONE_SIGNATURE = '__none__';

export type SnapshotClient = typeof db | Prisma.TransactionClient;

export type DomainAnalysisSnapshotModel = {
  model: string;
  counts: Record<string, DomainAnalysisValueCounts>;
  pairwiseWins: Record<string, Record<string, number>>;
  // Equal-weight per-vignette win rates (0–100) and vignette counts per value key.
  // Optional for backward compatibility with snapshots built before v1.3.0.
  valueWinRates?: Record<string, number>;
  vignetteCount?: Record<string, number>;
};

export type DomainAnalysisSnapshotOutput = {
  domainId: string;
  domainName: string;
  totalDefinitions: number;
  targetedDefinitions: number;
  coveredDefinitions: number;
  definitionsWithAnalysis: number;
  missingDefinitions: DomainAnalysisMissingDefinition[];
  models: DomainAnalysisSnapshotModel[];
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
  domain: { id: string; name: string; defaultModelIds: string[] };
  definitions: DefinitionRow[];
  latestDefinitions: DefinitionRow[];
  latestDefinitionIds: string[];
  definitionNameById: Map<string, string>;
  resolvedSignatureRuns: Awaited<ReturnType<typeof resolveSignatureRuns>>;
  selectedSignature: string | null;
  configSignature: string;
  fingerprintRows: AnalysisFingerprintRow[];
  inputHash: string;
};
