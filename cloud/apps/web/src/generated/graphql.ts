import gql from 'graphql-tag';
import * as Urql from 'urql';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  DateTime: { input: any; output: any; }
  JSON: { input: any; output: any; }
};

/** Actual cost summary for a completed run */
export type ActualCost = {
  __typename?: 'ActualCost';
  /** Per-model actual cost breakdown */
  perModel: Array<ActualModelCost>;
  /** Total actual cost in USD */
  total: Scalars['Float']['output'];
};

/** Actual cost for a single model from a completed run */
export type ActualModelCost = {
  __typename?: 'ActualModelCost';
  /** Actual cost in USD */
  cost: Scalars['Float']['output'];
  /** Total input tokens used */
  inputTokens: Scalars['Int']['output'];
  /** Model identifier */
  modelId: Scalars['ID']['output'];
  /** Total output tokens used */
  outputTokens: Scalars['Int']['output'];
  /** Number of probes completed */
  probeCount: Scalars['Int']['output'];
};

/** Eligibility and coverage metadata for same-signature aggregate analysis support */
export type AggregateMetadata = {
  __typename?: 'AggregateMetadata';
  aggregateEligibility: Scalars['String']['output'];
  aggregateIneligibilityReason?: Maybe<Scalars['String']['output']>;
  /** Coverage of the planned baseline condition set */
  conditionCoverage: Scalars['JSON']['output'];
  /** Per-model pooled cross-run drift metadata */
  perModelDrift: Scalars['JSON']['output'];
  /** Per-model pooled repeat coverage metadata */
  perModelRepeatCoverage: Scalars['JSON']['output'];
  sourceRunCount: Scalars['Int']['output'];
  sourceRunIds: Array<Scalars['String']['output']>;
};

export type AnalysisFolderCounts = {
  __typename?: 'AnalysisFolderCounts';
  aggregateCount: Scalars['Int']['output'];
  aggregateTagCounts: Array<AnalysisFolderTagCount>;
  aggregateUntaggedCount: Scalars['Int']['output'];
  tagCounts: Array<AnalysisFolderTagCount>;
  untaggedCount: Scalars['Int']['output'];
};

export type AnalysisFolderTagCount = {
  __typename?: 'AnalysisFolderTagCount';
  count: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  tagId: Scalars['String']['output'];
};

/** Analysis results for a run */
export type AnalysisResult = {
  __typename?: 'AnalysisResult';
  /** Actual cost computed from completed transcripts for this run */
  actualCost?: Maybe<ActualCost>;
  /** Eligibility and repeat-coverage metadata for aggregate analysis rows */
  aggregateMetadata?: Maybe<AggregateMetadata>;
  analysisType: Scalars['String']['output'];
  codeVersion: Scalars['String']['output'];
  computedAt?: Maybe<Scalars['DateTime']['output']>;
  createdAt: Scalars['DateTime']['output'];
  /** Dimension impact analysis showing which variables drive variance */
  dimensionAnalysis?: Maybe<Scalars['JSON']['output']>;
  durationMs?: Maybe<Scalars['Int']['output']>;
  id: Scalars['ID']['output'];
  inputHash: Scalars['String']['output'];
  /** Statistical methods and parameters used in analysis */
  methodsUsed: Scalars['JSON']['output'];
  /** Model agreement matrix with pairwise correlations */
  modelAgreement: Scalars['JSON']['output'];
  /** Scenarios with highest disagreement across models */
  mostContestedScenarios: Array<ContestedScenario>;
  /** Per-model statistics with win rates and confidence intervals */
  perModel: Scalars['JSON']['output'];
  /** Explicit preference direction and strength summary */
  preferenceSummary?: Maybe<PreferenceSummary>;
  /** Explicit baseline noise and reliability summary */
  reliabilitySummary?: Maybe<ReliabilitySummary>;
  runId: Scalars['String']['output'];
  /** Status of the analysis result (CURRENT or SUPERSEDED) */
  status: Scalars['String']['output'];
  /** Variance analysis from multi-sample runs (when samplesPerScenario > 1) */
  varianceAnalysis?: Maybe<Scalars['JSON']['output']>;
  /** Data for frontend visualizations (decision distribution, model-scenario matrix) */
  visualizationData?: Maybe<Scalars['JSON']['output']>;
  /** Warnings about statistical assumptions or data quality */
  warnings: Array<AnalysisWarning>;
};

/** Status of an analysis result */
export enum AnalysisStatus {
  Current = 'CURRENT',
  Superseded = 'SUPERSEDED'
}

/** Warning about statistical assumptions or data quality */
export type AnalysisWarning = {
  __typename?: 'AnalysisWarning';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  recommendation: Scalars['String']['output'];
};

/** API key for programmatic/MCP access. The full key is only returned once at creation time. */
export type ApiKey = {
  __typename?: 'ApiKey';
  /** When this key was created */
  createdAt: Scalars['DateTime']['output'];
  /** When this key expires (null = never expires) */
  expiresAt?: Maybe<Scalars['DateTime']['output']>;
  /** Unique API key identifier */
  id: Scalars['ID']['output'];
  /** Key prefix for identification (e.g., "vr_abc123") */
  keyPrefix: Scalars['String']['output'];
  /** When this key was last used for authentication */
  lastUsedAt?: Maybe<Scalars['DateTime']['output']>;
  /** User-provided name for this key */
  name: Scalars['String']['output'];
};

export type AssumptionsTempZeroResult = {
  __typename?: 'AssumptionsTempZeroResult';
  domainName: Scalars['String']['output'];
  generatedAt: Scalars['DateTime']['output'];
  note?: Maybe<Scalars['String']['output']>;
  preflight: TempZeroPreflight;
  rows: Array<TempZeroRow>;
  summary: TempZeroSummary;
};

/** Type of action that was audited */
export enum AuditAction {
  Action = 'ACTION',
  Create = 'CREATE',
  Delete = 'DELETE',
  Update = 'UPDATE'
}

/** An audit log entry recording a mutation */
export type AuditLog = {
  __typename?: 'AuditLog';
  /** Type of action performed (CREATE, UPDATE, DELETE, ACTION) */
  action: Scalars['String']['output'];
  /** When the action occurred */
  createdAt: Scalars['DateTime']['output'];
  /** ID of the affected entity */
  entityId: Scalars['String']['output'];
  /** Type of entity affected (e.g., Definition, Run) */
  entityType: Scalars['String']['output'];
  /** Unique identifier */
  id: Scalars['ID']['output'];
  /** Additional context about the action */
  metadata?: Maybe<Scalars['JSON']['output']>;
  /** User who performed the action (null for system actions) */
  user?: Maybe<User>;
};

/** Paginated list of audit log entries */
export type AuditLogConnection = {
  __typename?: 'AuditLogConnection';
  /** Cursor for the last item in the current page (for pagination) */
  endCursor?: Maybe<Scalars['String']['output']>;
  /** Whether there are more results after the current page */
  hasNextPage: Scalars['Boolean']['output'];
  /** List of audit log entries */
  nodes: Array<AuditLog>;
  /** Total number of matching audit log entries */
  totalCount: Scalars['Int']['output'];
};

/** Filters for querying audit logs */
export type AuditLogFilterInput = {
  /** Filter by action type (CREATE, UPDATE, DELETE, ACTION) */
  action?: InputMaybe<Scalars['String']['input']>;
  /** Filter by specific entity ID */
  entityId?: InputMaybe<Scalars['String']['input']>;
  /** Filter by entity type (e.g., "Definition", "Run") */
  entityType?: InputMaybe<Scalars['String']['input']>;
  /** Filter logs from this date/time (inclusive) */
  from?: InputMaybe<Scalars['DateTime']['input']>;
  /** Filter logs until this date/time (inclusive) */
  to?: InputMaybe<Scalars['DateTime']['input']>;
  /** Filter by user who performed the action */
  userId?: InputMaybe<Scalars['String']['input']>;
};

/** An LLM model available for evaluation runs */
export type AvailableModel = {
  __typename?: 'AvailableModel';
  /** Default version to use if none specified */
  defaultVersion?: Maybe<Scalars['String']['output']>;
  /** Human-readable model name (e.g., "GPT-4o") */
  displayName: Scalars['String']['output'];
  /** Model identifier (e.g., "gpt-4o") */
  id: Scalars['String']['output'];
  /** Whether the model is available (API key configured) */
  isAvailable: Scalars['Boolean']['output'];
  /** Whether this is the default model for its provider */
  isDefault: Scalars['Boolean']['output'];
  /** Provider identifier (e.g., "openai") */
  providerId: Scalars['String']['output'];
  /** Available model versions */
  versions: Array<Scalars['String']['output']>;
};

/** Progress breakdown for a specific model */
export type ByModelProgress = {
  __typename?: 'ByModelProgress';
  completed: Scalars['Int']['output'];
  failed: Scalars['Int']['output'];
  modelId: Scalars['String']['output'];
};

/** Result of cancelling scenario expansion */
export type CancelExpansionResult = {
  __typename?: 'CancelExpansionResult';
  /** Whether an active job was cancelled */
  cancelled: Scalars['Boolean']['output'];
  /** ID of the definition */
  definitionId: Scalars['String']['output'];
  /** ID of the cancelled job (null if no active job) */
  jobId?: Maybe<Scalars['String']['output']>;
  /** Status message */
  message: Scalars['String']['output'];
};

/** Result of cancelling summarization for a run */
export type CancelSummarizationPayload = {
  __typename?: 'CancelSummarizationPayload';
  /** Number of pending summarization jobs cancelled */
  cancelledCount: Scalars['Int']['output'];
  /** The updated run */
  run: Run;
};

export type ClusterAnalysis = {
  __typename?: 'ClusterAnalysis';
  clusters: Array<DomainCluster>;
  defaultPair?: Maybe<Array<Scalars['String']['output']>>;
  faultLinesByPair: Scalars['JSON']['output'];
  skipReason?: Maybe<Scalars['String']['output']>;
  skipped: Scalars['Boolean']['output'];
};

export type ClusterMember = {
  __typename?: 'ClusterMember';
  distancesToNearestClusters?: Maybe<Array<Scalars['Float']['output']>>;
  isOutlier: Scalars['Boolean']['output'];
  label: Scalars['String']['output'];
  model: Scalars['String']['output'];
  nearestClusterIds?: Maybe<Array<Scalars['String']['output']>>;
  silhouetteScore: Scalars['Float']['output'];
};

export type ClusterPairFaultLines = {
  __typename?: 'ClusterPairFaultLines';
  clusterAId: Scalars['String']['output'];
  clusterBId: Scalars['String']['output'];
  distance: Scalars['Float']['output'];
  faultLines: Array<ValueFaultLine>;
};

/** A recent job completion event */
export type CompletionEvent = {
  __typename?: 'CompletionEvent';
  /** When the probe completed */
  completedAt: Scalars['DateTime']['output'];
  /** How long the probe took in milliseconds */
  durationMs: Scalars['Int']['output'];
  /** The model that was probed */
  modelId: Scalars['String']['output'];
  /** The scenario that was evaluated */
  scenarioId: Scalars['String']['output'];
  /** Whether the probe succeeded */
  success: Scalars['Boolean']['output'];
};

export type ConditionPlan = {
  __typename?: 'ConditionPlan';
  conditionKey: Scalars['String']['output'];
  currentSEM?: Maybe<Scalars['Float']['output']>;
  currentSamples: Scalars['Int']['output'];
  neededSamples: Scalars['Int']['output'];
  scenarioId: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

/** A scenario with high disagreement across models */
export type ContestedScenario = {
  __typename?: 'ContestedScenario';
  modelScores: Scalars['JSON']['output'];
  scenarioId: Scalars['String']['output'];
  scenarioName: Scalars['String']['output'];
  variance: Scalars['Float']['output'];
};

/** Complete cost estimate for a run before execution */
export type CostEstimate = {
  __typename?: 'CostEstimate';
  /** Minimum sample count across all models (indicates estimate quality) */
  basedOnSampleCount: Scalars['Int']['output'];
  /** Explanation of fallback usage if applicable */
  fallbackReason?: Maybe<Scalars['String']['output']>;
  /** True if any model is using fallback estimates */
  isUsingFallback: Scalars['Boolean']['output'];
  /** Per-model cost breakdown */
  perModel: Array<ModelCostEstimate>;
  /** Total number of scenarios to be run */
  scenarioCount: Scalars['Int']['output'];
  /** Total estimated cost in USD across all models */
  total: Scalars['Float']['output'];
};

export type CoverageModelOption = {
  __typename?: 'CoverageModelOption';
  label: Scalars['String']['output'];
  modelId: Scalars['String']['output'];
};

export type CreateApiKeyInput = {
  /** Human-readable name for the key (e.g., "Claude Desktop", "Cursor IDE") */
  name: Scalars['String']['input'];
};

/** Result of creating a new API key. The full key is only available in this response. */
export type CreateApiKeyResult = {
  __typename?: 'CreateApiKeyResult';
  /** The created API key metadata */
  apiKey: ApiKey;
  /** The full API key value. IMPORTANT: This is the only time the full key will be shown. */
  key: Scalars['String']['output'];
};

export type CreateDefinitionInput = {
  /** JSONB content for the definition */
  content: Scalars['JSON']['input'];
  /** Name of the definition */
  name: Scalars['String']['input'];
  /** Optional parent definition ID for forking */
  parentId?: InputMaybe<Scalars['String']['input']>;
  /** ID of the preamble version to use */
  preambleVersionId?: InputMaybe<Scalars['String']['input']>;
};

export type CreateDomainContextInput = {
  domainId: Scalars['String']['input'];
  text: Scalars['String']['input'];
};

export type CreatePairedVignetteInput = {
  contextId: Scalars['ID']['input'];
  domainId: Scalars['ID']['input'];
  levelPresetVersionId?: InputMaybe<Scalars['ID']['input']>;
  name: Scalars['String']['input'];
  preambleVersionId?: InputMaybe<Scalars['ID']['input']>;
  valueFirstId: Scalars['ID']['input'];
  valueSecondId: Scalars['ID']['input'];
};

export type CreatePairedVignetteResult = {
  __typename?: 'CreatePairedVignetteResult';
  definitionA: Definition;
  definitionB: Definition;
};

export type CreateLevelPresetInput = {
  l1: Scalars['String']['input'];
  l2: Scalars['String']['input'];
  l3: Scalars['String']['input'];
  l4: Scalars['String']['input'];
  l5: Scalars['String']['input'];
  name: Scalars['String']['input'];
};

/** Input for creating a new LLM model */
export type CreateLlmModelInput = {
  /** Cost per 1M input tokens in USD */
  costInputPerMillion: Scalars['Float']['input'];
  /** Cost per 1M output tokens in USD */
  costOutputPerMillion: Scalars['Float']['input'];
  /** Human-readable display name */
  displayName: Scalars['String']['input'];
  /** API model identifier (e.g., "gpt-4o-mini") */
  modelId: Scalars['String']['input'];
  /** Provider ID this model belongs to */
  providerId: Scalars['String']['input'];
  /** Set as default for this provider */
  setAsDefault?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CreatePreambleInput = {
  content: Scalars['String']['input'];
  name: Scalars['String']['input'];
};

export type CreateSurveyInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  instructions?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  questions: Array<SurveyQuestionInput>;
  responseOptions: Array<SurveyResponseOptionInput>;
};

export type CreateValueStatementInput = {
  body: Scalars['String']['input'];
  domainId: Scalars['String']['input'];
  token: Scalars['String']['input'];
};

export type DebugMismatchResult = {
  __typename?: 'DebugMismatchResult';
  decisionCodes: Array<Maybe<Scalars['String']['output']>>;
  modelId: Scalars['String']['output'];
  promptHashes: Array<Maybe<Scalars['String']['output']>>;
  promptHashesMatch?: Maybe<Scalars['Boolean']['output']>;
  rawResponseSummary: Scalars['String']['output'];
  scenarioId: Scalars['String']['output'];
  systemFingerprints: Array<Maybe<Scalars['String']['output']>>;
  systemFingerprintsMatch?: Maybe<Scalars['Boolean']['output']>;
  transcriptCount: Scalars['Int']['output'];
};

/** A scenario definition that can be versioned through parent-child relationships */
export type Definition = {
  __typename?: 'Definition';
  /** All tags including both local and inherited (deduplicated) */
  allTags: Array<Tag>;
  /** Full ancestry chain from this definition to root (oldest first) */
  ancestors: Array<Definition>;
  /** Child definitions forked from this one */
  children: Array<Definition>;
  /** JSONB content with scenario configuration */
  content: Scalars['JSON']['output'];
  /** When this definition was created */
  createdAt: Scalars['DateTime']['output'];
  /** User who created this definition */
  createdBy?: Maybe<User>;
  /** User who deleted this definition (only populated for soft-deleted records) */
  deletedBy?: Maybe<User>;
  /** All descendants forked from this definition (newest first) */
  descendants: Array<Definition>;
  /** Domain assigned to this definition */
  domain?: Maybe<Domain>;
  /** ID of the domain context attached to this definition */
  domainContextId?: Maybe<Scalars['ID']['output']>;
  /** ID of assigned domain (null means None) */
  domainId?: Maybe<Scalars['ID']['output']>;
  /** Debug info from last scenario expansion, including raw LLM response and parse errors */
  expansionDebug?: Maybe<Scalars['JSON']['output']>;
  /** Status of scenario expansion job for this definition */
  expansionStatus: ExpansionStatus;
  /** Unique identifier */
  id: Scalars['ID']['output'];
  /** Tags inherited from all ancestor definitions (union of ancestor tags) */
  inheritedTags: Array<Tag>;
  /** Whether this definition is a fork (has a parent) */
  isForked: Scalars['Boolean']['output'];
  /** When this definition was last accessed (for retention) */
  lastAccessedAt?: Maybe<Scalars['DateTime']['output']>;
  /** The level preset version used when this vignette was created */
  levelPresetVersion?: Maybe<LevelPresetVersion>;
  /** ID of the level preset version used when this vignette was created */
  levelPresetVersionId?: Maybe<Scalars['String']['output']>;
  /** Raw stored content. For forked definitions, only locally overridden fields are present. */
  localContent: Scalars['JSON']['output'];
  /** Human-readable name */
  name: Scalars['String']['output'];
  /** Indicates which content fields are locally defined vs inherited from parent */
  overrides: DefinitionOverrides;
  /** Parent definition in version tree */
  parent?: Maybe<Definition>;
  /** ID of parent definition (null for root definitions) */
  parentId?: Maybe<Scalars['ID']['output']>;
  /** The specific version of the preamble used */
  preambleVersion?: Maybe<PreambleVersion>;
  /** ID of the specific preamble version used */
  preambleVersionId?: Maybe<Scalars['String']['output']>;
  /** Fully resolved content after walking ancestor chain. All fields are guaranteed present. */
  resolvedContent: Scalars['JSON']['output'];
  /** Number of runs using this definition */
  runCount: Scalars['Int']['output'];
  /** Runs executed with this definition */
  runs: Array<Run>;
  /** Number of scenarios generated from this definition */
  scenarioCount: Scalars['Int']['output'];
  /** Scenarios generated from this definition */
  scenarios: Array<Scenario>;
  /** Tags assigned to this definition */
  tags: Array<Tag>;
  /** Version and temperature consistency across trials for this definition */
  trialConfig: TrialConfigSummary;
  /** Number of prompt/response trials (transcripts) for this definition */
  trialCount: Scalars['Int']['output'];
  /** When this definition was last updated */
  updatedAt: Scalars['DateTime']['output'];
  /** Version counter (increments on every update) */
  version: Scalars['Int']['output'];
};


/** A scenario definition that can be versioned through parent-child relationships */
export type DefinitionRunsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


/** A scenario definition that can be versioned through parent-child relationships */
export type DefinitionScenariosArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};

/** Indicates which content fields are locally overridden vs inherited from parent */
export type DefinitionOverrides = {
  __typename?: 'DefinitionOverrides';
  /** True if dimensions are locally defined, false if inherited */
  dimensions: Scalars['Boolean']['output'];
  /** True if matching rules are locally defined, false if inherited */
  matchingRules: Scalars['Boolean']['output'];
  /** True if template is locally defined, false if inherited */
  template: Scalars['Boolean']['output'];
};

/** Result of deleting a definition */
export type DeleteDefinitionResult = {
  __typename?: 'DeleteDefinitionResult';
  /** Total number of definitions deleted */
  count: Scalars['Int']['output'];
  /** IDs of all definitions that were deleted (includes descendants) */
  deletedIds: Array<Scalars['String']['output']>;
};

export type DeleteLevelPresetResult = {
  __typename?: 'DeleteLevelPresetResult';
  id: Scalars['ID']['output'];
};

/** Result type for tag deletion */
export type DeleteTagResult = {
  __typename?: 'DeleteTagResult';
  /** Number of definitions the tag was removed from */
  affectedDefinitions: Scalars['Int']['output'];
  /** Whether deletion was successful */
  success: Scalars['Boolean']['output'];
};

/** Result of deprecating a model */
export type DeprecateModelResult = {
  __typename?: 'DeprecateModelResult';
  /** The deprecated model */
  model: LlmModel;
  /** The new default model (if previous default was deprecated) */
  newDefault?: Maybe<LlmModel>;
};

/** A single domain used to group vignettes */
export type Domain = {
  __typename?: 'Domain';
  createdAt: Scalars['DateTime']['output'];
  defaultContext?: Maybe<DomainContext>;
  defaultContextId?: Maybe<Scalars['String']['output']>;
  defaultLevelPresetVersion?: Maybe<LevelPresetVersion>;
  defaultLevelPresetVersionId?: Maybe<Scalars['String']['output']>;
  defaultPreambleVersion?: Maybe<PreambleVersion>;
  defaultPreambleVersionId?: Maybe<Scalars['String']['output']>;
  definitionCount: Scalars['Int']['output'];
  definitions: Array<Definition>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  normalizedName: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type DomainAnalysisConditionDetail = {
  __typename?: 'DomainAnalysisConditionDetail';
  conditionName: Scalars['String']['output'];
  deprioritized: Scalars['Int']['output'];
  dimensions?: Maybe<Scalars['JSON']['output']>;
  neutral: Scalars['Int']['output'];
  opponentSomewhat: Scalars['Int']['output'];
  opponentStrongly: Scalars['Int']['output'];
  prioritized: Scalars['Int']['output'];
  scenarioId?: Maybe<Scalars['ID']['output']>;
  selectedValueWinRate?: Maybe<Scalars['Float']['output']>;
  somewhat: Scalars['Int']['output'];
  strongly: Scalars['Int']['output'];
  totalTrials: Scalars['Int']['output'];
  unknownCount: Scalars['Int']['output'];
};

export type DomainAnalysisConditionTranscript = {
  __typename?: 'DomainAnalysisConditionTranscript';
  content: Scalars['JSON']['output'];
  createdAt: Scalars['DateTime']['output'];
  decisionCode?: Maybe<Scalars['String']['output']>;
  decisionCodeSource?: Maybe<Scalars['String']['output']>;
  decisionModelV2?: Maybe<Scalars['JSON']['output']>;
  durationMs: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  modelId: Scalars['String']['output'];
  runId: Scalars['ID']['output'];
  scenarioId?: Maybe<Scalars['ID']['output']>;
  tokenCount: Scalars['Int']['output'];
  turnCount: Scalars['Int']['output'];
};

export type DomainAnalysisMissingDefinition = {
  __typename?: 'DomainAnalysisMissingDefinition';
  definitionId: Scalars['ID']['output'];
  definitionName: Scalars['String']['output'];
  missingAllModels: Scalars['Boolean']['output'];
  missingModelIds: Array<Scalars['String']['output']>;
  missingModelLabels: Array<Scalars['String']['output']>;
  reasonCode: Scalars['String']['output'];
  reasonLabel: Scalars['String']['output'];
};

export type DomainAnalysisModel = {
  __typename?: 'DomainAnalysisModel';
  label: Scalars['String']['output'];
  model: Scalars['String']['output'];
  rankingShape: RankingShape;
  values: Array<DomainAnalysisValueScore>;
};

export type DomainAnalysisResult = {
  __typename?: 'DomainAnalysisResult';
  clusterAnalysis: ClusterAnalysis;
  coveredDefinitions: Scalars['Int']['output'];
  definitionsWithAnalysis: Scalars['Int']['output'];
  domainId: Scalars['ID']['output'];
  domainName: Scalars['String']['output'];
  generatedAt: Scalars['DateTime']['output'];
  missingDefinitionIds: Array<Scalars['ID']['output']>;
  missingDefinitions: Array<DomainAnalysisMissingDefinition>;
  models: Array<DomainAnalysisModel>;
  rankingShapeBenchmarks: RankingShapeBenchmarks;
  targetedDefinitions: Scalars['Int']['output'];
  totalDefinitions: Scalars['Int']['output'];
  unavailableModels: Array<DomainAnalysisUnavailableModel>;
};

export type DomainAnalysisUnavailableModel = {
  __typename?: 'DomainAnalysisUnavailableModel';
  label: Scalars['String']['output'];
  model: Scalars['String']['output'];
  reason: Scalars['String']['output'];
};

export type DomainAnalysisValueDetailResult = {
  __typename?: 'DomainAnalysisValueDetailResult';
  coveredDefinitions: Scalars['Int']['output'];
  deprioritized: Scalars['Int']['output'];
  domainId: Scalars['ID']['output'];
  domainName: Scalars['String']['output'];
  generatedAt: Scalars['DateTime']['output'];
  missingDefinitionIds: Array<Scalars['ID']['output']>;
  modelId: Scalars['String']['output'];
  modelLabel: Scalars['String']['output'];
  neutral: Scalars['Int']['output'];
  prioritized: Scalars['Int']['output'];
  score: Scalars['Float']['output'];
  targetedDefinitions: Scalars['Int']['output'];
  totalTrials: Scalars['Int']['output'];
  valueKey: Scalars['String']['output'];
  vignettes: Array<DomainAnalysisVignetteDetail>;
};

export type DomainAnalysisValueScore = {
  __typename?: 'DomainAnalysisValueScore';
  deprioritized: Scalars['Int']['output'];
  neutral: Scalars['Int']['output'];
  prioritized: Scalars['Int']['output'];
  score: Scalars['Float']['output'];
  totalComparisons: Scalars['Int']['output'];
  valueKey: Scalars['String']['output'];
};

export type DomainAnalysisVignetteDetail = {
  __typename?: 'DomainAnalysisVignetteDetail';
  aggregateRunId?: Maybe<Scalars['ID']['output']>;
  conditions: Array<DomainAnalysisConditionDetail>;
  definitionId: Scalars['ID']['output'];
  definitionName: Scalars['String']['output'];
  definitionVersion: Scalars['Int']['output'];
  deprioritized: Scalars['Int']['output'];
  neutral: Scalars['Int']['output'];
  otherValueKey: Scalars['String']['output'];
  prioritized: Scalars['Int']['output'];
  selectedValueWinRate?: Maybe<Scalars['Float']['output']>;
  totalTrials: Scalars['Int']['output'];
};

export type DomainAvailableSignature = {
  __typename?: 'DomainAvailableSignature';
  isVirtual: Scalars['Boolean']['output'];
  label: Scalars['String']['output'];
  signature: Scalars['String']['output'];
  temperature?: Maybe<Scalars['Float']['output']>;
};

export type DomainCluster = {
  __typename?: 'DomainCluster';
  centroid: Scalars['JSON']['output'];
  definingValues: Array<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  members: Array<ClusterMember>;
  name: Scalars['String']['output'];
};

/** A snapshot of all domain config at a point in time */
export type DomainConfigSnapshot = {
  __typename?: 'DomainConfigSnapshot';
  contextId?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  domainId: Scalars['String']['output'];
  fingerprint: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  levelPresetVersionId?: Maybe<Scalars['String']['output']>;
  preambleVersionId?: Maybe<Scalars['String']['output']>;
  valueStatementVersionIds: Array<Scalars['String']['output']>;
};

/** Summary of a domain config snapshot for history display */
export type DomainConfigSnapshotSummary = {
  __typename?: 'DomainConfigSnapshotSummary';
  contextLabel?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  levelPresetLabel?: Maybe<Scalars['String']['output']>;
  preambleLabel?: Maybe<Scalars['String']['output']>;
  valueStatementCount: Scalars['Int']['output'];
};

/** A shared context paragraph for all vignettes in a domain */
export type DomainContext = {
  __typename?: 'DomainContext';
  createdAt: Scalars['DateTime']['output'];
  domain?: Maybe<Domain>;
  domainId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  text: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  version: Scalars['Int']['output'];
};

export type DomainEvaluation = {
  __typename?: 'DomainEvaluation';
  completedAt?: Maybe<Scalars['DateTime']['output']>;
  createdAt: Scalars['DateTime']['output'];
  createdByUserId?: Maybe<Scalars['ID']['output']>;
  domainId: Scalars['ID']['output'];
  domainNameAtLaunch: Scalars['String']['output'];
  failedDefinitions: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  maxBudgetUsd?: Maybe<Scalars['Float']['output']>;
  memberCount: Scalars['Int']['output'];
  members: Array<DomainEvaluationMember>;
  models: Array<Scalars['String']['output']>;
  projectedCostUsd: Scalars['Float']['output'];
  scopeCategory: Scalars['String']['output'];
  skippedForBudget: Scalars['Int']['output'];
  startedAt?: Maybe<Scalars['DateTime']['output']>;
  startedRuns: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  temperature?: Maybe<Scalars['Float']['output']>;
};

export type DomainEvaluationCostEstimate = {
  __typename?: 'DomainEvaluationCostEstimate';
  basedOnSampleCount: Scalars['Int']['output'];
  defaultTemperature?: Maybe<Scalars['Float']['output']>;
  definitions: Array<DomainEvaluationEstimateDefinition>;
  domainId: Scalars['ID']['output'];
  domainName: Scalars['String']['output'];
  estimateConfidence: Scalars['String']['output'];
  existingTemperatures: Array<Scalars['Float']['output']>;
  fallbackReason?: Maybe<Scalars['String']['output']>;
  isUsingFallback: Scalars['Boolean']['output'];
  knownExclusions: Array<Scalars['String']['output']>;
  models: Array<DomainEvaluationEstimateModel>;
  scopeCategory: Scalars['String']['output'];
  targetedDefinitions: Scalars['Int']['output'];
  temperatureWarning?: Maybe<Scalars['String']['output']>;
  totalEstimatedCost: Scalars['Float']['output'];
  totalScenarioCount: Scalars['Int']['output'];
};

export type DomainEvaluationEstimateDefinition = {
  __typename?: 'DomainEvaluationEstimateDefinition';
  basedOnSampleCount: Scalars['Int']['output'];
  definitionId: Scalars['ID']['output'];
  definitionName: Scalars['String']['output'];
  definitionVersion: Scalars['Int']['output'];
  estimatedCost: Scalars['Float']['output'];
  isUsingFallback: Scalars['Boolean']['output'];
  scenarioCount: Scalars['Int']['output'];
  signature: Scalars['String']['output'];
};

export type DomainEvaluationEstimateModel = {
  __typename?: 'DomainEvaluationEstimateModel';
  basedOnSampleCount: Scalars['Int']['output'];
  estimatedCost: Scalars['Float']['output'];
  isDefault: Scalars['Boolean']['output'];
  isUsingFallback: Scalars['Boolean']['output'];
  label: Scalars['String']['output'];
  modelId: Scalars['String']['output'];
  supportsTemperature: Scalars['Boolean']['output'];
};

export type DomainEvaluationMember = {
  __typename?: 'DomainEvaluationMember';
  createdAt: Scalars['DateTime']['output'];
  definitionIdAtLaunch: Scalars['ID']['output'];
  definitionNameAtLaunch: Scalars['String']['output'];
  domainIdAtLaunch: Scalars['ID']['output'];
  runCategory: Scalars['String']['output'];
  runCompletedAt?: Maybe<Scalars['DateTime']['output']>;
  runId: Scalars['ID']['output'];
  runStartedAt?: Maybe<Scalars['DateTime']['output']>;
  runStatus: Scalars['String']['output'];
};

export type DomainEvaluationStatus = {
  __typename?: 'DomainEvaluationStatus';
  cancelledRuns: Scalars['Int']['output'];
  completedRuns: Scalars['Int']['output'];
  failedRuns: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  pendingRuns: Scalars['Int']['output'];
  runningRuns: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  totalRuns: Scalars['Int']['output'];
};

export type DomainFindingsEligibility = {
  __typename?: 'DomainFindingsEligibility';
  completedEligibleEvaluationCount: Scalars['Int']['output'];
  consideredScopeCategories: Array<Scalars['String']['output']>;
  domainId: Scalars['ID']['output'];
  eligible: Scalars['Boolean']['output'];
  latestEligibleCompletedAt?: Maybe<Scalars['DateTime']['output']>;
  latestEligibleEvaluationId?: Maybe<Scalars['ID']['output']>;
  latestEligibleScopeCategory?: Maybe<Scalars['String']['output']>;
  reasons: Array<Scalars['String']['output']>;
  recommendedActions: Array<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  summary: Scalars['String']['output'];
};

export type DomainMutationResult = {
  __typename?: 'DomainMutationResult';
  affectedDefinitions: Scalars['Int']['output'];
  success: Scalars['Boolean']['output'];
};

export type DomainRunSummary = {
  __typename?: 'DomainRunSummary';
  cancelledEvaluations: Scalars['Int']['output'];
  cancelledMemberRuns: Scalars['Int']['output'];
  completedEvaluations: Scalars['Int']['output'];
  completedMemberRuns: Scalars['Int']['output'];
  domainId: Scalars['ID']['output'];
  failedEvaluations: Scalars['Int']['output'];
  failedMemberRuns: Scalars['Int']['output'];
  latestEvaluationCreatedAt?: Maybe<Scalars['DateTime']['output']>;
  latestEvaluationId?: Maybe<Scalars['ID']['output']>;
  latestEvaluationStatus?: Maybe<Scalars['String']['output']>;
  latestScopeCategory?: Maybe<Scalars['String']['output']>;
  pendingEvaluations: Scalars['Int']['output'];
  pendingMemberRuns: Scalars['Int']['output'];
  pilotEvaluations: Scalars['Int']['output'];
  productionEvaluations: Scalars['Int']['output'];
  replicationEvaluations: Scalars['Int']['output'];
  runningEvaluations: Scalars['Int']['output'];
  runningMemberRuns: Scalars['Int']['output'];
  scopeCategory?: Maybe<Scalars['String']['output']>;
  totalEvaluations: Scalars['Int']['output'];
  totalMemberRuns: Scalars['Int']['output'];
  validationEvaluations: Scalars['Int']['output'];
};

/** Current domain settings: pickers and value statements with versions */
export type DomainSettings = {
  __typename?: 'DomainSettings';
  contextId?: Maybe<Scalars['String']['output']>;
  domainId: Scalars['ID']['output'];
  levelPresetVersionId?: Maybe<Scalars['String']['output']>;
  preambleVersionId?: Maybe<Scalars['String']['output']>;
  valueStatements: Array<ValueStatementWithVersions>;
};

export type DomainTrialModelStatus = {
  __typename?: 'DomainTrialModelStatus';
  generationCompleted: Scalars['Int']['output'];
  generationFailed: Scalars['Int']['output'];
  generationTotal: Scalars['Int']['output'];
  latestErrorMessage?: Maybe<Scalars['String']['output']>;
  modelId: Scalars['String']['output'];
  summarizationCompleted: Scalars['Int']['output'];
  summarizationFailed: Scalars['Int']['output'];
  summarizationTotal: Scalars['Int']['output'];
};

export type DomainTrialPlanCellEstimate = {
  __typename?: 'DomainTrialPlanCellEstimate';
  definitionId: Scalars['ID']['output'];
  estimatedCost: Scalars['Float']['output'];
  modelId: Scalars['String']['output'];
};

export type DomainTrialPlanModel = {
  __typename?: 'DomainTrialPlanModel';
  isDefault: Scalars['Boolean']['output'];
  label: Scalars['String']['output'];
  modelId: Scalars['String']['output'];
  supportsTemperature: Scalars['Boolean']['output'];
};

export type DomainTrialPlanResult = {
  __typename?: 'DomainTrialPlanResult';
  cellEstimates: Array<DomainTrialPlanCellEstimate>;
  defaultTemperature?: Maybe<Scalars['Float']['output']>;
  domainId: Scalars['ID']['output'];
  domainName: Scalars['String']['output'];
  existingTemperatures: Array<Scalars['Float']['output']>;
  models: Array<DomainTrialPlanModel>;
  temperatureWarning?: Maybe<Scalars['String']['output']>;
  totalEstimatedCost: Scalars['Float']['output'];
  vignettes: Array<DomainTrialPlanVignette>;
};

export type DomainTrialPlanVignette = {
  __typename?: 'DomainTrialPlanVignette';
  definitionId: Scalars['ID']['output'];
  definitionName: Scalars['String']['output'];
  definitionVersion: Scalars['Int']['output'];
  existingBatchCount: Scalars['Int']['output'];
  scenarioCount: Scalars['Int']['output'];
  signature: Scalars['String']['output'];
};

export type DomainTrialRunEntry = {
  __typename?: 'DomainTrialRunEntry';
  definitionId: Scalars['ID']['output'];
  modelIds: Array<Scalars['String']['output']>;
  runId: Scalars['ID']['output'];
};

export type DomainTrialRunResult = {
  __typename?: 'DomainTrialRunResult';
  blockedByActiveLaunch: Scalars['Boolean']['output'];
  domainEvaluationId?: Maybe<Scalars['ID']['output']>;
  failedDefinitions: Scalars['Int']['output'];
  projectedCostUsd: Scalars['Float']['output'];
  runs: Array<DomainTrialRunEntry>;
  scopeCategory: Scalars['String']['output'];
  skippedForBudget: Scalars['Int']['output'];
  startedRuns: Scalars['Int']['output'];
  success: Scalars['Boolean']['output'];
  targetedDefinitions: Scalars['Int']['output'];
  totalDefinitions: Scalars['Int']['output'];
};

export type DomainTrialRunStatus = {
  __typename?: 'DomainTrialRunStatus';
  analysisStatus?: Maybe<Scalars['String']['output']>;
  definitionId: Scalars['ID']['output'];
  modelStatuses: Array<DomainTrialModelStatus>;
  runId: Scalars['ID']['output'];
  stalledModels: Array<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type DomainValueCoverageCell = {
  __typename?: 'DomainValueCoverageCell';
  aggregateRunId?: Maybe<Scalars['String']['output']>;
  batchCount: Scalars['Int']['output'];
  definitionId?: Maybe<Scalars['String']['output']>;
  definitionName?: Maybe<Scalars['String']['output']>;
  valueA: Scalars['String']['output'];
  valueB: Scalars['String']['output'];
};

export type DomainValueCoverageResult = {
  __typename?: 'DomainValueCoverageResult';
  availableModels: Array<CoverageModelOption>;
  cells: Array<DomainValueCoverageCell>;
  domainId: Scalars['String']['output'];
  values: Array<Scalars['String']['output']>;
};

/** Real-time execution metrics for monitoring parallel processing */
export type ExecutionMetrics = {
  __typename?: 'ExecutionMetrics';
  /** Estimated seconds until all pending jobs complete */
  estimatedSecondsRemaining?: Maybe<Scalars['Int']['output']>;
  /** Metrics for each LLM provider */
  providers: Array<ProviderExecutionMetrics>;
  /** Total jobs actively being processed across all providers */
  totalActive: Scalars['Int']['output'];
  /** Total jobs queued across all providers */
  totalQueued: Scalars['Int']['output'];
  /** Total probe retry attempts across all models for this run */
  totalRetries: Scalars['Int']['output'];
};

/** Status of a scenario expansion job */
export enum ExpansionJobStatus {
  /** Job is currently running */
  Active = 'ACTIVE',
  /** Job completed successfully */
  Completed = 'COMPLETED',
  /** Job failed */
  Failed = 'FAILED',
  /** No expansion job exists */
  None = 'NONE',
  /** Job is queued and waiting to run */
  Pending = 'PENDING'
}

/** Real-time progress during scenario expansion */
export type ExpansionProgress = {
  __typename?: 'ExpansionProgress';
  /** Total number of scenarios expected to be generated */
  expectedScenarios: Scalars['Int']['output'];
  /** Number of scenarios generated so far */
  generatedScenarios: Scalars['Int']['output'];
  /** Number of input tokens used */
  inputTokens: Scalars['Int']['output'];
  /** Human-readable status message */
  message: Scalars['String']['output'];
  /** Number of output tokens received */
  outputTokens: Scalars['Int']['output'];
  /** Current phase (starting, calling_llm, parsing, completed, failed) */
  phase: Scalars['String']['output'];
  /** When this progress was last updated (ISO timestamp) */
  updatedAt: Scalars['String']['output'];
};

/** Status of scenario expansion for a definition */
export type ExpansionStatus = {
  __typename?: 'ExpansionStatus';
  /** When the expansion job completed */
  completedAt?: Maybe<Scalars['DateTime']['output']>;
  /** When the expansion job was created */
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  /** Error message if the job failed */
  error?: Maybe<Scalars['String']['output']>;
  /** ID of the expansion job (if any) */
  jobId?: Maybe<Scalars['String']['output']>;
  /** Real-time progress during expansion (null when not actively expanding) */
  progress?: Maybe<ExpansionProgress>;
  /** Number of scenarios currently generated for this definition */
  scenarioCount: Scalars['Int']['output'];
  /** Current status of the expansion job */
  status: ExpansionJobStatus;
  /** What triggered the expansion (create, update, fork) */
  triggeredBy?: Maybe<Scalars['String']['output']>;
};

/** An experiment grouping multiple runs for comparison */
export type Experiment = {
  __typename?: 'Experiment';
  analysisPlan?: Maybe<Scalars['JSON']['output']>;
  createdAt: Scalars['DateTime']['output'];
  hypothesis?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  runCount: Scalars['Int']['output'];
  runs: Array<Run>;
  updatedAt: Scalars['DateTime']['output'];
};

/** Result of a synchronous export operation */
export type ExportResult = {
  __typename?: 'ExportResult';
  /** The exported content (text/markdown/yaml/etc) */
  content: Scalars['String']['output'];
  /** Suggested filename for download */
  filename: Scalars['String']['output'];
  /** MIME type for the content */
  mimeType: Scalars['String']['output'];
};

export type FinalTrialPlan = {
  __typename?: 'FinalTrialPlan';
  definitionId: Scalars['String']['output'];
  models: Array<ModelPlan>;
  totalJobs: Scalars['Int']['output'];
};

export type ForkDefinitionInput = {
  /** Optional content override. If not provided, inherits everything from parent (stores minimal v2 content). */
  content?: InputMaybe<Scalars['JSON']['input']>;
  /** If true, fork with minimal content (inherit everything). Default: true. Set to false to copy parent content. */
  inheritAll?: InputMaybe<Scalars['Boolean']['input']>;
  /** Name for the forked definition */
  name: Scalars['String']['input'];
  /** ID of the definition to fork from */
  parentId: Scalars['String']['input'];
};

/** Job counts for a specific job type */
export type JobTypeStatus = {
  __typename?: 'JobTypeStatus';
  /** Number of jobs currently being processed */
  active: Scalars['Int']['output'];
  /** Number of completed jobs (from recent archive) */
  completed: Scalars['Int']['output'];
  /** Number of failed jobs */
  failed: Scalars['Int']['output'];
  /** Number of jobs waiting to be processed */
  pending: Scalars['Int']['output'];
  /** Job type name (e.g., probe_scenario) */
  type: Scalars['String']['output'];
};

export type LaunchAssumptionsTempZeroPayload = {
  __typename?: 'LaunchAssumptionsTempZeroPayload';
  failedVignetteIds: Array<Scalars['String']['output']>;
  modelCount: Scalars['Int']['output'];
  runIds: Array<Scalars['String']['output']>;
  startedRuns: Scalars['Int']['output'];
  totalVignettes: Scalars['Int']['output'];
};

export type LaunchOrderInvariancePayload = {
  __typename?: 'LaunchOrderInvariancePayload';
  approvedPairs: Scalars['Int']['output'];
  failedDefinitionIds: Array<Scalars['String']['output']>;
  modelCount: Scalars['Int']['output'];
  runIds: Array<Scalars['String']['output']>;
  runsByVariantType: Scalars['JSON']['output'];
  startedRuns: Scalars['Int']['output'];
};

/** A named level preset defining the 5-word intensity scale for job-choice conditions */
export type LevelPreset = {
  __typename?: 'LevelPreset';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** The most recently created version */
  latestVersion?: Maybe<LevelPresetVersion>;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  /** All versions of this level preset (newest first) */
  versions: Array<LevelPresetVersion>;
};

/** A versioned snapshot of a level preset (5-word intensity scale) */
export type LevelPresetVersion = {
  __typename?: 'LevelPresetVersion';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  l1: Scalars['String']['output'];
  l2: Scalars['String']['output'];
  l3: Scalars['String']['output'];
  l4: Scalars['String']['output'];
  l5: Scalars['String']['output'];
  /** The parent level preset */
  levelPreset?: Maybe<LevelPreset>;
  levelPresetId: Scalars['String']['output'];
  version: Scalars['String']['output'];
};

/** An LLM model with pricing and lifecycle status */
export type LlmModel = {
  __typename?: 'LlmModel';
  /** Provider-specific API configuration (e.g., {"maxTokensParam": "max_completion_tokens"}) */
  apiConfig?: Maybe<Scalars['JSON']['output']>;
  /** Cost per 1M input tokens in USD */
  costInputPerMillion: Scalars['Float']['output'];
  /** Cost per 1M output tokens in USD */
  costOutputPerMillion: Scalars['Float']['output'];
  createdAt: Scalars['DateTime']['output'];
  /** User who created this LLM model */
  createdBy?: Maybe<User>;
  /** Human-readable name (e.g., "GPT-4o Mini") */
  displayName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** Whether this model is available (provider has API key configured) */
  isAvailable: Scalars['Boolean']['output'];
  /** Whether this is the default model for its provider */
  isDefault: Scalars['Boolean']['output'];
  /** API model identifier (e.g., "gpt-4o-mini") */
  modelId: Scalars['String']['output'];
  /** The provider this model belongs to */
  provider: LlmProvider;
  /** Provider this model belongs to */
  providerId: Scalars['ID']['output'];
  /** Lifecycle status (ACTIVE or DEPRECATED) */
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

/** Lifecycle status of an LLM model */
export enum LlmModelStatus {
  Active = 'ACTIVE',
  Deprecated = 'DEPRECATED'
}

/** An LLM API provider with rate limiting and parallelism settings */
export type LlmProvider = {
  __typename?: 'LlmProvider';
  /** Active models only (excludes deprecated) */
  activeModels: Array<LlmModel>;
  /** Remaining budget balance in dollars (null = budget tracking disabled) */
  balance?: Maybe<Scalars['Float']['output']>;
  createdAt: Scalars['DateTime']['output'];
  /** The default model for this provider */
  defaultModel?: Maybe<LlmModel>;
  /** Human-readable name (e.g., "OpenAI") */
  displayName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** Whether the provider is available for use */
  isEnabled: Scalars['Boolean']['output'];
  /** Timestamp of the most recent manual balance sync (null = never synced) */
  lastSyncedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Maximum concurrent API requests allowed */
  maxParallelRequests: Scalars['Int']['output'];
  /** All models belonging to this provider */
  models: Array<LlmModel>;
  /** Provider identifier (e.g., "openai", "anthropic") */
  name: Scalars['String']['output'];
  /** Rate limit (requests per minute) */
  requestsPerMinute: Scalars['Int']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

/** Cost estimate for a single model in a run */
export type ModelCostEstimate = {
  __typename?: 'ModelCostEstimate';
  /** Average input tokens per probe used for prediction */
  avgInputPerProbe: Scalars['Float']['output'];
  /** Average output tokens per probe used for prediction */
  avgOutputPerProbe: Scalars['Float']['output'];
  /** Human-readable model name */
  displayName: Scalars['String']['output'];
  /** Cost for input tokens in USD */
  inputCost: Scalars['Float']['output'];
  /** Predicted total input tokens for all scenarios */
  inputTokens: Scalars['Float']['output'];
  /** True if using fallback estimates (no model-specific history) */
  isUsingFallback: Scalars['Boolean']['output'];
  /** Model identifier (e.g., 'openai:gpt-4o') */
  modelId: Scalars['ID']['output'];
  /** Cost for output tokens in USD */
  outputCost: Scalars['Float']['output'];
  /** Predicted total output tokens for all scenarios */
  outputTokens: Scalars['Float']['output'];
  /** Number of historical probes used to compute averages */
  sampleCount: Scalars['Int']['output'];
  /** Number of scenarios this model will run */
  scenarioCount: Scalars['Int']['output'];
  /** Total cost (inputCost + outputCost) in USD */
  totalCost: Scalars['Float']['output'];
};

export type ModelPlan = {
  __typename?: 'ModelPlan';
  conditions: Array<ConditionPlan>;
  modelId: Scalars['String']['output'];
  totalNeededSamples: Scalars['Int']['output'];
};

/** Token usage statistics for a model, used for cost prediction */
export type ModelTokenStats = {
  __typename?: 'ModelTokenStats';
  /** Average input tokens per probe based on historical data */
  avgInputTokens: Scalars['Float']['output'];
  /** Average output tokens per probe based on historical data */
  avgOutputTokens: Scalars['Float']['output'];
  /** When these statistics were last updated */
  lastUpdatedAt: Scalars['DateTime']['output'];
  /** Model identifier (e.g., 'openai:gpt-4o') */
  modelId: Scalars['ID']['output'];
  /** Number of probes used to compute these averages */
  sampleCount: Scalars['Int']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Add a tag to a definition. No-op if tag is already assigned. */
  addTagToDefinition: Definition;
  assignDomainToDefinitions: DomainMutationResult;
  assignDomainToDefinitionsByFilter: DomainMutationResult;
  /**
   *
   *       Cancel an evaluation run.
   *
   *       Jobs currently being processed will complete, but all pending jobs
   *       will be removed from the queue. Completed results are preserved.
   *
   *       Requires authentication. Run must be in PENDING, RUNNING, or PAUSED state.
   *
   */
  cancelRun: Run;
  /** Cancel an in-progress scenario expansion for a definition. */
  cancelScenarioExpansion: CancelExpansionResult;
  /**
   *
   *       Cancel pending summarization jobs for a run.
   *
   *       Only works when run is in SUMMARIZING state.
   *       Cancels pending summarize_transcript jobs in the queue.
   *       Preserves already-completed summaries.
   *       Transitions run to COMPLETED state.
   *
   *       Requires authentication.
   *
   */
  cancelSummarization: CancelSummarizationPayload;
  /** Create a tag and immediately assign it to a definition. Convenience mutation for inline tag creation. */
  createAndAssignTag: Definition;
  /**
   *
   *       Create a new API key for the current user.
   *       Requires authentication.
   *
   *       The full key value is returned ONLY in this response.
   *       Store it securely - it cannot be retrieved later.
   *
   */
  createApiKey: CreateApiKeyResult;
  /** Create a new definition. Automatically adds schema_version to content if not present. */
  createDefinition: Definition;
  createDomain: Domain;
  createDomainContext: DomainContext;
  /** @deprecated Use createPairedVignette instead */
  createJobChoicePair: CreatePairedVignetteResult;
  createLevelPreset: LevelPreset;
  createPairedVignette: CreatePairedVignetteResult;
  /** Create a new LLM model under a provider */
  createLlmModel: LlmModel;
  /** Create a new preamble */
  createPreamble: Preamble;
  /** Create a survey with a backing definition and one scenario per question. */
  createSurvey: Experiment;
  /** Create a new tag. Name is normalized to lowercase and must be unique. */
  createTag: Tag;
  createValueStatement: ValueStatement;
  /** Soft delete a definition and all its descendants. Related scenarios and tags are also soft deleted. */
  deleteDefinition: DeleteDefinitionResult;
  deleteDomain: DomainMutationResult;
  deleteDomainContext: Scalars['Boolean']['output'];
  deleteLevelPreset: DeleteLevelPresetResult;
  /** Delete a preamble */
  deletePreamble: Preamble;
  /**
   *
   *       Soft delete a run and its associated data.
   *
   *       Sets deletedAt timestamp on the run. Transcripts and analysis results
   *       associated with this run will be filtered out in queries.
   *
   *       Requires authentication.
   *
   */
  deleteRun: Scalars['Boolean']['output'];
  /** Delete a survey and detach runs from it. */
  deleteSurvey: Scalars['Boolean']['output'];
  /** Delete a tag. Removes the tag from all definitions that use it. */
  deleteTag: DeleteTagResult;
  deleteValueStatement: Scalars['Boolean']['output'];
  /** Deprecate an LLM model (mark as no longer recommended for new runs) */
  deprecateLlmModel: DeprecateModelResult;
  /** Duplicate a survey into a new survey family at version 1. */
  duplicateSurvey: Experiment;
  /** Export a definition as markdown in devtool-compatible format */
  exportDefinitionAsMd: ExportResult;
  /** Export scenarios as CLI-compatible YAML for use with probe.py */
  exportScenariosAsYaml: ExportResult;
  /** Fork an existing definition. By default inherits all content from parent (sparse v2 storage). */
  forkDefinition: Definition;
  launchAssumptionsTempZero: LaunchAssumptionsTempZeroPayload;
  launchOrderInvariance: LaunchOrderInvariancePayload;
  /**
   *
   *       Pause the global job queue.
   *
   *       All job processing will stop until the queue is resumed.
   *       Jobs will continue to be queued but not processed.
   *
   *       Requires authentication.
   *
   */
  pauseQueue: QueueStatus;
  /**
   *
   *       Pause a running evaluation.
   *
   *       Jobs currently being processed will complete, but no new jobs
   *       will be started until the run is resumed.
   *
   *       Requires authentication. Run must be in PENDING or RUNNING state.
   *
   */
  pauseRun: Run;
  /** Reactivate a deprecated LLM model */
  reactivateLlmModel: LlmModel;
  /**
   *
   *       Recompute analysis for a run.
   *
   *       This will:
   *       1. Mark any existing analysis as SUPERSEDED
   *       2. Queue a new analyze_basic job
   *       3. Return the job status (analysis will be computed asynchronously)
   *
   *       Returns null if the run is not found or not completed.
   *       Requires authentication.
   *
   */
  recomputeAnalysis?: Maybe<AnalysisResult>;
  /**
   *
   *       Attempt to recover an orphaned run.
   *
   *       If the run is stuck in RUNNING or SUMMARIZING state with no active jobs,
   *       this will re-queue missing probe jobs or summarize jobs as needed.
   *
   *       Useful for recovering from API restarts or other interruptions.
   *
   *       Requires authentication.
   *
   */
  recoverRun: RecoverRunPayload;
  /** Manually trigger scenario regeneration for a definition. Queues a new expansion job. */
  regenerateScenarios: RegenerateScenariosResult;
  /** Remove a tag from a definition. No-op if tag was not assigned. */
  removeTagFromDefinition: Definition;
  renameDomain: Domain;
  /**
   *
   *       Restart summarization for a run.
   *
   *       Only works when run is in a terminal state (COMPLETED/FAILED/CANCELLED).
   *       By default, only re-queues transcripts without summaries or with errors.
   *       With force=true, re-queues all transcripts.
   *
   *       Requires authentication.
   *
   */
  restartSummarization: RestartSummarizationPayload;
  /**
   *
   *       Resume the global job queue.
   *
   *       Job processing will restart from where it left off.
   *
   *       Requires authentication.
   *
   */
  resumeQueue: QueueStatus;
  /**
   *
   *       Resume a paused evaluation.
   *
   *       Jobs will begin processing again from where they left off.
   *
   *       Requires authentication. Run must be in PAUSED state.
   *
   */
  resumeRun: Run;
  retryDomainTrialCell: RetryDomainTrialCellResult;
  reviewOrderInvariancePair: ReviewOrderInvariancePairPayload;
  /**
   *
   *       Revoke (delete) an API key.
   *       Requires authentication and ownership of the key.
   *
   *       Returns true if the key was successfully revoked.
   *       Throws NotFoundError if the key doesn't exist or belongs to another user.
   *
   */
  revokeApiKey: Scalars['Boolean']['output'];
  runTrialsForDomain: DomainTrialRunResult;
  /** Set a model as a default for its provider */
  setDefaultLlmModel: SetDefaultModelResult;
  setDomainDefaults: Domain;
  setDomainSettings: Domain;
  /** Set the budget balance for a provider (null disables budget tracking) */
  setProviderBalance: LlmProvider;
  startDomainEvaluation: DomainTrialRunResult;
  /**
   *
   *       Start a new evaluation run.
   *
   *       Creates a run record and queues probe_scenario jobs for each model-scenario combination.
   *       Requires authentication.
   *
   *       Returns the created run and the number of jobs queued.
   *
   */
  startRun: StartRunPayload;
  /** Sync the provider balance with the real balance from the provider dashboard */
  syncProviderBalance: ProviderBalanceSyncLog;
  /**
   *
   *       Trigger a system-wide scan for orphaned runs.
   *
   *       Detects all runs stuck in RUNNING or SUMMARIZING state with no active jobs,
   *       and attempts to recover them by re-queuing missing jobs.
   *
   *       This is normally run automatically every 5 minutes, but can be triggered manually.
   *
   *       Requires authentication.
   *
   */
  triggerRecovery: TriggerRecoveryPayload;
  /** Detach a forked definition from its parent and snapshot inherited content locally. */
  unforkDefinition: Definition;
  /** Remove a model from defaults for its provider */
  unsetDefaultLlmModel: LlmModel;
  /** Update an existing definition. Note: If definition has runs, consider forking instead to preserve history. */
  updateDefinition: Definition;
  /** Update specific content fields of a definition. Supports clearing overrides to inherit from parent. */
  updateDefinitionContent: Definition;
  updateDomainContext: DomainContext;
  /** @deprecated Use updatePairedVignette instead */
  updateJobChoicePair: CreatePairedVignetteResult;
  updateLevelPreset: LevelPreset;
  updatePairedVignette: CreatePairedVignetteResult;
  /** Update an LLM model (display name, costs, API config) */
  updateLlmModel: LlmModel;
  /** Update LLM provider settings (rate limits, enabled status) */
  updateLlmProvider: LlmProvider;
  /** Update a preamble (creates a new version) */
  updatePreamble: Preamble;
  /**
   *
   *       Update a run's properties.
   *
   *       Currently supports updating the run name.
   *
   *       Requires authentication.
   *
   */
  updateRun: Run;
  /** Create a new survey version from an existing survey. */
  updateSurvey: Experiment;
  /** Update a system setting (creates if not exists) */
  updateSystemSetting: SystemSetting;
  /**
   *
   *       Manually update a transcript decision code.
   *
   *       Accepts only positive integer decision codes.
   *       If the run is already completed, this will supersede current analysis
   *       and queue a recompute job.
   *
   *       Requires authentication.
   *
   */
  updateTranscriptDecision: Transcript;
  updateValueStatement: ValueStatement;
};


export type MutationAddTagToDefinitionArgs = {
  definitionId: Scalars['String']['input'];
  tagId: Scalars['String']['input'];
};


export type MutationAssignDomainToDefinitionsArgs = {
  definitionIds: Array<Scalars['ID']['input']>;
  domainId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationAssignDomainToDefinitionsByFilterArgs = {
  domainId?: InputMaybe<Scalars['ID']['input']>;
  hasRuns?: InputMaybe<Scalars['Boolean']['input']>;
  rootOnly?: InputMaybe<Scalars['Boolean']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  sourceDomainId?: InputMaybe<Scalars['ID']['input']>;
  tagIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  withoutDomain?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationCancelRunArgs = {
  runId: Scalars['ID']['input'];
};


export type MutationCancelScenarioExpansionArgs = {
  definitionId: Scalars['String']['input'];
};


export type MutationCancelSummarizationArgs = {
  runId: Scalars['ID']['input'];
};


export type MutationCreateAndAssignTagArgs = {
  definitionId: Scalars['String']['input'];
  tagName: Scalars['String']['input'];
};


export type MutationCreateApiKeyArgs = {
  input: CreateApiKeyInput;
};


export type MutationCreateDefinitionArgs = {
  input: CreateDefinitionInput;
};


export type MutationCreateDomainArgs = {
  name: Scalars['String']['input'];
};


export type MutationCreateDomainContextArgs = {
  input: CreateDomainContextInput;
};


export type MutationCreateJobChoicePairArgs = {
  input: CreatePairedVignetteInput;
};


export type MutationCreateLevelPresetArgs = {
  l1: Scalars['String']['input'];
  l2: Scalars['String']['input'];
  l3: Scalars['String']['input'];
  l4: Scalars['String']['input'];
  l5: Scalars['String']['input'];
  name: Scalars['String']['input'];
};


export type MutationCreateLlmModelArgs = {
  input: CreateLlmModelInput;
};


export type MutationCreatePreambleArgs = {
  input: CreatePreambleInput;
};


export type MutationCreateSurveyArgs = {
  input: CreateSurveyInput;
};


export type MutationCreateTagArgs = {
  name: Scalars['String']['input'];
};


export type MutationCreateValueStatementArgs = {
  input: CreateValueStatementInput;
};


export type MutationDeleteDefinitionArgs = {
  id: Scalars['String']['input'];
};


export type MutationDeleteDomainArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteDomainContextArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteLevelPresetArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeletePreambleArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteRunArgs = {
  runId: Scalars['ID']['input'];
};


export type MutationDeleteSurveyArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteTagArgs = {
  id: Scalars['String']['input'];
};


export type MutationDeleteValueStatementArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeprecateLlmModelArgs = {
  id: Scalars['String']['input'];
};


export type MutationDuplicateSurveyArgs = {
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
};


export type MutationExportDefinitionAsMdArgs = {
  id: Scalars['ID']['input'];
};


export type MutationExportScenariosAsYamlArgs = {
  definitionId: Scalars['ID']['input'];
};


export type MutationForkDefinitionArgs = {
  input: ForkDefinitionInput;
};


export type MutationLaunchAssumptionsTempZeroArgs = {
  force?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationLaunchOrderInvarianceArgs = {
  force?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationPauseRunArgs = {
  runId: Scalars['ID']['input'];
};


export type MutationReactivateLlmModelArgs = {
  id: Scalars['String']['input'];
};


export type MutationRecomputeAnalysisArgs = {
  runId: Scalars['ID']['input'];
};


export type MutationRecoverRunArgs = {
  runId: Scalars['ID']['input'];
};


export type MutationRegenerateScenariosArgs = {
  definitionId: Scalars['String']['input'];
};


export type MutationRemoveTagFromDefinitionArgs = {
  definitionId: Scalars['String']['input'];
  tagId: Scalars['String']['input'];
};


export type MutationRenameDomainArgs = {
  id: Scalars['ID']['input'];
  name: Scalars['String']['input'];
};


export type MutationRestartSummarizationArgs = {
  force?: InputMaybe<Scalars['Boolean']['input']>;
  runId: Scalars['ID']['input'];
};


export type MutationResumeRunArgs = {
  runId: Scalars['ID']['input'];
};


export type MutationRetryDomainTrialCellArgs = {
  definitionId: Scalars['ID']['input'];
  domainId: Scalars['ID']['input'];
  modelId: Scalars['String']['input'];
  scopeCategory?: InputMaybe<Scalars['String']['input']>;
  temperature?: InputMaybe<Scalars['Float']['input']>;
};


export type MutationReviewOrderInvariancePairArgs = {
  pairId: Scalars['ID']['input'];
  reviewNotes?: InputMaybe<Scalars['String']['input']>;
  reviewStatus: Scalars['String']['input'];
};


export type MutationRevokeApiKeyArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRunTrialsForDomainArgs = {
  definitionIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  domainId: Scalars['ID']['input'];
  maxBudgetUsd?: InputMaybe<Scalars['Float']['input']>;
  temperature?: InputMaybe<Scalars['Float']['input']>;
};


export type MutationSetDefaultLlmModelArgs = {
  id: Scalars['String']['input'];
};


export type MutationSetDomainDefaultsArgs = {
  defaultContextId?: InputMaybe<Scalars['ID']['input']>;
  defaultLevelPresetVersionId?: InputMaybe<Scalars['ID']['input']>;
  defaultPreambleVersionId?: InputMaybe<Scalars['ID']['input']>;
  id: Scalars['ID']['input'];
};


export type MutationSetDomainSettingsArgs = {
  contextId?: InputMaybe<Scalars['ID']['input']>;
  domainId: Scalars['ID']['input'];
  levelPresetVersionId?: InputMaybe<Scalars['ID']['input']>;
  preambleVersionId?: InputMaybe<Scalars['ID']['input']>;
  valueStatements: Array<ValueStatementInput>;
};


export type MutationSetProviderBalanceArgs = {
  balance?: InputMaybe<Scalars['Float']['input']>;
  providerId: Scalars['String']['input'];
};


export type MutationStartDomainEvaluationArgs = {
  definitionIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  domainId: Scalars['ID']['input'];
  maxBudgetUsd?: InputMaybe<Scalars['Float']['input']>;
  modelIds?: InputMaybe<Array<Scalars['String']['input']>>;
  samplePercentage?: InputMaybe<Scalars['Int']['input']>;
  samplesPerScenario?: InputMaybe<Scalars['Int']['input']>;
  scopeCategory?: InputMaybe<Scalars['String']['input']>;
  targetBatchCount?: InputMaybe<Scalars['Int']['input']>;
  temperature?: InputMaybe<Scalars['Float']['input']>;
};


export type MutationStartRunArgs = {
  input: StartRunInput;
};


export type MutationSyncProviderBalanceArgs = {
  providerId: Scalars['String']['input'];
  realBalance: Scalars['Float']['input'];
};


export type MutationUnforkDefinitionArgs = {
  id: Scalars['String']['input'];
};


export type MutationUnsetDefaultLlmModelArgs = {
  id: Scalars['String']['input'];
};


export type MutationUpdateDefinitionArgs = {
  id: Scalars['String']['input'];
  input: UpdateDefinitionInput;
};


export type MutationUpdateDefinitionContentArgs = {
  id: Scalars['String']['input'];
  input: UpdateDefinitionContentInput;
};


export type MutationUpdateDomainContextArgs = {
  id: Scalars['ID']['input'];
  input: UpdateDomainContextInput;
};


export type MutationUpdateJobChoicePairArgs = {
  input: UpdatePairedVignetteInput;
};


export type MutationUpdateLevelPresetArgs = {
  id: Scalars['ID']['input'];
  l1: Scalars['String']['input'];
  l2: Scalars['String']['input'];
  l3: Scalars['String']['input'];
  l4: Scalars['String']['input'];
  l5: Scalars['String']['input'];
};


export type MutationUpdateLlmModelArgs = {
  id: Scalars['String']['input'];
  input: UpdateLlmModelInput;
};


export type MutationUpdateLlmProviderArgs = {
  id: Scalars['String']['input'];
  input: UpdateLlmProviderInput;
};


export type MutationUpdatePreambleArgs = {
  id: Scalars['ID']['input'];
  input: UpdatePreambleInput;
};


export type MutationUpdateRunArgs = {
  input: UpdateRunInput;
  runId: Scalars['ID']['input'];
};


export type MutationUpdateSurveyArgs = {
  id: Scalars['ID']['input'];
  input: UpdateSurveyInput;
};


export type MutationUpdateSystemSettingArgs = {
  input: UpdateSystemSettingInput;
};


export type MutationUpdateTranscriptDecisionArgs = {
  decisionCode: Scalars['String']['input'];
  transcriptId: Scalars['ID']['input'];
};


export type MutationUpdateValueStatementArgs = {
  id: Scalars['ID']['input'];
  input: UpdateValueStatementInput;
};

export type OrderInvarianceExclusionCount = {
  __typename?: 'OrderInvarianceExclusionCount';
  count: Scalars['Int']['output'];
  reason: Scalars['String']['output'];
};

export type OrderInvarianceLaunchRun = {
  __typename?: 'OrderInvarianceLaunchRun';
  completedAt?: Maybe<Scalars['DateTime']['output']>;
  completedTrials: Scalars['Int']['output'];
  failedTrials: Scalars['Int']['output'];
  isStalled: Scalars['Boolean']['output'];
  percentComplete: Scalars['Float']['output'];
  runId: Scalars['ID']['output'];
  startedAt?: Maybe<Scalars['DateTime']['output']>;
  status: Scalars['String']['output'];
  targetedTrials: Scalars['Int']['output'];
};

export type OrderInvarianceLaunchStatus = {
  __typename?: 'OrderInvarianceLaunchStatus';
  activeRuns: Scalars['Int']['output'];
  completedRuns: Scalars['Int']['output'];
  completedTrials: Scalars['Int']['output'];
  failedRuns: Scalars['Int']['output'];
  failedTrials: Scalars['Int']['output'];
  failureSummaries: Array<Scalars['String']['output']>;
  generatedAt: Scalars['DateTime']['output'];
  isComplete: Scalars['Boolean']['output'];
  percentComplete: Scalars['Float']['output'];
  runs: Array<OrderInvarianceLaunchRun>;
  stalledModels: Array<Scalars['String']['output']>;
  targetedTrials: Scalars['Int']['output'];
  totalRuns: Scalars['Int']['output'];
};

export type OrderInvarianceModelMetrics = {
  __typename?: 'OrderInvarianceModelMetrics';
  matchCount: Scalars['Int']['output'];
  matchEligibleCount: Scalars['Int']['output'];
  matchRate?: Maybe<Scalars['Float']['output']>;
  modelId: Scalars['String']['output'];
  modelLabel: Scalars['String']['output'];
  pairLevelMarginSummary?: Maybe<PairLevelMarginSummary>;
  scaleOrderEligibleCount: Scalars['Int']['output'];
  scaleOrderExcludedCount: Scalars['Int']['output'];
  scaleOrderPull: Scalars['String']['output'];
  scaleOrderReversalRate?: Maybe<Scalars['Float']['output']>;
  valueOrderEligibleCount: Scalars['Int']['output'];
  valueOrderExcludedCount: Scalars['Int']['output'];
  valueOrderPull: Scalars['String']['output'];
  valueOrderReversalRate?: Maybe<Scalars['Float']['output']>;
  withinCellDisagreementRate?: Maybe<Scalars['Float']['output']>;
};

export type OrderInvarianceResult = {
  __typename?: 'OrderInvarianceResult';
  generatedAt: Scalars['DateTime']['output'];
  modelMetrics: Array<OrderInvarianceModelMetrics>;
  rows: Array<OrderInvarianceRow>;
  summary: OrderInvarianceSummary;
};

export type OrderInvarianceReviewResult = {
  __typename?: 'OrderInvarianceReviewResult';
  generatedAt: Scalars['DateTime']['output'];
  summary: OrderInvarianceReviewSummary;
  vignettes: Array<OrderInvarianceReviewVignette>;
};

export type OrderInvarianceReviewSummary = {
  __typename?: 'OrderInvarianceReviewSummary';
  approvedVignettes: Scalars['Int']['output'];
  launchReady: Scalars['Boolean']['output'];
  pendingVignettes: Scalars['Int']['output'];
  rejectedVignettes: Scalars['Int']['output'];
  reviewedVignettes: Scalars['Int']['output'];
  totalVignettes: Scalars['Int']['output'];
};

export type OrderInvarianceReviewVignette = {
  __typename?: 'OrderInvarianceReviewVignette';
  baselineName: Scalars['String']['output'];
  baselineText: Scalars['String']['output'];
  conditionKey: Scalars['String']['output'];
  conditionPairCount: Scalars['Int']['output'];
  flippedName: Scalars['String']['output'];
  flippedText: Scalars['String']['output'];
  pairId: Scalars['ID']['output'];
  reviewNotes?: Maybe<Scalars['String']['output']>;
  reviewStatus: Scalars['String']['output'];
  reviewedAt?: Maybe<Scalars['DateTime']['output']>;
  reviewedBy?: Maybe<Scalars['String']['output']>;
  sourceScenarioId: Scalars['ID']['output'];
  variantScenarioId: Scalars['ID']['output'];
  variantType?: Maybe<Scalars['String']['output']>;
  vignetteId: Scalars['ID']['output'];
  vignetteTitle: Scalars['String']['output'];
};

export type OrderInvarianceRow = {
  __typename?: 'OrderInvarianceRow';
  conditionKey: Scalars['String']['output'];
  isMatch?: Maybe<Scalars['Boolean']['output']>;
  majorityVoteBaseline?: Maybe<Scalars['Int']['output']>;
  majorityVoteFlipped?: Maybe<Scalars['Int']['output']>;
  mismatchType?: Maybe<Scalars['String']['output']>;
  modelId: Scalars['String']['output'];
  modelLabel: Scalars['String']['output'];
  ordinalDistance?: Maybe<Scalars['Int']['output']>;
  rawScore?: Maybe<Scalars['Int']['output']>;
  variantType?: Maybe<Scalars['String']['output']>;
  vignetteId: Scalars['ID']['output'];
  vignetteTitle: Scalars['String']['output'];
};

export type OrderInvarianceSummary = {
  __typename?: 'OrderInvarianceSummary';
  comparablePairs: Scalars['Int']['output'];
  exactMatchRate?: Maybe<Scalars['Float']['output']>;
  excludedPairs: Array<OrderInvarianceExclusionCount>;
  matchComparablePairs: Scalars['Int']['output'];
  matchRate?: Maybe<Scalars['Float']['output']>;
  missingPairs: Scalars['Int']['output'];
  presentationComparablePairs: Scalars['Int']['output'];
  presentationEffectMAD?: Maybe<Scalars['Float']['output']>;
  presentationMissingPairs: Scalars['Int']['output'];
  qualifyingPairs: Scalars['Int']['output'];
  scaleComparablePairs: Scalars['Int']['output'];
  scaleEffectMAD?: Maybe<Scalars['Float']['output']>;
  scaleMissingPairs: Scalars['Int']['output'];
  sensitiveModelCount: Scalars['Int']['output'];
  sensitiveVignetteCount: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  totalCandidatePairs: Scalars['Int']['output'];
};

export type OrderInvarianceTranscript = {
  __typename?: 'OrderInvarianceTranscript';
  attributeALevel?: Maybe<Scalars['Int']['output']>;
  attributeBLevel?: Maybe<Scalars['Int']['output']>;
  content?: Maybe<Scalars['JSON']['output']>;
  createdAt: Scalars['DateTime']['output'];
  decisionCode?: Maybe<Scalars['String']['output']>;
  decisionCodeSource?: Maybe<Scalars['String']['output']>;
  durationMs: Scalars['Int']['output'];
  estimatedCost?: Maybe<Scalars['Float']['output']>;
  id: Scalars['ID']['output'];
  lastAccessedAt?: Maybe<Scalars['DateTime']['output']>;
  modelId: Scalars['String']['output'];
  modelVersion?: Maybe<Scalars['String']['output']>;
  orderLabel: Scalars['String']['output'];
  runId: Scalars['ID']['output'];
  scenarioId: Scalars['ID']['output'];
  tokenCount: Scalars['Int']['output'];
  turnCount: Scalars['Int']['output'];
};

export type OrderInvarianceTranscriptResult = {
  __typename?: 'OrderInvarianceTranscriptResult';
  attributeALabel?: Maybe<Scalars['String']['output']>;
  attributeBLabel?: Maybe<Scalars['String']['output']>;
  conditionKey: Scalars['String']['output'];
  generatedAt: Scalars['DateTime']['output'];
  modelId: Scalars['String']['output'];
  modelLabel: Scalars['String']['output'];
  transcripts: Array<OrderInvarianceTranscript>;
  vignetteId: Scalars['ID']['output'];
  vignetteTitle: Scalars['String']['output'];
};

export type PairLevelMarginSummary = {
  __typename?: 'PairLevelMarginSummary';
  mean?: Maybe<Scalars['Float']['output']>;
  median?: Maybe<Scalars['Float']['output']>;
  p25?: Maybe<Scalars['Float']['output']>;
  p75?: Maybe<Scalars['Float']['output']>;
};

/** A reusable preamble that can be prepended to scenarios */
export type Preamble = {
  __typename?: 'Preamble';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** The most recently created version */
  latestVersion?: Maybe<PreambleVersion>;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  /** History of all versions for this preamble */
  versions: Array<PreambleVersion>;
};

/** A versioned snapshot of a preamble */
export type PreambleVersion = {
  __typename?: 'PreambleVersion';
  content: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** The parent preamble definition */
  preamble?: Maybe<Preamble>;
  preambleId: Scalars['String']['output'];
  version: Scalars['String']['output'];
};

/** Explicit preference summary for vignette analysis semantics */
export type PreferenceSummary = {
  __typename?: 'PreferenceSummary';
  /** Per-model preference direction and strength summary */
  perModel: Scalars['JSON']['output'];
};

/** Result of a probe job execution */
export type ProbeResult = {
  __typename?: 'ProbeResult';
  completedAt?: Maybe<Scalars['DateTime']['output']>;
  createdAt: Scalars['DateTime']['output'];
  /** Probe execution duration in milliseconds */
  durationMs?: Maybe<Scalars['Int']['output']>;
  /** Error code if failed (e.g., NOT_FOUND, RATE_LIMIT, MAX_RETRIES_EXCEEDED) */
  errorCode?: Maybe<Scalars['String']['output']>;
  /** Detailed error message if failed */
  errorMessage?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  /** Input tokens consumed (for cost tracking) */
  inputTokens?: Maybe<Scalars['Int']['output']>;
  modelId: Scalars['String']['output'];
  /** Output tokens generated (for cost tracking) */
  outputTokens?: Maybe<Scalars['Int']['output']>;
  /** Number of retries attempted before final result */
  retryCount: Scalars['Int']['output'];
  runId: Scalars['String']['output'];
  /** Index within sample set for multi-sample runs (0 to N-1). Always 0 for single-sample runs. */
  sampleIndex: Scalars['Int']['output'];
  scenarioId: Scalars['String']['output'];
  /** SUCCESS or FAILED */
  status: Scalars['String']['output'];
  /** ID of the created transcript (if successful) */
  transcriptId?: Maybe<Scalars['String']['output']>;
};

/** Summary of probe results for a single model */
export type ProbeResultModelSummary = {
  __typename?: 'ProbeResultModelSummary';
  /** Unique error codes encountered */
  errorCodes: Array<Scalars['String']['output']>;
  /** Number of failed probes */
  failed: Scalars['Int']['output'];
  modelId: Scalars['String']['output'];
  /** Number of successful probes */
  success: Scalars['Int']['output'];
};

/** A record of a manual balance sync for a provider */
export type ProviderBalanceSyncLog = {
  __typename?: 'ProviderBalanceSyncLog';
  createdByUserId?: Maybe<Scalars['String']['output']>;
  /** Difference: enteredBalance - systemBalanceAtSync */
  delta: Scalars['Float']['output'];
  /** Real balance entered by the user */
  enteredBalance: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  providerId: Scalars['String']['output'];
  syncedAt: Scalars['DateTime']['output'];
  /** System-tracked balance at the time of sync */
  systemBalanceAtSync: Scalars['Float']['output'];
};

/** Execution metrics for a specific LLM provider */
export type ProviderExecutionMetrics = {
  __typename?: 'ProviderExecutionMetrics';
  /** Number of jobs currently being processed */
  activeJobs: Scalars['Int']['output'];
  /** List of currently active model IDs for this provider */
  activeModelIds: Array<Scalars['String']['output']>;
  /** Maximum concurrent requests allowed for this provider */
  maxParallel: Scalars['Int']['output'];
  /** Provider name (e.g., "anthropic", "openai") */
  provider: Scalars['String']['output'];
  /** Number of jobs waiting in the rate limiter queue */
  queuedJobs: Scalars['Int']['output'];
  /** Recent job completions (last 10) */
  recentCompletions: Array<CompletionEvent>;
  /** Rate limit (requests per minute) for this provider */
  requestsPerMinute: Scalars['Int']['output'];
};

/** Health status for all LLM providers */
export type ProviderHealth = {
  __typename?: 'ProviderHealth';
  /** When the health check was performed */
  checkedAt: Scalars['DateTime']['output'];
  /** Health status for each provider */
  providers: Array<ProviderHealthStatus>;
};

/** Health status for an LLM provider */
export type ProviderHealthStatus = {
  __typename?: 'ProviderHealthStatus';
  /** Whether the API key is configured */
  configured: Scalars['Boolean']['output'];
  /** Whether the API is reachable (health check passed) */
  connected: Scalars['Boolean']['output'];
  /** Error message if health check failed */
  error?: Maybe<Scalars['String']['output']>;
  /** Provider identifier (e.g., "openai") */
  id: Scalars['String']['output'];
  /** When this provider was last checked */
  lastChecked?: Maybe<Scalars['DateTime']['output']>;
  /** Provider display name (e.g., "OpenAI") */
  name: Scalars['String']['output'];
  /** Remaining budget in USD when available. For providers with spend-only APIs, this requires a configured monthly cap. */
  remainingBudgetUsd?: Maybe<Scalars['Float']['output']>;
};

export type Query = {
  __typename?: 'Query';
  /** Get the average token statistics across all models. Used as fallback when model-specific stats are unavailable. */
  allModelTokenAverage?: Maybe<ModelTokenStats>;
  /** Fetch the latest analysis result for multiple runs. Useful for aggregation. */
  analyses: Array<AnalysisResult>;
  /** Fetch the current analysis result for a run. Returns null if not yet computed. */
  analysis?: Maybe<AnalysisResult>;
  /** Get authoritative analysis folder counts for tag-based folder view. */
  analysisFolderCounts: AnalysisFolderCounts;
  /** Fetch all analysis versions for a run, including superseded versions. */
  analysisHistory: Array<AnalysisResult>;
  /** Get the count of analysis versions for a run. Useful for pagination. */
  analysisHistoryCount: Scalars['Int']['output'];
  /**
   *
   *       List all API keys for the current user.
   *       Requires authentication.
   *
   *       Note: Only key prefix is returned, not the full key value.
   *
   */
  apiKeys: Array<ApiKey>;
  assumptionsOrderInvariance: OrderInvarianceResult;
  assumptionsOrderInvarianceLaunchStatus: OrderInvarianceLaunchStatus;
  assumptionsOrderInvarianceReview: OrderInvarianceReviewResult;
  assumptionsOrderInvarianceTranscripts: OrderInvarianceTranscriptResult;
  assumptionsTempZero: AssumptionsTempZeroResult;
  /**
   *
   *       Query audit logs with optional filters and pagination.
   *
   *       Returns a paginated connection with audit log entries.
   *       Use the 'after' cursor for pagination through large result sets.
   *
   */
  auditLogs: AuditLogConnection;
  /**
   *
   *       List available LLM models for evaluation runs.
   *
   *       Returns all supported models with their availability status.
   *       A model is available if the corresponding provider API key is configured.
   *
   *       Use these model IDs when starting a run with the startRun mutation.
   *
   */
  availableModels: Array<AvailableModel>;
  debugAssumptionsMismatches: DebugMismatchResult;
  /** Fetch a single definition by ID. Returns null if not found. */
  definition?: Maybe<Definition>;
  /** Get ancestors of a definition (full chain to root). Returns definitions ordered from root to immediate parent. */
  definitionAncestors: Array<Definition>;
  /** Get the count of definitions matching the specified filters. Useful for pagination. */
  definitionCount: Scalars['Int']['output'];
  /** Get descendants of a definition (full subtree). Returns definitions ordered by creation date (newest first). */
  definitionDescendants: Array<Definition>;
  /** List definitions with enhanced filtering, search, and pagination. */
  definitions: Array<Definition>;
  domain?: Maybe<Domain>;
  domainAnalysis: DomainAnalysisResult;
  domainAnalysisConditionTranscripts: Array<DomainAnalysisConditionTranscript>;
  domainAnalysisValueDetail: DomainAnalysisValueDetailResult;
  domainAvailableSignatures: Array<DomainAvailableSignature>;
  domainConfigSnapshots: Array<DomainConfigSnapshotSummary>;
  domainContext?: Maybe<DomainContext>;
  domainContexts: Array<DomainContext>;
  domainEvaluation?: Maybe<DomainEvaluation>;
  domainEvaluationMembers: Array<DomainEvaluationMember>;
  domainEvaluationStatus?: Maybe<DomainEvaluationStatus>;
  domainEvaluations: Array<DomainEvaluation>;
  domainFindingsEligibility: DomainFindingsEligibility;
  domainRunSummary: DomainRunSummary;
  domainSettings?: Maybe<DomainSettings>;
  domainTrialRunsStatus: Array<DomainTrialRunStatus>;
  domainTrialsPlan: DomainTrialPlanResult;
  /**
   *
   *       Returns a Schwartz value-pair coverage matrix for a domain.
   *
   *       Each cell shows how many completed trial batches (runs) exist for the vignette
   *       that tests that pair of values in conflict. Optionally filtered to count only
   *       runs that included the specified model IDs.
   *
   *       The matrix is symmetric: each unique value pair appears once, with the cell key
   *       sorted alphabetically (valueA < valueB). Diagonal cells are omitted.
   *
   */
  domainValueCoverage?: Maybe<DomainValueCoverageResult>;
  domains: Array<Domain>;
  /**
   *
   *       Get the complete audit history for a specific entity.
   *
   *       Returns all audit log entries for the given entity type and ID,
   *       ordered by creation time (newest first).
   *
   */
  entityAuditHistory: Array<AuditLog>;
  /** Estimate cost for a potential run before starting it. Returns per-model breakdown with token predictions based on historical data. */
  estimateCost: CostEstimate;
  estimateDomainEvaluationCost: DomainEvaluationCostEstimate;
  finalTrialPlan: FinalTrialPlan;
  /** Get the configured infrastructure model for a specific purpose (e.g., "scenario_expansion") */
  infraModel?: Maybe<LlmModel>;
  /** Get a specific level preset by ID */
  levelPreset?: Maybe<LevelPreset>;
  /** List all level presets */
  levelPresets: Array<LevelPreset>;
  /** Get a specific LLM model by ID */
  llmModel?: Maybe<LlmModel>;
  /** Get a model by provider name and model ID (e.g., "openai" and "gpt-4o-mini") */
  llmModelByIdentifier?: Maybe<LlmModel>;
  /** List all LLM models, optionally filtered by provider or status */
  llmModels: Array<LlmModel>;
  /** Get a specific LLM provider by ID */
  llmProvider?: Maybe<LlmProvider>;
  /** List all LLM providers with their models and availability status */
  llmProviders: Array<LlmProvider>;
  /**
   *
   *       Get the currently authenticated user.
   *       Returns null if not authenticated.
   *
   */
  me?: Maybe<User>;
  /** Get token statistics for specific models. Useful for understanding prediction quality. */
  modelTokenStats: Array<ModelTokenStats>;
  /** Get a specific preamble by ID */
  preamble?: Maybe<Preamble>;
  /** List all preambles */
  preambles: Array<Preamble>;
  /**
   *
   *       Get health status for all LLM providers.
   *
   *       Checks connectivity to each provider's API.
   *       Results are cached for 5 minutes.
   *
   *       Use the `refresh` argument to force a fresh check.
   *
   */
  providerHealth: ProviderHealth;
  /**
   *
   *       Get health status for the job queue.
   *
   *       Shows queue running state, job counts, and success rates.
   *
   */
  queueHealth: QueueHealth;
  /**
   *
   *       Get current queue status including job counts by type and state.
   *
   *       Requires authentication.
   *
   *       Returns isRunning, isPaused flags, job counts per type,
   *       and aggregate totals across all types.
   *
   */
  queueStatus: QueueStatus;
  /** Fetch a single run by ID. Returns null if not found or deleted. */
  run?: Maybe<Run>;
  /** Condition grid (attribute A x attribute B) with scenario IDs and existing trial counts. */
  runConditionGrid?: Maybe<RunConditionGrid>;
  /** Get the count of runs matching the specified filters. Useful for pagination. */
  runCount: Scalars['Int']['output'];
  /** List runs with optional filtering and pagination. */
  runs: Array<Run>;
  /** Fetch multiple runs by IDs for cross-run comparison. Limited to 10 runs maximum. Returns runs with their analysis data. */
  runsWithAnalysis: Array<Run>;
  /** Fetch a single scenario by ID with full content. */
  scenario?: Maybe<Scenario>;
  /** Get the count of scenarios for a definition. */
  scenarioCount: Scalars['Int']['output'];
  /**
   *
   *       List scenarios for a definition with full content.
   *
   *       Returns scenarios with their complete content including preamble, prompt,
   *       followups, and dimension values. Use this to verify scenario generation
   *       and inspect what will be sent to models during evaluation.
   *
   */
  scenarios: Array<Scenario>;
  /** Fetch a survey by experiment ID. */
  survey?: Maybe<Experiment>;
  /** List surveys (stored as experiments with analysisPlan.kind="survey"). */
  surveys: Array<Experiment>;
  /**
   *
   *       Get combined health status for all system components.
   *
   *       Includes provider health, queue health, and worker health.
   *       Results are cached (providers: 5 min, workers: 10 min).
   *
   *       Use the `refresh` argument to force fresh checks.
   *
   */
  systemHealth: SystemHealth;
  /** Get a specific system setting by key */
  systemSetting?: Maybe<SystemSetting>;
  /** List all system settings */
  systemSettings: Array<SystemSetting>;
  /** Get a single tag by ID. */
  tag?: Maybe<Tag>;
  /** Get the count of tags matching the specified filters. Useful for pagination. */
  tagCount: Scalars['Int']['output'];
  /** List all tags, optionally filtered by name search. */
  tags: Array<Tag>;
  tempZeroVerificationReport?: Maybe<TempZeroVerificationReport>;
  valueStatement?: Maybe<ValueStatement>;
  valueStatements: Array<ValueStatement>;
  /**
   *
   *       Get health status for Python workers.
   *
   *       Checks Python environment, packages, and API key configuration.
   *       Results are cached for 10 minutes.
   *
   *       Use the `refresh` argument to force a fresh check.
   *
   */
  workerHealth: WorkerHealth;
};


export type QueryAnalysesArgs = {
  runIds: Array<Scalars['ID']['input']>;
};


export type QueryAnalysisArgs = {
  runId: Scalars['ID']['input'];
};


export type QueryAnalysisFolderCountsArgs = {
  analysisStatus?: InputMaybe<Scalars['String']['input']>;
  definitionId?: InputMaybe<Scalars['String']['input']>;
  definitionTagIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  experimentId?: InputMaybe<Scalars['String']['input']>;
  runCategory?: InputMaybe<Scalars['String']['input']>;
  runType?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryAnalysisHistoryArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  runId: Scalars['ID']['input'];
};


export type QueryAnalysisHistoryCountArgs = {
  runId: Scalars['ID']['input'];
};


export type QueryApiKeysArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryAssumptionsOrderInvarianceArgs = {
  directionOnly?: InputMaybe<Scalars['Boolean']['input']>;
  trimOutliers?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryAssumptionsOrderInvarianceLaunchStatusArgs = {
  runIds: Array<Scalars['ID']['input']>;
};


export type QueryAssumptionsOrderInvarianceTranscriptsArgs = {
  conditionKey: Scalars['String']['input'];
  modelId: Scalars['String']['input'];
  vignetteId: Scalars['ID']['input'];
};


export type QueryAssumptionsTempZeroArgs = {
  directionOnly?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryAuditLogsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<AuditLogFilterInput>;
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryAvailableModelsArgs = {
  availableOnly?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryDebugAssumptionsMismatchesArgs = {
  modelId: Scalars['String']['input'];
  scenarioId: Scalars['String']['input'];
};


export type QueryDefinitionArgs = {
  id: Scalars['ID']['input'];
  includeDeleted?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryDefinitionAncestorsArgs = {
  id: Scalars['ID']['input'];
  maxDepth?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryDefinitionCountArgs = {
  domainId?: InputMaybe<Scalars['ID']['input']>;
  hasRuns?: InputMaybe<Scalars['Boolean']['input']>;
  rootOnly?: InputMaybe<Scalars['Boolean']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  tagIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  withoutDomain?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryDefinitionDescendantsArgs = {
  id: Scalars['ID']['input'];
  maxDepth?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryDefinitionsArgs = {
  domainId?: InputMaybe<Scalars['ID']['input']>;
  hasRuns?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  rootOnly?: InputMaybe<Scalars['Boolean']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  tagIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  withoutDomain?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryDomainArgs = {
  id: Scalars['ID']['input'];
};


export type QueryDomainAnalysisArgs = {
  domainId: Scalars['ID']['input'];
  scoreMethod?: InputMaybe<Scalars['String']['input']>;
  signature?: InputMaybe<Scalars['String']['input']>;
};


export type QueryDomainAnalysisConditionTranscriptsArgs = {
  definitionId: Scalars['ID']['input'];
  domainId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  modelId: Scalars['String']['input'];
  scenarioId?: InputMaybe<Scalars['ID']['input']>;
  signature?: InputMaybe<Scalars['String']['input']>;
  valueKey: Scalars['String']['input'];
};


export type QueryDomainAnalysisValueDetailArgs = {
  domainId: Scalars['ID']['input'];
  modelId: Scalars['String']['input'];
  scoreMethod?: InputMaybe<Scalars['String']['input']>;
  signature?: InputMaybe<Scalars['String']['input']>;
  valueKey: Scalars['String']['input'];
};


export type QueryDomainAvailableSignaturesArgs = {
  domainId: Scalars['ID']['input'];
};


export type QueryDomainConfigSnapshotsArgs = {
  domainId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryDomainContextArgs = {
  id: Scalars['ID']['input'];
};


export type QueryDomainContextsArgs = {
  domainId?: InputMaybe<Scalars['String']['input']>;
};


export type QueryDomainEvaluationArgs = {
  id: Scalars['ID']['input'];
};


export type QueryDomainEvaluationMembersArgs = {
  id: Scalars['ID']['input'];
};


export type QueryDomainEvaluationStatusArgs = {
  id: Scalars['ID']['input'];
};


export type QueryDomainEvaluationsArgs = {
  domainId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  scopeCategory?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryDomainFindingsEligibilityArgs = {
  domainId: Scalars['ID']['input'];
};


export type QueryDomainRunSummaryArgs = {
  domainId: Scalars['ID']['input'];
  scopeCategory?: InputMaybe<Scalars['String']['input']>;
};


export type QueryDomainSettingsArgs = {
  domainId: Scalars['ID']['input'];
};


export type QueryDomainTrialRunsStatusArgs = {
  runIds: Array<Scalars['ID']['input']>;
};


export type QueryDomainTrialsPlanArgs = {
  definitionIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  domainId: Scalars['ID']['input'];
  scopeCategory?: InputMaybe<Scalars['String']['input']>;
  temperature?: InputMaybe<Scalars['Float']['input']>;
};


export type QueryDomainValueCoverageArgs = {
  domainId: Scalars['ID']['input'];
  modelIds?: InputMaybe<Array<Scalars['String']['input']>>;
  signature?: InputMaybe<Scalars['String']['input']>;
};


export type QueryDomainsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};


export type QueryEntityAuditHistoryArgs = {
  entityId: Scalars['String']['input'];
  entityType: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryEstimateCostArgs = {
  definitionId: Scalars['ID']['input'];
  models: Array<Scalars['String']['input']>;
  samplePercentage?: InputMaybe<Scalars['Int']['input']>;
  samplesPerScenario?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryEstimateDomainEvaluationCostArgs = {
  definitionIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  domainId: Scalars['ID']['input'];
  modelIds?: InputMaybe<Array<Scalars['String']['input']>>;
  samplePercentage?: InputMaybe<Scalars['Int']['input']>;
  samplesPerScenario?: InputMaybe<Scalars['Int']['input']>;
  scopeCategory?: InputMaybe<Scalars['String']['input']>;
  temperature?: InputMaybe<Scalars['Float']['input']>;
};


export type QueryFinalTrialPlanArgs = {
  definitionId: Scalars['String']['input'];
  models: Array<Scalars['String']['input']>;
};


export type QueryInfraModelArgs = {
  purpose: Scalars['String']['input'];
};


export type QueryLevelPresetArgs = {
  id: Scalars['ID']['input'];
};


export type QueryLlmModelArgs = {
  id: Scalars['String']['input'];
};


export type QueryLlmModelByIdentifierArgs = {
  modelId: Scalars['String']['input'];
  providerName: Scalars['String']['input'];
};


export type QueryLlmModelsArgs = {
  availableOnly?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  providerId?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryLlmProviderArgs = {
  id: Scalars['String']['input'];
};


export type QueryLlmProvidersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryModelTokenStatsArgs = {
  modelIds?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type QueryPreambleArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProviderHealthArgs = {
  refresh?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryRunArgs = {
  id: Scalars['ID']['input'];
  includeDeleted?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryRunConditionGridArgs = {
  definitionId: Scalars['ID']['input'];
};


export type QueryRunCountArgs = {
  analysisStatus?: InputMaybe<Scalars['String']['input']>;
  definitionId?: InputMaybe<Scalars['String']['input']>;
  definitionTagIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  experimentId?: InputMaybe<Scalars['String']['input']>;
  hasAnalysis?: InputMaybe<Scalars['Boolean']['input']>;
  runCategory?: InputMaybe<Scalars['String']['input']>;
  runType?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryRunsArgs = {
  analysisStatus?: InputMaybe<Scalars['String']['input']>;
  definitionId?: InputMaybe<Scalars['String']['input']>;
  definitionTagIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  experimentId?: InputMaybe<Scalars['String']['input']>;
  hasAnalysis?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  runCategory?: InputMaybe<Scalars['String']['input']>;
  runType?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryRunsWithAnalysisArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type QueryScenarioArgs = {
  id: Scalars['ID']['input'];
};


export type QueryScenarioCountArgs = {
  definitionId: Scalars['ID']['input'];
};


export type QueryScenariosArgs = {
  definitionId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QuerySurveyArgs = {
  id: Scalars['ID']['input'];
};


export type QuerySurveysArgs = {
  search?: InputMaybe<Scalars['String']['input']>;
};


export type QuerySystemHealthArgs = {
  refresh?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QuerySystemSettingArgs = {
  key: Scalars['String']['input'];
};


export type QuerySystemSettingsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryTagArgs = {
  id: Scalars['ID']['input'];
};


export type QueryTagCountArgs = {
  search?: InputMaybe<Scalars['String']['input']>;
};


export type QueryTagsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};


export type QueryValueStatementArgs = {
  id: Scalars['ID']['input'];
};


export type QueryValueStatementsArgs = {
  domainId: Scalars['ID']['input'];
};


export type QueryWorkerHealthArgs = {
  refresh?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Health status for the job queue */
export type QueueHealth = {
  __typename?: 'QueueHealth';
  /** Number of currently processing jobs */
  activeJobs: Scalars['Int']['output'];
  /** When the health check was performed */
  checkedAt: Scalars['DateTime']['output'];
  /** Jobs completed in the last 24 hours */
  completedLast24h: Scalars['Int']['output'];
  /** Error message if queue health check failed */
  error?: Maybe<Scalars['String']['output']>;
  /** Jobs failed in the last 24 hours */
  failedLast24h: Scalars['Int']['output'];
  /** Whether the queue is healthy */
  isHealthy: Scalars['Boolean']['output'];
  /** Whether the queue is paused */
  isPaused: Scalars['Boolean']['output'];
  /** Whether queue workers are running */
  isRunning: Scalars['Boolean']['output'];
  /** Job counts by type */
  jobTypes?: Maybe<Array<JobTypeStatus>>;
  /** Number of jobs waiting to be processed */
  pendingJobs: Scalars['Int']['output'];
  /** Success rate (completed / total processed), null if no jobs */
  successRate?: Maybe<Scalars['Float']['output']>;
};

/** Overall queue status and statistics */
export type QueueStatus = {
  __typename?: 'QueueStatus';
  /** Whether the queue is currently paused */
  isPaused: Scalars['Boolean']['output'];
  /** Whether the queue workers are running */
  isRunning: Scalars['Boolean']['output'];
  /** Job counts by type */
  jobTypes: Array<JobTypeStatus>;
  /** Aggregate counts across all job types */
  totals: QueueTotals;
};

/** Aggregate job counts across all types */
export type QueueTotals = {
  __typename?: 'QueueTotals';
  /** Total active jobs across all types */
  active: Scalars['Int']['output'];
  /** Total completed jobs (last 24h) */
  completed: Scalars['Int']['output'];
  /** Total failed jobs */
  failed: Scalars['Int']['output'];
  /** Total pending jobs across all types */
  pending: Scalars['Int']['output'];
};

export type RankingShape = {
  __typename?: 'RankingShape';
  bottomGap: Scalars['Float']['output'];
  bottomStructure: Scalars['String']['output'];
  dominanceZScore?: Maybe<Scalars['Float']['output']>;
  spread: Scalars['Float']['output'];
  steepness: Scalars['Float']['output'];
  topGap: Scalars['Float']['output'];
  topStructure: Scalars['String']['output'];
};

export type RankingShapeBenchmarks = {
  __typename?: 'RankingShapeBenchmarks';
  domainMeanTopGap: Scalars['Float']['output'];
  domainStdTopGap?: Maybe<Scalars['Float']['output']>;
  medianSpread: Scalars['Float']['output'];
};

/** Result of recovering an orphaned run */
export type RecoverRunPayload = {
  __typename?: 'RecoverRunPayload';
  /** The recovery action taken (requeued_probes, triggered_summarization, no_missing_probes, etc.) */
  action: Scalars['String']['output'];
  /** Number of jobs re-queued (if applicable) */
  requeuedCount?: Maybe<Scalars['Int']['output']>;
  /** The recovered run */
  run: Run;
};

/** Result of triggering scenario regeneration */
export type RegenerateScenariosResult = {
  __typename?: 'RegenerateScenariosResult';
  /** ID of the definition being regenerated */
  definitionId: Scalars['String']['output'];
  /** ID of the queued expansion job (null if not queued) */
  jobId?: Maybe<Scalars['String']['output']>;
  /** Whether a new expansion job was queued */
  queued: Scalars['Boolean']['output'];
};

/** Explicit baseline reliability summary for vignette analysis semantics */
export type ReliabilitySummary = {
  __typename?: 'ReliabilitySummary';
  /** Per-model baseline noise and reliability summary */
  perModel: Scalars['JSON']['output'];
};

/** Result of restarting summarization for a run */
export type RestartSummarizationPayload = {
  __typename?: 'RestartSummarizationPayload';
  /** Number of summarization jobs queued */
  queuedCount: Scalars['Int']['output'];
  /** The updated run */
  run: Run;
};

export type RetryDomainTrialCellResult = {
  __typename?: 'RetryDomainTrialCellResult';
  definitionId: Scalars['ID']['output'];
  message?: Maybe<Scalars['String']['output']>;
  modelId: Scalars['String']['output'];
  runId?: Maybe<Scalars['ID']['output']>;
  success: Scalars['Boolean']['output'];
};

export type ReviewOrderInvariancePairPayload = {
  __typename?: 'ReviewOrderInvariancePairPayload';
  pairId: Scalars['ID']['output'];
  reviewStatus: Scalars['String']['output'];
  reviewedAt: Scalars['DateTime']['output'];
};

/** A saved record of a model evaluation or launch */
export type Run = {
  __typename?: 'Run';
  /** Most recent analysis result for this run */
  analysis?: Maybe<AnalysisResult>;
  /** Analysis status: pending, computing, completed, or failed */
  analysisStatus?: Maybe<Scalars['String']['output']>;
  /** Number of batches represented by this saved record */
  batchCount: Scalars['Int']['output'];
  /** Direct companion run ID for paired launches */
  companionRunId?: Maybe<Scalars['String']['output']>;
  completedAt?: Maybe<Scalars['DateTime']['output']>;
  config: Scalars['JSON']['output'];
  createdAt: Scalars['DateTime']['output'];
  /** User who started this run */
  createdBy?: Maybe<User>;
  definition?: Maybe<Definition>;
  definitionId: Scalars['String']['output'];
  /** Snapshot of the definition version used for this run */
  definitionSnapshot?: Maybe<Scalars['JSON']['output']>;
  /** The version of the definition used in this run (from snapshot) */
  definitionVersion?: Maybe<Scalars['Int']['output']>;
  /** User who deleted this run (only populated for soft-deleted records) */
  deletedBy?: Maybe<User>;
  /** Estimated cost calculated when run was created. Stored in run config for historical reference. */
  estimatedCosts?: Maybe<CostEstimate>;
  /** Real-time execution metrics for monitoring parallel processing (only available during RUNNING state) */
  executionMetrics?: Maybe<ExecutionMetrics>;
  experiment?: Maybe<Experiment>;
  experimentId?: Maybe<Scalars['String']['output']>;
  /** Failed probe results with error details */
  failedProbes: Array<ProbeResult>;
  id: Scalars['ID']['output'];
  lastAccessedAt?: Maybe<Scalars['DateTime']['output']>;
  /** List of LLM models used in this run */
  models: Array<LlmModel>;
  /** Optional user-defined name for this run */
  name?: Maybe<Scalars['String']['output']>;
  /** Shared identifier for the paired batch that this run belongs to */
  pairedBatchGroupId?: Maybe<Scalars['String']['output']>;
  /** Probe results with detailed success/failure information */
  probeResults: Array<ProbeResult>;
  /** Summary of probe results grouped by model, with error codes */
  probeResultsByModel: Array<ProbeResultModelSummary>;
  progress?: Maybe<Scalars['JSON']['output']>;
  /** Recent completed or failed tasks for this run */
  recentTasks: Array<TaskResult>;
  /** Workflow category assigned to the run */
  runCategory: Scalars['String']['output'];
  /** Structured progress information with percentComplete */
  runProgress?: Maybe<RunProgress>;
  /** Number of samples per scenario-model pair for multi-sample runs. Default is 1 for single-sample runs. */
  samplesPerScenario: Scalars['Int']['output'];
  /** IDs of scenarios selected for this run */
  selectedScenarios: Array<Scalars['String']['output']>;
  /** Model IDs currently detected as stalled (no successful probe completion for 3+ minutes while jobs are pending) */
  stalledModels: Array<Scalars['String']['output']>;
  startedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Current status of the run (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED) */
  status: Scalars['String']['output'];
  /** Progress information for transcript summarization (only populated in SUMMARIZING state) */
  summarizeProgress?: Maybe<RunProgress>;
  /** Tags associated with this run */
  tags: Array<Tag>;
  transcriptCount: Scalars['Int']['output'];
  transcripts: Array<Transcript>;
  updatedAt: Scalars['DateTime']['output'];
};


/** A saved record of a model evaluation or launch */
export type RunProbeResultsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  modelId?: InputMaybe<Scalars['String']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


/** A saved record of a model evaluation or launch */
export type RunRecentTasksArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
};


/** A saved record of a model evaluation or launch */
export type RunTranscriptsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  modelId?: InputMaybe<Scalars['String']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};

export type RunConditionGrid = {
  __typename?: 'RunConditionGrid';
  attributeA: Scalars['String']['output'];
  attributeB: Scalars['String']['output'];
  cells: Array<RunConditionGridCell>;
  colLevels: Array<Scalars['String']['output']>;
  rowLevels: Array<Scalars['String']['output']>;
};

export type RunConditionGridCell = {
  __typename?: 'RunConditionGridCell';
  colLevel: Scalars['String']['output'];
  rowLevel: Scalars['String']['output'];
  scenarioCount: Scalars['Int']['output'];
  scenarioIds: Array<Scalars['String']['output']>;
  trialCount: Scalars['Int']['output'];
};

/** Priority level for run execution (affects job queue ordering) */
export enum RunPriority {
  High = 'HIGH',
  Low = 'LOW',
  Normal = 'NORMAL'
}

/** Progress information for a run */
export type RunProgress = {
  __typename?: 'RunProgress';
  /** Progress breakdown by model */
  byModel?: Maybe<Array<ByModelProgress>>;
  /** Number of successfully completed tasks */
  completed: Scalars['Int']['output'];
  /** Number of failed tasks */
  failed: Scalars['Int']['output'];
  /** Completion percentage (0-100) */
  percentComplete: Scalars['Float']['output'];
  /** Total number of tasks in the run */
  total: Scalars['Int']['output'];
};

/** Status of a run execution */
export enum RunStatus {
  Cancelled = 'CANCELLED',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
  Pending = 'PENDING',
  Running = 'RUNNING'
}

/** A generated scenario from a definition */
export type Scenario = {
  __typename?: 'Scenario';
  content: Scalars['JSON']['output'];
  createdAt: Scalars['DateTime']['output'];
  definition: Definition;
  definitionId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
};

/** Result of setting a default model */
export type SetDefaultModelResult = {
  __typename?: 'SetDefaultModelResult';
  /** The new default model */
  model: LlmModel;
  /** Always null when multiple defaults are allowed */
  previousDefault?: Maybe<LlmModel>;
};

/** Input for starting a new evaluation run */
export type StartRunInput = {
  /** ID of the definition to run */
  definitionId: Scalars['ID']['input'];
  /** Optional experiment to associate this run with */
  experimentId?: InputMaybe<Scalars['ID']['input']>;
  /** If true, runs an adaptive sampling strategy to reach 10 samples per condition */
  finalTrial?: InputMaybe<Scalars['Boolean']['input']>;
  /** Launch mode hint: STANDARD, PAIRED_BATCH, or AD_HOC_BATCH */
  launchMode?: InputMaybe<Scalars['String']['input']>;
  /** List of model IDs to evaluate (e.g., ["gpt-4", "claude-3"]) */
  models: Array<Scalars['String']['input']>;
  /** Priority level: LOW, NORMAL (default), HIGH */
  priority?: InputMaybe<Scalars['String']['input']>;
  /** Optional workflow category: PILOT, PRODUCTION, REPLICATION, VALIDATION, or UNKNOWN_LEGACY */
  runCategory?: InputMaybe<Scalars['String']['input']>;
  /** Percentage of scenarios to sample (1-100, default 100) */
  samplePercentage?: InputMaybe<Scalars['Int']['input']>;
  /** Seed for deterministic sampling (optional) */
  sampleSeed?: InputMaybe<Scalars['Int']['input']>;
  /** Number of samples per scenario-model pair for multi-sample runs (1-100, default 1). Higher values measure response variance. */
  samplesPerScenario?: InputMaybe<Scalars['Int']['input']>;
  /** Optional explicit scenario IDs to run instead of percentage sampling */
  scenarioIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  /** Optional sampling temperature (0-2). If omitted, provider default is used. */
  temperature?: InputMaybe<Scalars['Float']['input']>;
};

/** Result of starting a new run */
export type StartRunPayload = {
  __typename?: 'StartRunPayload';
  /** Number of jobs queued for this run */
  jobCount: Scalars['Int']['output'];
  /** Companion run IDs created for paired Job Choice batch launches */
  pairedRunIds?: Maybe<Array<Scalars['String']['output']>>;
  /** The created run */
  run: Run;
};

export type SurveyQuestionInput = {
  text: Scalars['String']['input'];
};

export type SurveyResponseOptionInput = {
  label: Scalars['String']['input'];
};

/** Combined system health status */
export type SystemHealth = {
  __typename?: 'SystemHealth';
  /** LLM provider health */
  providers: ProviderHealth;
  /** Job queue health */
  queue: QueueHealth;
  /** Python worker health */
  worker: WorkerHealth;
};

/** A system-wide configuration setting */
export type SystemSetting = {
  __typename?: 'SystemSetting';
  id: Scalars['ID']['output'];
  /** Setting key (unique identifier) */
  key: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  /** Setting value (JSON) */
  value: Scalars['JSON']['output'];
};

/** A tag for organizing and categorizing definitions */
export type Tag = {
  __typename?: 'Tag';
  /** When this tag was created */
  createdAt: Scalars['DateTime']['output'];
  /** User who created this tag */
  createdBy?: Maybe<User>;
  /** Number of definitions using this tag */
  definitionCount: Scalars['Int']['output'];
  /** Definitions using this tag */
  definitions: Array<Definition>;
  /** Unique identifier */
  id: Scalars['ID']['output'];
  /** Tag name (lowercase, 1-50 characters) */
  name: Scalars['String']['output'];
};

/** Result of an individual scenario evaluation task */
export type TaskResult = {
  __typename?: 'TaskResult';
  /** When the task completed */
  completedAt?: Maybe<Scalars['DateTime']['output']>;
  /** Error message if task failed */
  error?: Maybe<Scalars['String']['output']>;
  modelId: Scalars['String']['output'];
  scenarioId: Scalars['String']['output'];
  /** Current status of the task */
  status: Scalars['String']['output'];
};

/** Status of an individual task/job */
export enum TaskStatus {
  Completed = 'COMPLETED',
  Failed = 'FAILED',
  Pending = 'PENDING',
  Running = 'RUNNING'
}

export type TempZeroDecision = {
  __typename?: 'TempZeroDecision';
  content?: Maybe<Scalars['JSON']['output']>;
  decision?: Maybe<Scalars['String']['output']>;
  label: Scalars['String']['output'];
  transcriptId?: Maybe<Scalars['String']['output']>;
};

export type TempZeroModelVerification = {
  __typename?: 'TempZeroModelVerification';
  adapterModes: Array<Scalars['String']['output']>;
  decisionMatchRatePct?: Maybe<Scalars['Float']['output']>;
  fingerprintDriftPct?: Maybe<Scalars['Float']['output']>;
  modelId: Scalars['String']['output'];
  promptHashStabilityPct?: Maybe<Scalars['Float']['output']>;
  transcriptCount: Scalars['Int']['output'];
};

export type TempZeroPreflight = {
  __typename?: 'TempZeroPreflight';
  estimatedCostUsd?: Maybe<Scalars['Float']['output']>;
  estimatedInputTokens?: Maybe<Scalars['Int']['output']>;
  estimatedOutputTokens?: Maybe<Scalars['Int']['output']>;
  models: Array<TempZeroPreflightModel>;
  projectedComparisons: Scalars['Int']['output'];
  projectedPromptCount: Scalars['Int']['output'];
  runsToLaunch: Scalars['Int']['output'];
  selectedSignature?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  totalBatchesToRun: Scalars['Int']['output'];
  vignettes: Array<TempZeroPreflightVignette>;
};

export type TempZeroPreflightModel = {
  __typename?: 'TempZeroPreflightModel';
  adapterMode?: Maybe<Scalars['String']['output']>;
  label: Scalars['String']['output'];
  modelId: Scalars['String']['output'];
};

export type TempZeroPreflightVignette = {
  __typename?: 'TempZeroPreflightVignette';
  batchesToRun: Scalars['Int']['output'];
  conditionCount: Scalars['Int']['output'];
  rationale: Scalars['String']['output'];
  title: Scalars['String']['output'];
  vignetteId: Scalars['ID']['output'];
};

export type TempZeroRow = {
  __typename?: 'TempZeroRow';
  batch1?: Maybe<Scalars['String']['output']>;
  batch2?: Maybe<Scalars['String']['output']>;
  batch3?: Maybe<Scalars['String']['output']>;
  conditionKey: Scalars['String']['output'];
  decisions: Array<TempZeroDecision>;
  isMatch: Scalars['Boolean']['output'];
  mismatchType?: Maybe<Scalars['String']['output']>;
  modelId: Scalars['String']['output'];
  modelLabel: Scalars['String']['output'];
  vignetteId: Scalars['ID']['output'];
  vignetteTitle: Scalars['String']['output'];
};

export type TempZeroSummary = {
  __typename?: 'TempZeroSummary';
  batchesRun: Scalars['Int']['output'];
  comparisons: Scalars['Int']['output'];
  differenceRate?: Maybe<Scalars['Float']['output']>;
  excludedComparisons: Scalars['Int']['output'];
  matchRate?: Maybe<Scalars['Float']['output']>;
  modelsTested: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  title: Scalars['String']['output'];
  vignettesTested: Scalars['Int']['output'];
  worstModelId?: Maybe<Scalars['String']['output']>;
  worstModelLabel?: Maybe<Scalars['String']['output']>;
  worstModelMatchRate?: Maybe<Scalars['Float']['output']>;
};

export type TempZeroVerificationReport = {
  __typename?: 'TempZeroVerificationReport';
  batchTimestamp?: Maybe<Scalars['DateTime']['output']>;
  generatedAt: Scalars['DateTime']['output'];
  models: Array<TempZeroModelVerification>;
  transcriptCount: Scalars['Int']['output'];
};

/** A transcript from a model conversation during a run */
export type Transcript = {
  __typename?: 'Transcript';
  content: Scalars['JSON']['output'];
  contentExpiresAt?: Maybe<Scalars['DateTime']['output']>;
  createdAt: Scalars['DateTime']['output'];
  /** Parser and adjudication metadata for the transcript decision */
  decisionMetadata?: Maybe<Scalars['JSON']['output']>;
  /** Feature-flagged V2 decision envelope with raw evidence and canonical compatibility data */
  decisionModelV2?: Maybe<Scalars['JSON']['output']>;
  definitionSnapshot?: Maybe<Scalars['JSON']['output']>;
  /** Dimension values for this transcript's scenario (e.g. attribute levels for job-choice vignettes) */
  dimensionValues?: Maybe<Scalars['JSON']['output']>;
  durationMs: Scalars['Int']['output'];
  /** Estimated cost in dollars based on token usage and model pricing */
  estimatedCost?: Maybe<Scalars['Float']['output']>;
  id: Scalars['ID']['output'];
  lastAccessedAt?: Maybe<Scalars['DateTime']['output']>;
  /** The model identifier used for this transcript */
  modelId: Scalars['String']['output'];
  modelVersion?: Maybe<Scalars['String']['output']>;
  run: Run;
  runId: Scalars['String']['output'];
  /** Index within sample set for multi-sample runs (0 to N-1). Always 0 for single-sample runs. */
  sampleIndex: Scalars['Int']['output'];
  scenario?: Maybe<Scenario>;
  scenarioId?: Maybe<Scalars['String']['output']>;
  tokenCount: Scalars['Int']['output'];
  turnCount: Scalars['Int']['output'];
};

/** Summary of trial configuration consistency for a definition */
export type TrialConfigSummary = {
  __typename?: 'TrialConfigSummary';
  /** Definition version used by these trials */
  definitionVersion?: Maybe<Scalars['Int']['output']>;
  /** Whether all trials for this definition use the same version and temperature */
  isConsistent: Scalars['Boolean']['output'];
  /** Validation error message when trial settings are inconsistent */
  message?: Maybe<Scalars['String']['output']>;
  /** Human-readable trial signature combining version and temperature (e.g. v3td, v2t0.7) */
  signature?: Maybe<Scalars['String']['output']>;
  /** Per-signature breakdown of trial counts for this definition */
  signatureBreakdown: Array<TrialSignatureBreakdown>;
  /** Temperature used by these trials */
  temperature?: Maybe<Scalars['Float']['output']>;
};

/** Trial count grouped by signature/version/temperature for a definition */
export type TrialSignatureBreakdown = {
  __typename?: 'TrialSignatureBreakdown';
  definitionVersion?: Maybe<Scalars['Int']['output']>;
  signature: Scalars['String']['output'];
  temperature?: Maybe<Scalars['Float']['output']>;
  trialCount: Scalars['Int']['output'];
};

/** Result of triggering system-wide orphaned run recovery */
export type TriggerRecoveryPayload = {
  __typename?: 'TriggerRecoveryPayload';
  /** Number of orphaned runs detected */
  detected: Scalars['Int']['output'];
  /** Number of runs that failed to recover */
  errors: Scalars['Int']['output'];
  /** Number of runs successfully recovered */
  recovered: Scalars['Int']['output'];
};

export type UpdateDefinitionContentInput = {
  /** List of fields to clear local override for (inherit from parent). Valid values: template, dimensions, matching_rules */
  clearOverrides?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Update dimensions array. Set to null to clear override and inherit from parent. */
  dimensions?: InputMaybe<Scalars['JSON']['input']>;
  /** Update matching rules. Set to empty string to clear override. */
  matchingRules?: InputMaybe<Scalars['String']['input']>;
  /** Update template. Set to empty string to clear override and inherit from parent. */
  template?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateDefinitionInput = {
  /** Updated content (optional, replaces entire content if provided) */
  content?: InputMaybe<Scalars['JSON']['input']>;
  /** Updated name (optional) */
  name?: InputMaybe<Scalars['String']['input']>;
  /** Update preamble version ID */
  preambleVersionId?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateDomainContextInput = {
  text: Scalars['String']['input'];
};

export type UpdatePairedVignetteInput = {
  contextId: Scalars['ID']['input'];
  definitionId: Scalars['ID']['input'];
  levelPresetVersionId?: InputMaybe<Scalars['ID']['input']>;
  name: Scalars['String']['input'];
  preambleVersionId?: InputMaybe<Scalars['ID']['input']>;
  valueFirstId: Scalars['ID']['input'];
  valueSecondId: Scalars['ID']['input'];
};

export type UpdateLevelPresetInput = {
  l1: Scalars['String']['input'];
  l2: Scalars['String']['input'];
  l3: Scalars['String']['input'];
  l4: Scalars['String']['input'];
  l5: Scalars['String']['input'];
};

/** Input for updating an LLM model (model ID cannot be changed) */
export type UpdateLlmModelInput = {
  /** Provider-specific API configuration (e.g., {"maxTokensParam": "max_completion_tokens"}). Set to null to clear. */
  apiConfig?: InputMaybe<Scalars['JSON']['input']>;
  /** Updated cost per 1M input tokens */
  costInputPerMillion?: InputMaybe<Scalars['Float']['input']>;
  /** Updated cost per 1M output tokens */
  costOutputPerMillion?: InputMaybe<Scalars['Float']['input']>;
  /** Updated display name */
  displayName?: InputMaybe<Scalars['String']['input']>;
};

/** Input for updating LLM provider settings */
export type UpdateLlmProviderInput = {
  /** Whether provider is enabled */
  isEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  /** Max concurrent API requests */
  maxParallelRequests?: InputMaybe<Scalars['Int']['input']>;
  /** Rate limit (requests per minute) */
  requestsPerMinute?: InputMaybe<Scalars['Int']['input']>;
};

export type UpdatePreambleInput = {
  content: Scalars['String']['input'];
};

/** Input for updating a run */
export type UpdateRunInput = {
  /** New name for the run (null to clear) */
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateSurveyInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  instructions?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  questions?: InputMaybe<Array<SurveyQuestionInput>>;
  responseOptions?: InputMaybe<Array<SurveyResponseOptionInput>>;
};

/** Input for updating a system setting */
export type UpdateSystemSettingInput = {
  /** Setting key */
  key: Scalars['String']['input'];
  /** New value (JSON) */
  value: Scalars['JSON']['input'];
};

export type UpdateValueStatementInput = {
  body: Scalars['String']['input'];
};

/** A user account */
export type User = {
  __typename?: 'User';
  /** When the account was created */
  createdAt: Scalars['DateTime']['output'];
  /** User email address */
  email: Scalars['String']['output'];
  /** Unique user identifier */
  id: Scalars['ID']['output'];
  /** When the user last logged in */
  lastLoginAt?: Maybe<Scalars['DateTime']['output']>;
  /** User display name */
  name?: Maybe<Scalars['String']['output']>;
};

export type ValueFaultLine = {
  __typename?: 'ValueFaultLine';
  absDelta: Scalars['Float']['output'];
  clusterAId: Scalars['String']['output'];
  clusterAScore: Scalars['Float']['output'];
  clusterBId: Scalars['String']['output'];
  clusterBScore: Scalars['Float']['output'];
  delta: Scalars['Float']['output'];
  valueKey: Scalars['String']['output'];
};

/** A value statement keyed by (domainId, token), used in Job Choice vignette assembly */
export type ValueStatement = {
  __typename?: 'ValueStatement';
  body: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  domain?: Maybe<Domain>;
  domainId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  token: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ValueStatementInput = {
  content: Scalars['String']['input'];
  token: Scalars['String']['input'];
};

/** A versioned snapshot of a value statement content */
export type ValueStatementVersion = {
  __typename?: 'ValueStatementVersion';
  content: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  statementId: Scalars['String']['output'];
};

/** A value statement with its current and previous content for diff display */
export type ValueStatementWithVersions = {
  __typename?: 'ValueStatementWithVersions';
  currentContent: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  previousContent?: Maybe<Scalars['String']['output']>;
  token: Scalars['String']['output'];
};

/** Health status for Python workers */
export type WorkerHealth = {
  __typename?: 'WorkerHealth';
  /** API key configuration status by provider */
  apiKeys: Scalars['JSON']['output'];
  /** When the health check was performed */
  checkedAt: Scalars['DateTime']['output'];
  /** Error message if health check failed */
  error?: Maybe<Scalars['String']['output']>;
  /** Whether the Python workers are healthy */
  isHealthy: Scalars['Boolean']['output'];
  /** Installed Python packages with versions */
  packages: Scalars['JSON']['output'];
  /** Python version running the workers */
  pythonVersion?: Maybe<Scalars['String']['output']>;
  /** Health check warnings */
  warnings: Array<Scalars['String']['output']>;
};

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { __typename?: 'Query', me?: { __typename?: 'User', id: string, email: string, name?: string | null, lastLoginAt?: any | null, createdAt: any } | null };

export type AvailableModelsQueryVariables = Exact<{ [key: string]: never; }>;


export type AvailableModelsQuery = { __typename?: 'Query', availableModels: Array<{ __typename?: 'AvailableModel', id: string, providerId: string, displayName: string, versions: Array<string>, defaultVersion?: string | null, isAvailable: boolean, isDefault: boolean }> };

export type TempZeroVerificationReportQueryVariables = Exact<{ [key: string]: never; }>;


export type TempZeroVerificationReportQuery = { __typename?: 'Query', tempZeroVerificationReport?: { __typename?: 'TempZeroVerificationReport', generatedAt: any, transcriptCount: number, batchTimestamp?: any | null, models: Array<{ __typename?: 'TempZeroModelVerification', modelId: string, transcriptCount: number, adapterModes: Array<string>, promptHashStabilityPct?: number | null, fingerprintDriftPct?: number | null, decisionMatchRatePct?: number | null }> } | null };


export const MeDocument = gql`
    query Me {
  me {
    id
    email
    name
    lastLoginAt
    createdAt
  }
}
    `;

export function useMeQuery(options?: Omit<Urql.UseQueryArgs<MeQueryVariables>, 'query'>) {
  return Urql.useQuery<MeQuery, MeQueryVariables>({ query: MeDocument, ...options });
};
export const AvailableModelsDocument = gql`
    query AvailableModels {
  availableModels {
    id
    providerId
    displayName
    versions
    defaultVersion
    isAvailable
    isDefault
  }
}
    `;

export function useAvailableModelsQuery(options?: Omit<Urql.UseQueryArgs<AvailableModelsQueryVariables>, 'query'>) {
  return Urql.useQuery<AvailableModelsQuery, AvailableModelsQueryVariables>({ query: AvailableModelsDocument, ...options });
};
export const TempZeroVerificationReportDocument = gql`
    query TempZeroVerificationReport {
  tempZeroVerificationReport {
    generatedAt
    transcriptCount
    batchTimestamp
    models {
      modelId
      transcriptCount
      adapterModes
      promptHashStabilityPct
      fingerprintDriftPct
      decisionMatchRatePct
    }
  }
}
    `;

export function useTempZeroVerificationReportQuery(options?: Omit<Urql.UseQueryArgs<TempZeroVerificationReportQueryVariables>, 'query'>) {
  return Urql.useQuery<TempZeroVerificationReportQuery, TempZeroVerificationReportQueryVariables>({ query: TempZeroVerificationReportDocument, ...options });
};