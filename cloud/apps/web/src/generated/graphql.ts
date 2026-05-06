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
  DateTime: { input: string; output: string; }
  JSON: { input: unknown; output: unknown; }
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
export type AnalysisStatus =
  | 'CURRENT'
  | 'SUPERSEDED';

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

/** Type of action that was audited */
export type AuditAction =
  | 'ACTION'
  | 'CREATE'
  | 'DELETE'
  | 'UPDATE';

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

export type AvailableSignature = {
  __typename?: 'AvailableSignature';
  mostRecentRunAt?: Maybe<Scalars['DateTime']['output']>;
  signature: Scalars['String']['output'];
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

export type CircumplexAnalysisResult = {
  __typename?: 'CircumplexAnalysisResult';
  eligibilityThreshold: Scalars['Int']['output'];
  insufficient: Array<CircumplexInsufficientModel>;
  models: Array<CircumplexResult>;
  signature: Scalars['String']['output'];
};

export type CircumplexInsufficientModel = {
  __typename?: 'CircumplexInsufficientModel';
  modelId: Scalars['String']['output'];
  modelLabel: Scalars['String']['output'];
  providerName: Scalars['String']['output'];
  reason: Scalars['String']['output'];
  trialsPerValue: Array<CircumplexPerValue>;
};

export type CircumplexMdsCoord = {
  __typename?: 'CircumplexMdsCoord';
  theoreticalAngleDeg: Scalars['Float']['output'];
  valueKey: Scalars['String']['output'];
  x: Scalars['Float']['output'];
  y: Scalars['Float']['output'];
};

export type CircumplexPerValue = {
  __typename?: 'CircumplexPerValue';
  trials: Scalars['Int']['output'];
  valueKey: Scalars['String']['output'];
};

export type CircumplexResult = {
  __typename?: 'CircumplexResult';
  excludedValues: Array<Scalars['String']['output']>;
  mds2d: Array<CircumplexMdsCoord>;
  mdsStress: Scalars['Float']['output'];
  mdsWarning?: Maybe<Scalars['String']['output']>;
  modelId: Scalars['String']['output'];
  modelLabel: Scalars['String']['output'];
  pairTrialCounts: Array<Array<Scalars['Int']['output']>>;
  profileCorrelationMatrix: Array<Array<Maybe<Scalars['Float']['output']>>>;
  providerName: Scalars['String']['output'];
  signature: Scalars['String']['output'];
  spearmanP?: Maybe<Scalars['Float']['output']>;
  spearmanRho?: Maybe<Scalars['Float']['output']>;
  trialsPerValue: Array<CircumplexPerValue>;
  valueOrder: Array<Scalars['String']['output']>;
  verdictBand: Scalars['String']['output'];
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

export type Coherence = {
  __typename?: 'Coherence';
  coherentPairs: Scalars['Int']['output'];
  determinatePairs: Scalars['Int']['output'];
  indeterminatePairs: Scalars['Int']['output'];
  perPair: Array<ConsistencyPerPair>;
  value: Scalars['Float']['output'];
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

export type ConfidenceValueDetailResult = {
  __typename?: 'ConfidenceValueDetailResult';
  modelLabel: Scalars['String']['output'];
  valueKey: Scalars['String']['output'];
  vignettes: Array<DomainAnalysisVignetteDetail>;
};

export type ConsistencyPerCondition = {
  __typename?: 'ConsistencyPerCondition';
  matches: Scalars['Int']['output'];
  netPressureRank: Scalars['Int']['output'];
  scenarioId: Scalars['String']['output'];
  trials: Scalars['Int']['output'];
  winRate?: Maybe<Scalars['Float']['output']>;
};

export type ConsistencyPerDomain = {
  __typename?: 'ConsistencyPerDomain';
  ciHigh: Scalars['Float']['output'];
  ciLow: Scalars['Float']['output'];
  domainId: Scalars['String']['output'];
  domainName: Scalars['String']['output'];
  scenariosMeasured: Scalars['Int']['output'];
  value: Scalars['Float']['output'];
};

export type ConsistencyPerPair = {
  __typename?: 'ConsistencyPerPair';
  coherent: Scalars['Boolean']['output'];
  companionConditionIds: Array<Scalars['String']['output']>;
  determinate: Scalars['Boolean']['output'];
  domainId: Scalars['String']['output'];
  pValue?: Maybe<Scalars['Float']['output']>;
  perCondition: Array<ConsistencyPerCondition>;
  primaryConditionIds: Array<Scalars['String']['output']>;
  rho?: Maybe<Scalars['Float']['output']>;
  targetAnalysisRunId?: Maybe<Scalars['String']['output']>;
  targetCompanionRunId?: Maybe<Scalars['String']['output']>;
  valueKey: Scalars['String']['output'];
};

export type ConsistencyPerScenario = {
  __typename?: 'ConsistencyPerScenario';
  ciHigh: Scalars['Float']['output'];
  ciLow: Scalars['Float']['output'];
  matches: Scalars['Int']['output'];
  p: Scalars['Float']['output'];
  scenarioId: Scalars['String']['output'];
  trials: Scalars['Int']['output'];
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

export type CoverageModelCount = {
  __typename?: 'CoverageModelCount';
  label: Scalars['String']['output'];
  modelId: Scalars['String']['output'];
  trialCount: Scalars['Int']['output'];
};

export type CoverageModelOption = {
  __typename?: 'CoverageModelOption';
  label: Scalars['String']['output'];
  modelId: Scalars['String']['output'];
};

export type CoverageWeakestCondition = {
  __typename?: 'CoverageWeakestCondition';
  conditionLabel: Scalars['String']['output'];
  modelCounts: Array<CoverageModelCount>;
  otherConditionsCount?: Maybe<Scalars['Int']['output']>;
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

export type CreateUserInput = {
  email: Scalars['String']['input'];
  name: Scalars['String']['input'];
  password: Scalars['String']['input'];
  role: UserRole;
};

export type CreateValueStatementInput = {
  body: Scalars['String']['input'];
  domainId: Scalars['String']['input'];
  token: Scalars['String']['input'];
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
  /** For paired vignettes, returns the companion vignette (same pair_key, same domain, mirrored value_first / value_second tokens). Returns null when this definition is not paired or when no companion exists. Reuses findPairedCompanion from utils/auto-pair so callers do not duplicate the companion-resolution logic. */
  pairedSibling?: Maybe<Definition>;
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

export type DirectionalSanityCheck = {
  __typename?: 'DirectionalSanityCheck';
  breakdown: Array<DirectionalSanityCheckEntry>;
  flatPct: Scalars['Float']['output'];
  measuredCount: Scalars['Int']['output'];
  negativePct: Scalars['Float']['output'];
  positivePct: Scalars['Float']['output'];
  unmeasurableCount: Scalars['Int']['output'];
};

export type DirectionalSanityCheckEntry = {
  __typename?: 'DirectionalSanityCheckEntry';
  classification: Scalars['String']['output'];
  modelId: Scalars['String']['output'];
  pairKey: Scalars['String']['output'];
  pressureResponse: Scalars['Float']['output'];
};

/** A single domain used to group vignettes */
export type Domain = {
  __typename?: 'Domain';
  createdAt: Scalars['DateTime']['output'];
  defaultContext?: Maybe<DomainContext>;
  defaultContextId?: Maybe<Scalars['String']['output']>;
  defaultLevelPresetVersion?: Maybe<LevelPresetVersion>;
  defaultLevelPresetVersionId?: Maybe<Scalars['String']['output']>;
  defaultModelIds: Array<Scalars['String']['output']>;
  defaultPreambleVersion?: Maybe<PreambleVersion>;
  defaultPreambleVersionId?: Maybe<Scalars['String']['output']>;
  definitionCount: Scalars['Int']['output'];
  definitions: Array<Definition>;
  id: Scalars['ID']['output'];
  labelPrefix?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  normalizedName: Scalars['String']['output'];
  sentencePrefix?: Maybe<Scalars['String']['output']>;
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
  decisionModelV2?: Maybe<Scalars['JSON']['output']>;
  durationMs: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  modelId: Scalars['String']['output'];
  runId: Scalars['ID']['output'];
  scenarioId?: Maybe<Scalars['ID']['output']>;
  tokenCount: Scalars['Int']['output'];
  turnCount: Scalars['Int']['output'];
};

export type DomainAnalysisContributionSummary = {
  __typename?: 'DomainAnalysisContributionSummary';
  domainId: Scalars['String']['output'];
  domainName: Scalars['String']['output'];
  rawTrialCount: Scalars['Float']['output'];
  share: Scalars['Float']['output'];
};

export type DomainAnalysisExcludedDataSummary = {
  __typename?: 'DomainAnalysisExcludedDataSummary';
  count: Scalars['Float']['output'];
  domainId: Scalars['String']['output'];
  domainName: Scalars['String']['output'];
  reasonCode: Scalars['String']['output'];
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

export type DomainAnalysisRefreshResult = {
  __typename?: 'DomainAnalysisRefreshResult';
  message: Scalars['String']['output'];
  mode: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
};

export type DomainAnalysisResult = {
  __typename?: 'DomainAnalysisResult';
  cacheStatus: Scalars['String']['output'];
  clusterAnalysis: ClusterAnalysis;
  clusterAnalysisByMethod: Scalars['JSON']['output'];
  contributionSummary: Array<DomainAnalysisContributionSummary>;
  coveredDefinitions: Scalars['Int']['output'];
  definitionsWithAnalysis: Scalars['Int']['output'];
  domainId: Scalars['ID']['output'];
  domainName: Scalars['String']['output'];
  excludedDataSummary: Array<DomainAnalysisExcludedDataSummary>;
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
  deprioritized: Scalars['Float']['output'];
  neutral: Scalars['Float']['output'];
  prioritized: Scalars['Float']['output'];
  score: Scalars['Float']['output'];
  totalComparisons: Scalars['Float']['output'];
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
  launchableDefinitionIds: Array<Scalars['ID']['output']>;
  launchableDefinitions: Array<DomainEvaluationLaunchableDefinition>;
  maxBudgetUsd?: Maybe<Scalars['Float']['output']>;
  memberCount: Scalars['Int']['output'];
  members: Array<DomainEvaluationMember>;
  models: Array<Scalars['String']['output']>;
  projectedCostUsd: Scalars['Float']['output'];
  samplePercentage?: Maybe<Scalars['Int']['output']>;
  samplesPerScenario?: Maybe<Scalars['Int']['output']>;
  scopeCategory: Scalars['String']['output'];
  skippedForBudget: Scalars['Int']['output'];
  startedAt?: Maybe<Scalars['DateTime']['output']>;
  startedRuns: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  targetBatchCount?: Maybe<Scalars['Int']['output']>;
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

export type DomainEvaluationLaunchableDefinition = {
  __typename?: 'DomainEvaluationLaunchableDefinition';
  definitionId: Scalars['ID']['output'];
  definitionName: Scalars['String']['output'];
  pairKey?: Maybe<Scalars['String']['output']>;
};

export type DomainEvaluationMember = {
  __typename?: 'DomainEvaluationMember';
  createdAt: Scalars['DateTime']['output'];
  definitionIdAtLaunch: Scalars['ID']['output'];
  definitionNameAtLaunch: Scalars['String']['output'];
  domainIdAtLaunch: Scalars['ID']['output'];
  modelIds: Array<Scalars['String']['output']>;
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

export type DomainPressureEffect = {
  __typename?: 'DomainPressureEffect';
  domainId: Scalars['String']['output'];
  domainName: Scalars['String']['output'];
  pushedForEffect?: Maybe<Scalars['Float']['output']>;
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
  defaultModelIds: Array<Scalars['String']['output']>;
  domainId: Scalars['ID']['output'];
  labelPrefix?: Maybe<Scalars['String']['output']>;
  levelPresetVersionId?: Maybe<Scalars['String']['output']>;
  preambleVersionId?: Maybe<Scalars['String']['output']>;
  sentencePrefix?: Maybe<Scalars['String']['output']>;
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
  aFirstBatchEquivalent: Scalars['Int']['output'];
  aFirstDefinitionName?: Maybe<Scalars['String']['output']>;
  aggregateRunId?: Maybe<Scalars['String']['output']>;
  bFirstBatchEquivalent: Scalars['Int']['output'];
  bFirstDefinitionName?: Maybe<Scalars['String']['output']>;
  batchEquivalent: Scalars['Int']['output'];
  /** Union of definition IDs that contribute data to this coverage cell, sorted alphabetically. */
  contributingDefinitionIds: Array<Scalars['String']['output']>;
  definitionId?: Maybe<Scalars['String']['output']>;
  valueA: Scalars['String']['output'];
  valueB: Scalars['String']['output'];
  weakestCondition?: Maybe<CoverageWeakestCondition>;
};

export type DomainValueCoverageResult = {
  __typename?: 'DomainValueCoverageResult';
  availableModels: Array<CoverageModelOption>;
  cells: Array<DomainValueCoverageCell>;
  domainId: Scalars['String']['output'];
  values: Array<Scalars['String']['output']>;
};

export type EnsureDomainVignettePairInput = {
  domainId: Scalars['ID']['input'];
  valueFirstId: Scalars['ID']['input'];
  valueSecondId: Scalars['ID']['input'];
};

export type EnsureDomainVignettePairResult = {
  __typename?: 'EnsureDomainVignettePairResult';
  definitionAId?: Maybe<Scalars['String']['output']>;
  definitionBId?: Maybe<Scalars['String']['output']>;
  status: VignettePairStatus;
};

export type ExcludedDefinition = {
  __typename?: 'ExcludedDefinition';
  definitionId: Scalars['String']['output'];
  name: Scalars['String']['output'];
  reason: Scalars['String']['output'];
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
export type ExpansionJobStatus =
  /** Job is currently running */
  | 'ACTIVE'
  /** Job completed successfully */
  | 'COMPLETED'
  /** Job failed */
  | 'FAILED'
  /** No expansion job exists */
  | 'NONE'
  /** Job is queued and waiting to run */
  | 'PENDING';

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

export type InsufficientModel = {
  __typename?: 'InsufficientModel';
  label: Scalars['String']['output'];
  modelId: Scalars['String']['output'];
  providerName: Scalars['String']['output'];
  reason: Scalars['String']['output'];
};

export type InsufficientPressureSensitivityModel = {
  __typename?: 'InsufficientPressureSensitivityModel';
  label: Scalars['String']['output'];
  modelId: Scalars['String']['output'];
  providerName: Scalars['String']['output'];
  reason: Scalars['String']['output'];
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
export type LlmModelStatus =
  | 'ACTIVE'
  | 'DEPRECATED';

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

export type ModelConsistency = {
  __typename?: 'ModelConsistency';
  coherence: Coherence;
  label: Scalars['String']['output'];
  modelId: Scalars['String']['output'];
  orderEffect: OrderEffect;
  providerName: Scalars['String']['output'];
  repeatability: Repeatability;
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

export type ModelPairwiseWinRates = {
  __typename?: 'ModelPairwiseWinRates';
  label: Scalars['String']['output'];
  modelId: Scalars['String']['output'];
  trialCountMatrix: Array<Array<Scalars['Int']['output']>>;
  valueOrder: Array<Scalars['String']['output']>;
  winRateMatrix: Array<Array<Maybe<Scalars['Float']['output']>>>;
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

/** A domain-level contribution for a model/value pair */
export type ModelsAnalysisDomainBreakdown = {
  __typename?: 'ModelsAnalysisDomainBreakdown';
  domainId: Scalars['String']['output'];
  domainName: Scalars['String']['output'];
  evidenceWeight?: Maybe<Scalars['Int']['output']>;
  winRate: Scalars['Float']['output'];
};

/** A model row in the models analysis matrix */
export type ModelsAnalysisModelResult = {
  __typename?: 'ModelsAnalysisModelResult';
  label: Scalars['String']['output'];
  modelId: Scalars['String']['output'];
  values: Array<ModelsAnalysisValueResult>;
};

/** Cross-domain model analysis matrix results */
export type ModelsAnalysisResult = {
  __typename?: 'ModelsAnalysisResult';
  models: Array<ModelsAnalysisModelResult>;
};

/** A model/value summary across eligible domains */
export type ModelsAnalysisValueResult = {
  __typename?: 'ModelsAnalysisValueResult';
  domains: Array<ModelsAnalysisDomainBreakdown>;
  eligibleDomainCount: Scalars['Int']['output'];
  pooledWinRate?: Maybe<Scalars['Float']['output']>;
  stabilityScore?: Maybe<Scalars['Float']['output']>;
  valueKey: Scalars['String']['output'];
};

/** Confidence stats for a model across all values */
export type ModelsConfidenceModelResult = {
  __typename?: 'ModelsConfidenceModelResult';
  label: Scalars['String']['output'];
  modelId: Scalars['String']['output'];
  overallConfidence?: Maybe<Scalars['Float']['output']>;
  overallLeanCount: Scalars['Int']['output'];
  overallStrongCount: Scalars['Int']['output'];
  values: Array<ModelsConfidenceValueResult>;
};

/** Cross-model confidence heatmap: strong% per model per value */
export type ModelsConfidenceResult = {
  __typename?: 'ModelsConfidenceResult';
  models: Array<ModelsConfidenceModelResult>;
};

/** Confidence stats for a model/value pair */
export type ModelsConfidenceValueResult = {
  __typename?: 'ModelsConfidenceValueResult';
  confidence?: Maybe<Scalars['Float']['output']>;
  leanCount: Scalars['Int']['output'];
  strongCount: Scalars['Int']['output'];
  valueKey: Scalars['String']['output'];
};

export type ModelsConsistencyResult = {
  __typename?: 'ModelsConsistencyResult';
  insufficient: Array<InsufficientModel>;
  models: Array<ModelConsistency>;
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Add a tag to a definition. No-op if tag is already assigned. */
  addTagToDefinition: Definition;
  assignDomainToDefinitions: DomainMutationResult;
  assignDomainToDefinitionsByFilter: DomainMutationResult;
  backfillDomainEvaluationModels: DomainTrialRunResult;
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
  /** @deprecated Renamed to createPairedVignette */
  createJobChoicePair: CreatePairedVignetteResult;
  createLevelPreset: LevelPreset;
  /** Create a new LLM model under a provider */
  createLlmModel: LlmModel;
  createPairedVignette: CreatePairedVignetteResult;
  /** Create a new preamble */
  createPreamble: Preamble;
  /** Create a survey with a backing definition and one scenario per question. */
  createSurvey: Experiment;
  /** Create a new tag. Name is normalized to lowercase and must be unique. */
  createTag: Tag;
  /** Create a new user account. Admin only. */
  createUser: User;
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
  ensureDomainVignettePair: EnsureDomainVignettePairResult;
  /** Export a definition as markdown in devtool-compatible format */
  exportDefinitionAsMd: ExportResult;
  /** Export scenarios as CLI-compatible YAML for use with probe.py */
  exportScenariosAsYaml: ExportResult;
  /** Fork an existing definition. By default inherits all content from parent (sparse v2 storage). */
  forkDefinition: Definition;
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
  refreshDomainAnalysis: DomainAnalysisRefreshResult;
  /** Manually trigger scenario regeneration for a definition. Queues a new expansion job. */
  regenerateScenarios: RegenerateScenariosResult;
  /** Remove a tag from a definition. No-op if tag was not assigned. */
  removeTagFromDefinition: Definition;
  renameDomain: Domain;
  /** Re-probe the slot associated with an INVALID_RESPONSE_FAILURE anomaly. Soft-deletes any existing transcript at the slot, hard-deletes the corresponding probe_results row, increments the anomaly's reprobeAttempts counter inside a transaction, then enqueues a new probe_scenario job (post-commit) with a slot-tuple singletonKey for queue-layer deduplication. Returns the updated anomaly. Errors: NOT_FOUND, ANOMALY_NOT_OPEN, ANOMALY_NOT_REPROBABLE, RUN_NOT_REPROBABLE, REPROBE_LIMIT_EXCEEDED, REPROBE_ALREADY_IN_FLIGHT, REPROBE_SCENARIO_REQUIRED. */
  reprobeAnomalySlot: RunAnomaly;
  /** Manually mark an open run anomaly as resolved. Idempotent: resolving an already-resolved anomaly is a no-op success and returns the row unchanged. If the underlying condition is still detected on the next reconciliation pass, a fresh anomaly will be created (the unique constraint allows recreation because resolvedAt is non-null on the prior row). */
  resolveRunAnomaly: RunAnomaly;
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
  /** @deprecated Renamed to updatePairedVignette */
  updateJobChoicePair: CreatePairedVignetteResult;
  updateLevelPreset: LevelPreset;
  /** Update an LLM model (display name, costs, API config) */
  updateLlmModel: LlmModel;
  /** Update LLM provider settings (rate limits, enabled status) */
  updateLlmProvider: LlmProvider;
  updatePairedVignette: CreatePairedVignetteResult;
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
   *       Manually override a transcript's canonical decision.
   *
   *       Accepts one of four decisionStates: "resolved", "neutral", "unknown",
   *       or "refusal". For "resolved", favoredValueKey (one of the vignette
   *       pair's two value tokens) and strength ("strong" or "lean") are also
   *       required. Server derives direction (favor_first / favor_second)
   *       from favoredValueKey against the vignette pair.
   *
   *       If the run is already completed, this supersedes current analysis
   *       and queues a recompute job.
   *
   *       Requires authentication.
   *
   */
  updateTranscriptDecision: Transcript;
  /** Update a user role. Admin only. */
  updateUserRole: User;
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


export type MutationBackfillDomainEvaluationModelsArgs = {
  definitionIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  domainEvaluationId: Scalars['ID']['input'];
  modelIds: Array<Scalars['String']['input']>;
  targetBatchCount?: InputMaybe<Scalars['Int']['input']>;
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


export type MutationCreatePairedVignetteArgs = {
  input: CreatePairedVignetteInput;
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


export type MutationCreateUserArgs = {
  input: CreateUserInput;
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


export type MutationEnsureDomainVignettePairArgs = {
  input: EnsureDomainVignettePairInput;
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


export type MutationRefreshDomainAnalysisArgs = {
  domainId: Scalars['ID']['input'];
  signature?: InputMaybe<Scalars['String']['input']>;
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


export type MutationReprobeAnomalySlotArgs = {
  anomalyId: Scalars['ID']['input'];
};


export type MutationResolveRunAnomalyArgs = {
  id: Scalars['ID']['input'];
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
  defaultModelIds?: InputMaybe<Array<Scalars['String']['input']>>;
  defaultPreambleVersionId?: InputMaybe<Scalars['ID']['input']>;
  id: Scalars['ID']['input'];
};


export type MutationSetDomainSettingsArgs = {
  contextId?: InputMaybe<Scalars['ID']['input']>;
  defaultModelIds?: InputMaybe<Array<Scalars['String']['input']>>;
  domainId: Scalars['ID']['input'];
  labelPrefix?: InputMaybe<Scalars['String']['input']>;
  levelPresetVersionId?: InputMaybe<Scalars['ID']['input']>;
  preambleVersionId?: InputMaybe<Scalars['ID']['input']>;
  sentencePrefix?: InputMaybe<Scalars['String']['input']>;
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


export type MutationUpdatePairedVignetteArgs = {
  input: UpdatePairedVignetteInput;
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
  decisionState: Scalars['String']['input'];
  favoredValueKey?: InputMaybe<Scalars['String']['input']>;
  strength?: InputMaybe<Scalars['String']['input']>;
  transcriptId: Scalars['ID']['input'];
};


export type MutationUpdateUserRoleArgs = {
  input: UpdateUserRoleInput;
};


export type MutationUpdateValueStatementArgs = {
  id: Scalars['ID']['input'];
  input: UpdateValueStatementInput;
};

export type OrderEffect = {
  __typename?: 'OrderEffect';
  flippedPct: Scalars['Float']['output'];
  noisyPct: Scalars['Float']['output'];
  notApplicable: Scalars['Boolean']['output'];
  samePct: Scalars['Float']['output'];
};

export type PairwiseWinRatesResult = {
  __typename?: 'PairwiseWinRatesResult';
  models: Array<ModelPairwiseWinRates>;
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

export type PressureConditionExclusionBreakdown = {
  __typename?: 'PressureConditionExclusionBreakdown';
  definitionMetadata: Scalars['Int']['output'];
  invalidMetadata: Scalars['Int']['output'];
  levelAssignment: Scalars['Int']['output'];
  missingScenario: Scalars['Int']['output'];
  sourceRunMapping: Scalars['Int']['output'];
};

export type PressureResponse = {
  __typename?: 'PressureResponse';
  baselineRate?: Maybe<Scalars['Float']['output']>;
  ciHigh?: Maybe<Scalars['Float']['output']>;
  ciLow?: Maybe<Scalars['Float']['output']>;
  pushTowardFirstRate?: Maybe<Scalars['Float']['output']>;
  pushTowardSecondRate?: Maybe<Scalars['Float']['output']>;
  qualifyingTrials: Scalars['Int']['output'];
  reason?: Maybe<Scalars['String']['output']>;
  value?: Maybe<Scalars['Float']['output']>;
};

export type PressureResponseSummary = {
  __typename?: 'PressureResponseSummary';
  mean?: Maybe<Scalars['Float']['output']>;
  pairsMeasured: Scalars['Int']['output'];
  rangeMax?: Maybe<Scalars['Float']['output']>;
  rangeMin?: Maybe<Scalars['Float']['output']>;
};

export type PressureSensitivityModel = {
  __typename?: 'PressureSensitivityModel';
  domainPressureEffects: Array<DomainPressureEffect>;
  label: Scalars['String']['output'];
  modelId: Scalars['String']['output'];
  pressureResponseSummary: PressureResponseSummary;
  providerName: Scalars['String']['output'];
  pushedAgainstEffect?: Maybe<Scalars['Float']['output']>;
  pushedEffectPairsUsed: Scalars['Int']['output'];
  pushedForEffect?: Maybe<Scalars['Float']['output']>;
  unscoredCount: Scalars['Int']['output'];
  valuePairs: Array<PressureSensitivityValuePair>;
  valueRates: Array<PressureSensitivityValueRate>;
};

export type PressureSensitivityResult = {
  __typename?: 'PressureSensitivityResult';
  directionalSanityCheck: DirectionalSanityCheck;
  excludedDefinitions: Array<ExcludedDefinition>;
  insufficient: Array<InsufficientPressureSensitivityModel>;
  models: Array<PressureSensitivityModel>;
  pressureConditionExcludedCount: Scalars['Int']['output'];
  pressureConditionExclusionBreakdown: PressureConditionExclusionBreakdown;
  transcriptCapHit: Scalars['Boolean']['output'];
};

export type PressureSensitivityValuePair = {
  __typename?: 'PressureSensitivityValuePair';
  definitionsMeasured: Scalars['Int']['output'];
  directionBalancedBalancedOpponentWinRate?: Maybe<Scalars['Float']['output']>;
  directionBalancedBalancedWinRate?: Maybe<Scalars['Float']['output']>;
  directionBalancedHighPressureOpponentOpponentWinRate?: Maybe<Scalars['Float']['output']>;
  directionBalancedHighPressureOpponentWinRate?: Maybe<Scalars['Float']['output']>;
  directionBalancedHighPressureOwnOpponentWinRate?: Maybe<Scalars['Float']['output']>;
  directionBalancedHighPressureOwnWinRate?: Maybe<Scalars['Float']['output']>;
  directionBalancedOpponentWinRate?: Maybe<Scalars['Float']['output']>;
  directionBalancedWinRate?: Maybe<Scalars['Float']['output']>;
  firstValueLabel: Scalars['String']['output'];
  firstValueToken: Scalars['String']['output'];
  grid: Array<SensitivityCell>;
  n: Scalars['Int']['output'];
  pairKey: Scalars['String']['output'];
  pressureResponse: PressureResponse;
  secondValueLabel: Scalars['String']['output'];
  secondValueToken: Scalars['String']['output'];
  unscoredCount: Scalars['Int']['output'];
};

export type PressureSensitivityValueRate = {
  __typename?: 'PressureSensitivityValueRate';
  averageWinRate?: Maybe<Scalars['Float']['output']>;
  balancedWinRate?: Maybe<Scalars['Float']['output']>;
  highPressureOnOpposingValueWinRate?: Maybe<Scalars['Float']['output']>;
  highPressureOnThisValueWinRate?: Maybe<Scalars['Float']['output']>;
  pairsMeasured: Scalars['Int']['output'];
  valueLabel: Scalars['String']['output'];
  valueToken: Scalars['String']['output'];
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
  /** List DomainEvaluations that have at least one member run currently in PENDING, RUNNING, PAUSED, or SUMMARIZING status. Optional domainId filter scopes to one domain. Used by the cross-domain /status page. */
  activeEvaluations: Array<DomainEvaluation>;
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
  availableSignatures: Array<AvailableSignature>;
  circumplexAnalysis: CircumplexAnalysisResult;
  confidenceTranscripts: Array<DomainAnalysisConditionTranscript>;
  confidenceValueDetail: ConfidenceValueDetailResult;
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
  /** Get the configured infrastructure model for a specific purpose (e.g., "scenario_expansion") */
  infraModel?: Maybe<LlmModel>;
  /** Get a specific level preset by ID */
  levelPreset?: Maybe<LevelPreset>;
  /** List all level presets */
  levelPresets: Array<LevelPreset>;
  /** List all users. Admin only. */
  listUsers: Array<User>;
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
  modelsAnalysis: ModelsAnalysisResult;
  modelsConfidence: ModelsConfidenceResult;
  modelsConsistency: ModelsConsistencyResult;
  /** List anomalies that are currently open (resolvedAt IS NULL) across all runs. Optional filters: domainId scopes to anomalies whose run belongs to a definition in that domain; type scopes to a single RunAnomalyType. */
  openRunAnomalies: Array<RunAnomaly>;
  /** Pairwise win rates per value pair per model, vignette-averaged */
  pairwiseWinRates: PairwiseWinRatesResult;
  /** Get a specific preamble by ID */
  preamble?: Maybe<Preamble>;
  /** List all preambles */
  preambles: Array<Preamble>;
  pressureSensitivity: PressureSensitivityResult;
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
  /** List runs in PENDING, RUNNING, PAUSED, or SUMMARIZING status that are not members of any DomainEvaluation. Used by the /status page to surface ad-hoc runs. */
  standaloneActiveRuns: Array<Run>;
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


export type QueryActiveEvaluationsArgs = {
  domainId?: InputMaybe<Scalars['ID']['input']>;
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


export type QueryCircumplexAnalysisArgs = {
  minTrialsPerValue?: InputMaybe<Scalars['Int']['input']>;
  modelIds: Array<Scalars['String']['input']>;
  signature: Scalars['String']['input'];
};


export type QueryConfidenceTranscriptsArgs = {
  definitionId?: InputMaybe<Scalars['String']['input']>;
  domainId?: InputMaybe<Scalars['ID']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  modelId: Scalars['String']['input'];
  scenarioId?: InputMaybe<Scalars['String']['input']>;
  signature?: InputMaybe<Scalars['String']['input']>;
  valueKey: Scalars['String']['input'];
};


export type QueryConfidenceValueDetailArgs = {
  domainId?: InputMaybe<Scalars['ID']['input']>;
  modelId: Scalars['String']['input'];
  signature?: InputMaybe<Scalars['String']['input']>;
  valueKey: Scalars['String']['input'];
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
  scope?: InputMaybe<Scalars['String']['input']>;
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
  signature?: InputMaybe<Scalars['String']['input']>;
  valueKey: Scalars['String']['input'];
};


export type QueryDomainAvailableSignaturesArgs = {
  domainId: Scalars['ID']['input'];
  scope?: InputMaybe<Scalars['String']['input']>;
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


export type QueryModelsAnalysisArgs = {
  domainId?: InputMaybe<Scalars['ID']['input']>;
  signature?: InputMaybe<Scalars['String']['input']>;
};


export type QueryModelsConfidenceArgs = {
  domainId?: InputMaybe<Scalars['ID']['input']>;
  signature?: InputMaybe<Scalars['String']['input']>;
};


export type QueryModelsConsistencyArgs = {
  domainId?: InputMaybe<Scalars['ID']['input']>;
  minScenarios?: InputMaybe<Scalars['Int']['input']>;
  providerId?: InputMaybe<Scalars['ID']['input']>;
  signature: Scalars['String']['input'];
};


export type QueryOpenRunAnomaliesArgs = {
  domainId?: InputMaybe<Scalars['ID']['input']>;
  type?: InputMaybe<RunAnomalyType>;
};


export type QueryPairwiseWinRatesArgs = {
  domainId?: InputMaybe<Scalars['ID']['input']>;
  signature?: InputMaybe<Scalars['String']['input']>;
};


export type QueryPreambleArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPressureSensitivityArgs = {
  definitionId?: InputMaybe<Scalars['ID']['input']>;
  domainId?: InputMaybe<Scalars['ID']['input']>;
  modelIds?: InputMaybe<Array<Scalars['String']['input']>>;
  providerId?: InputMaybe<Scalars['ID']['input']>;
  signature: Scalars['String']['input'];
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

export type Repeatability = {
  __typename?: 'Repeatability';
  betweenScenarioSd: Scalars['Float']['output'];
  ciHigh: Scalars['Float']['output'];
  ciLow: Scalars['Float']['output'];
  perDomain: Array<ConsistencyPerDomain>;
  perScenario: Array<ConsistencyPerScenario>;
  scenariosMeasured: Scalars['Int']['output'];
  value: Scalars['Float']['output'];
  withinScenarioSd: Scalars['Float']['output'];
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

/** A saved record of a model evaluation or launch */
export type Run = {
  __typename?: 'Run';
  /** Most recent analysis result for this run */
  analysis?: Maybe<AnalysisResult>;
  /** Analysis status: pending, computing, completed, or failed */
  analysisStatus?: Maybe<Scalars['String']['output']>;
  /** Structured anomaly records for this run */
  anomalies: Array<RunAnomaly>;
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
  /** True if this run is an aggregate rollup record (a saved summary derived from other runs) and does not have its own probe data. False for normal runs that produced their own transcripts. Use this to distinguish data-bearing runs from aggregates in UI / analysis. */
  isAggregate: Scalars['Boolean']['output'];
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
  /** Derived progress information for transcript summarization */
  summarizeProgress?: Maybe<RunProgress>;
  /** Tags associated with this run */
  tags: Array<Tag>;
  transcriptCount: Scalars['Int']['output'];
  transcripts: Array<Transcript>;
  /** Count of summarized transcripts that could not be scored */
  unresolvableTranscriptCount?: Maybe<UnresolvableCount>;
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

/** Structured anomaly record for a run */
export type RunAnomaly = {
  __typename?: 'RunAnomaly';
  acknowledgedByUserId?: Maybe<Scalars['String']['output']>;
  /** ID of the most recent non-deleted transcript for this slot. For INVALID_RESPONSE_FAILURE only — queries by (runId, scenarioId, modelId, sampleIndex). Handles reprobe-fixed anomalies where details.transcriptId still points to the original. Null for non-slot types. */
  activeTranscriptId?: Maybe<Scalars['String']['output']>;
  details: Scalars['JSON']['output'];
  /** Dimension values from the scenario content for slot-keyed anomaly types (Record<string, string>). Null for non-slot types. */
  dimensionValues?: Maybe<Scalars['JSON']['output']>;
  /** Human-friendly anomaly type label. For unknown future enum values, returns the raw enum string. */
  displayLabel: Scalars['String']['output'];
  /** Human-friendly subject label. Type-aware: slot-keyed types render as "model X · sample N", transcript-keyed types render as "transcript <short>", others return the raw subject. */
  displaySubject: Scalars['String']['output'];
  /** The domain this anomaly belongs to (via run.definition.domain). Null if the definition is not associated with a domain. */
  domain?: Maybe<Domain>;
  /** Best-effort cost estimate for the next re-probe attempt, computed as the average estimatedCost of the last 10 successful (non-deleted, summarized) transcripts for the same modelId across all runs. Returns null when the anomaly is not reprobable, no modelId is available, or no recent transcripts have cost data. */
  estimatedCost?: Maybe<Scalars['Float']['output']>;
  firstSeenAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  lastSeenAt: Scalars['DateTime']['output'];
  /** Number of re-probe attempts already made for this anomaly. Reads details.reprobeAttempts; 0 for non-slot-keyed types. */
  reprobeCount: Scalars['Int']['output'];
  /** Whether the [Re-probe] action is offered for this anomaly type. v1: only INVALID_RESPONSE_FAILURE is reprobable; other slot-keyed types may be added later. */
  reprobeEligible: Scalars['Boolean']['output'];
  /** True when reprobeCount has reached the circuit-breaker limit (3). UI should disable the [Re-probe] button. */
  reprobeLimitReached: Scalars['Boolean']['output'];
  /** Current pipeline stage for an in-progress manual re-probe: probing | summarizing | analyzing | aggregating | fixed. Null when no re-probe is in flight. */
  reprobeStage?: Maybe<Scalars['String']['output']>;
  resolvedAt?: Maybe<Scalars['DateTime']['output']>;
  /** The run this anomaly belongs to */
  run: Run;
  runId: Scalars['String']['output'];
  /** Scenario (vignette) name for slot-keyed anomaly types. Null for non-slot types or when the scenario cannot be found. */
  scenarioName?: Maybe<Scalars['String']['output']>;
  source: RunAnomalySource;
  subject: Scalars['String']['output'];
  type: RunAnomalyType;
};

/** Source of a run anomaly record */
export type RunAnomalySource =
  /** Anomaly detected by the audit sweep */
  | 'AUDIT'
  /** Anomaly detected by the default reconciliation sweep */
  | 'DEFAULT';

/** Structured anomaly type for run state reconciliation */
export type RunAnomalyType =
  | 'INVALID_RESPONSE_FAILURE'
  | 'MODEL_TRANSCRIPT_SHORTFALL'
  | 'ORPHAN_TRANSCRIPT'
  | 'PAIR_ASYMMETRY'
  | 'SCHEDULED_COUNT_MISMATCH'
  | 'STRANDED_TRANSCRIPT'
  | 'SUMMARIZING_STALL';

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
export type RunPriority =
  | 'HIGH'
  | 'LOW'
  | 'NORMAL';

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
export type RunStatus =
  | 'CANCELLED'
  | 'COMPLETED'
  | 'FAILED'
  | 'PENDING'
  | 'RUNNING';

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

export type SensitivityCell = {
  __typename?: 'SensitivityCell';
  conviction?: Maybe<Scalars['Float']['output']>;
  lowData: Scalars['Boolean']['output'];
  n: Scalars['Int']['output'];
  netScore?: Maybe<Scalars['Float']['output']>;
  opponentLevel: Scalars['Int']['output'];
  opponentSuccesses: Scalars['Int']['output'];
  opponentWinRate?: Maybe<Scalars['Float']['output']>;
  ownLevel: Scalars['Int']['output'];
  successes: Scalars['Int']['output'];
  unscoredCount: Scalars['Int']['output'];
  winRate?: Maybe<Scalars['Float']['output']>;
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
  /** Launch mode hint: STANDARD, PAIRED_BATCH, PAIRED_BATCH_TOPUP, or AD_HOC_BATCH */
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
  /** Direction to top up for paired-batch top-up launches */
  topUpDirection?: InputMaybe<Scalars['String']['input']>;
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
export type TaskStatus =
  | 'COMPLETED'
  | 'FAILED'
  | 'PENDING'
  | 'RUNNING';

/** A transcript from a model conversation during a run */
export type Transcript = {
  __typename?: 'Transcript';
  content: Scalars['JSON']['output'];
  contentExpiresAt?: Maybe<Scalars['DateTime']['output']>;
  createdAt: Scalars['DateTime']['output'];
  /** Parser and adjudication metadata for the transcript decision */
  decisionMetadata?: Maybe<Scalars['JSON']['output']>;
  /** V2 decision envelope with raw evidence and canonical direction/strength decision */
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

export type UnresolvableByModel = {
  __typename?: 'UnresolvableByModel';
  count: Scalars['Int']['output'];
  modelId: Scalars['String']['output'];
};

export type UnresolvableCount = {
  __typename?: 'UnresolvableCount';
  byModel: Array<UnresolvableByModel>;
  total: Scalars['Int']['output'];
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

export type UpdatePairedVignetteInput = {
  contextId: Scalars['ID']['input'];
  definitionId: Scalars['ID']['input'];
  levelPresetVersionId?: InputMaybe<Scalars['ID']['input']>;
  name: Scalars['String']['input'];
  preambleVersionId?: InputMaybe<Scalars['ID']['input']>;
  valueFirstId: Scalars['ID']['input'];
  valueSecondId: Scalars['ID']['input'];
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

export type UpdateUserRoleInput = {
  role: UserRole;
  userId: Scalars['ID']['input'];
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
  /** Whether the user must change their password on next login */
  mustChangePassword: Scalars['Boolean']['output'];
  /** User display name */
  name?: Maybe<Scalars['String']['output']>;
  /** User role */
  role: UserRole;
};

/** Role assigned to a user account */
export type UserRole =
  | 'ADMIN'
  | 'VISITOR';

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

export type VignettePairStatus =
  | 'CREATED'
  | 'SKIPPED'
  | 'SKIPPED_HAS_RUNS'
  | 'UPDATED';

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

export type ActiveEvaluationsQueryVariables = Exact<{
  domainId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type ActiveEvaluationsQuery = { __typename?: 'Query', activeEvaluations: Array<{ __typename?: 'DomainEvaluation', id: string, domainId: string, domainNameAtLaunch: string, scopeCategory: string, status: string, createdAt: string, startedAt?: string | null, completedAt?: string | null, startedRuns: number, failedDefinitions: number, skippedForBudget: number, projectedCostUsd: number, models: Array<string>, temperature?: number | null, maxBudgetUsd?: number | null, memberCount: number, launchableDefinitionIds: Array<string>, samplePercentage?: number | null, samplesPerScenario?: number | null, targetBatchCount?: number | null, launchableDefinitions: Array<{ __typename?: 'DomainEvaluationLaunchableDefinition', definitionId: string, definitionName: string, pairKey?: string | null }>, members: Array<{ __typename?: 'DomainEvaluationMember', runId: string, definitionIdAtLaunch: string, definitionNameAtLaunch: string, domainIdAtLaunch: string, modelIds: Array<string>, createdAt: string, runStatus: string, runCategory: string, runStartedAt?: string | null, runCompletedAt?: string | null }> }> };

export type AnalysisResultFieldsFragment = { __typename?: 'AnalysisResult', id: string, runId: string, analysisType: string, status: string, codeVersion: string, inputHash: string, createdAt: string, computedAt?: string | null, durationMs?: number | null, perModel: unknown, modelAgreement: unknown, dimensionAnalysis?: unknown | null, visualizationData?: unknown | null, varianceAnalysis?: unknown | null, methodsUsed: unknown, preferenceSummary?: { __typename?: 'PreferenceSummary', perModel: unknown } | null, reliabilitySummary?: { __typename?: 'ReliabilitySummary', perModel: unknown } | null, aggregateMetadata?: { __typename?: 'AggregateMetadata', aggregateEligibility: string, aggregateIneligibilityReason?: string | null, sourceRunCount: number, sourceRunIds: Array<string>, conditionCoverage: unknown, perModelRepeatCoverage: unknown, perModelDrift: unknown } | null, mostContestedScenarios: Array<{ __typename?: 'ContestedScenario', scenarioId: string, scenarioName: string, variance: number, modelScores: unknown }>, warnings: Array<{ __typename?: 'AnalysisWarning', code: string, message: string, recommendation: string }> };

export type AnalysisQueryVariables = Exact<{
  runId: Scalars['ID']['input'];
}>;


export type AnalysisQuery = { __typename?: 'Query', analysis?: { __typename?: 'AnalysisResult', id: string, runId: string, analysisType: string, status: string, codeVersion: string, inputHash: string, createdAt: string, computedAt?: string | null, durationMs?: number | null, perModel: unknown, modelAgreement: unknown, dimensionAnalysis?: unknown | null, visualizationData?: unknown | null, varianceAnalysis?: unknown | null, methodsUsed: unknown, preferenceSummary?: { __typename?: 'PreferenceSummary', perModel: unknown } | null, reliabilitySummary?: { __typename?: 'ReliabilitySummary', perModel: unknown } | null, aggregateMetadata?: { __typename?: 'AggregateMetadata', aggregateEligibility: string, aggregateIneligibilityReason?: string | null, sourceRunCount: number, sourceRunIds: Array<string>, conditionCoverage: unknown, perModelRepeatCoverage: unknown, perModelDrift: unknown } | null, mostContestedScenarios: Array<{ __typename?: 'ContestedScenario', scenarioId: string, scenarioName: string, variance: number, modelScores: unknown }>, warnings: Array<{ __typename?: 'AnalysisWarning', code: string, message: string, recommendation: string }> } | null };

export type RecomputeAnalysisMutationVariables = Exact<{
  runId: Scalars['ID']['input'];
}>;


export type RecomputeAnalysisMutation = { __typename?: 'Mutation', recomputeAnalysis?: { __typename?: 'AnalysisResult', id: string, runId: string, analysisType: string, status: string, codeVersion: string, inputHash: string, createdAt: string, computedAt?: string | null, durationMs?: number | null, perModel: unknown, modelAgreement: unknown, dimensionAnalysis?: unknown | null, visualizationData?: unknown | null, varianceAnalysis?: unknown | null, methodsUsed: unknown, preferenceSummary?: { __typename?: 'PreferenceSummary', perModel: unknown } | null, reliabilitySummary?: { __typename?: 'ReliabilitySummary', perModel: unknown } | null, aggregateMetadata?: { __typename?: 'AggregateMetadata', aggregateEligibility: string, aggregateIneligibilityReason?: string | null, sourceRunCount: number, sourceRunIds: Array<string>, conditionCoverage: unknown, perModelRepeatCoverage: unknown, perModelDrift: unknown } | null, mostContestedScenarios: Array<{ __typename?: 'ContestedScenario', scenarioId: string, scenarioName: string, variance: number, modelScores: unknown }>, warnings: Array<{ __typename?: 'AnalysisWarning', code: string, message: string, recommendation: string }> } | null };

export type ApiKeysQueryVariables = Exact<{ [key: string]: never; }>;


export type ApiKeysQuery = { __typename?: 'Query', apiKeys: Array<{ __typename?: 'ApiKey', id: string, name: string, keyPrefix: string, lastUsedAt?: string | null, expiresAt?: string | null, createdAt: string }> };

export type CreateApiKeyMutationVariables = Exact<{
  input: CreateApiKeyInput;
}>;


export type CreateApiKeyMutation = { __typename?: 'Mutation', createApiKey: { __typename?: 'CreateApiKeyResult', key: string, apiKey: { __typename?: 'ApiKey', id: string, name: string, keyPrefix: string, lastUsedAt?: string | null, expiresAt?: string | null, createdAt: string } } };

export type RevokeApiKeyMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type RevokeApiKeyMutation = { __typename?: 'Mutation', revokeApiKey: boolean };

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { __typename?: 'Query', me?: { __typename?: 'User', id: string, email: string, name?: string | null, lastLoginAt?: string | null, createdAt: string } | null };

export type AvailableSignaturesQueryVariables = Exact<{ [key: string]: never; }>;


export type AvailableSignaturesQuery = { __typename?: 'Query', availableSignatures: Array<{ __typename?: 'AvailableSignature', signature: string, mostRecentRunAt?: string | null }> };

export type CircumplexAnalysisQueryVariables = Exact<{
  modelIds: Array<Scalars['String']['input']> | Scalars['String']['input'];
  signature: Scalars['String']['input'];
  minTrialsPerValue?: InputMaybe<Scalars['Int']['input']>;
}>;


export type CircumplexAnalysisQuery = { __typename?: 'Query', circumplexAnalysis: { __typename?: 'CircumplexAnalysisResult', signature: string, eligibilityThreshold: number, insufficient: Array<{ __typename?: 'CircumplexInsufficientModel', modelId: string, modelLabel: string, providerName: string, reason: string, trialsPerValue: Array<{ __typename?: 'CircumplexPerValue', valueKey: string, trials: number }> }>, models: Array<{ __typename?: 'CircumplexResult', modelId: string, modelLabel: string, providerName: string, signature: string, valueOrder: Array<string>, profileCorrelationMatrix: Array<Array<number | null>>, pairTrialCounts: Array<Array<number>>, excludedValues: Array<string>, spearmanRho?: number | null, spearmanP?: number | null, verdictBand: string, mdsStress: number, mdsWarning?: string | null, mds2d: Array<{ __typename?: 'CircumplexMdsCoord', valueKey: string, x: number, y: number, theoreticalAngleDeg: number }>, trialsPerValue: Array<{ __typename?: 'CircumplexPerValue', valueKey: string, trials: number }> }> } };

export type ComparisonRunListFieldsFragment = { __typename?: 'Run', id: string, name?: string | null, definitionId: string, status: string, config: unknown, progress?: unknown | null, startedAt?: string | null, completedAt?: string | null, createdAt: string, transcriptCount: number, analysisStatus?: string | null, definition?: { __typename?: 'Definition', id: string, name: string, tags: Array<{ __typename?: 'Tag', id: string, name: string }> } | null };

export type ComparisonRunFullFieldsFragment = { __typename?: 'Run', id: string, name?: string | null, definitionId: string, status: string, config: unknown, progress?: unknown | null, startedAt?: string | null, completedAt?: string | null, createdAt: string, transcriptCount: number, analysisStatus?: string | null, definition?: { __typename?: 'Definition', id: string, name: string, parentId?: string | null, resolvedContent: unknown, tags: Array<{ __typename?: 'Tag', id: string, name: string }> } | null };

export type ComparisonRunsListQueryVariables = Exact<{
  definitionId?: InputMaybe<Scalars['String']['input']>;
  analysisStatus?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type ComparisonRunsListQuery = { __typename?: 'Query', runs: Array<{ __typename?: 'Run', id: string, name?: string | null, definitionId: string, status: string, config: unknown, progress?: unknown | null, startedAt?: string | null, completedAt?: string | null, createdAt: string, transcriptCount: number, analysisStatus?: string | null, definition?: { __typename?: 'Definition', id: string, name: string, tags: Array<{ __typename?: 'Tag', id: string, name: string }> } | null }> };

export type ConfidenceTranscriptsQueryVariables = Exact<{
  modelId: Scalars['String']['input'];
  valueKey: Scalars['String']['input'];
  signature?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  definitionId?: InputMaybe<Scalars['String']['input']>;
  scenarioId?: InputMaybe<Scalars['String']['input']>;
  domainId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type ConfidenceTranscriptsQuery = { __typename?: 'Query', confidenceTranscripts: Array<{ __typename?: 'DomainAnalysisConditionTranscript', id: string, runId: string, scenarioId?: string | null, modelId: string, decisionModelV2?: unknown | null, turnCount: number, tokenCount: number, durationMs: number, createdAt: string, content: unknown }> };

export type ConfidenceValueDetailQueryVariables = Exact<{
  modelId: Scalars['String']['input'];
  valueKey: Scalars['String']['input'];
  signature?: InputMaybe<Scalars['String']['input']>;
  domainId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type ConfidenceValueDetailQuery = { __typename?: 'Query', confidenceValueDetail: { __typename?: 'ConfidenceValueDetailResult', modelLabel: string, valueKey: string, vignettes: Array<{ __typename?: 'DomainAnalysisVignetteDetail', definitionId: string, definitionName: string, definitionVersion: number, otherValueKey: string, totalTrials: number, conditions: Array<{ __typename?: 'DomainAnalysisConditionDetail', scenarioId?: string | null, conditionName: string, dimensions?: unknown | null, prioritized: number, deprioritized: number, neutral: number, totalTrials: number, unknownCount: number, strongly: number, somewhat: number, opponentSomewhat: number, opponentStrongly: number }> }> } };

export type EstimateCostQueryVariables = Exact<{
  definitionId: Scalars['ID']['input'];
  models: Array<Scalars['String']['input']> | Scalars['String']['input'];
  samplePercentage?: InputMaybe<Scalars['Int']['input']>;
  samplesPerScenario?: InputMaybe<Scalars['Int']['input']>;
}>;


export type EstimateCostQuery = { __typename?: 'Query', estimateCost: { __typename?: 'CostEstimate', total: number, scenarioCount: number, basedOnSampleCount: number, isUsingFallback: boolean, fallbackReason?: string | null, perModel: Array<{ __typename?: 'ModelCostEstimate', modelId: string, displayName: string, scenarioCount: number, inputTokens: number, outputTokens: number, inputCost: number, outputCost: number, totalCost: number, avgInputPerProbe: number, avgOutputPerProbe: number, sampleCount: number, isUsingFallback: boolean }> } };

export type DefinitionsQueryVariables = Exact<{
  rootOnly?: InputMaybe<Scalars['Boolean']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  tagIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  hasRuns?: InputMaybe<Scalars['Boolean']['input']>;
  domainId?: InputMaybe<Scalars['ID']['input']>;
  withoutDomain?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type DefinitionsQuery = { __typename?: 'Query', definitions: Array<{ __typename?: 'Definition', id: string, name: string, domainId?: string | null, parentId?: string | null, content: unknown, createdAt: string, updatedAt: string, lastAccessedAt?: string | null, version: number, runCount: number, trialCount: number, domain?: { __typename?: 'Domain', id: string, name: string } | null, trialConfig: { __typename?: 'TrialConfigSummary', definitionVersion?: number | null, temperature?: number | null, signature?: string | null, isConsistent: boolean, message?: string | null, signatureBreakdown: Array<{ __typename?: 'TrialSignatureBreakdown', signature: string, definitionVersion?: number | null, temperature?: number | null, trialCount: number }> }, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, allTags: Array<{ __typename?: 'Tag', id: string, name: string }> }> };

export type DefinitionQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DefinitionQuery = { __typename?: 'Query', definition?: { __typename?: 'Definition', id: string, name: string, domainId?: string | null, domainContextId?: string | null, parentId?: string | null, content: unknown, createdAt: string, updatedAt: string, lastAccessedAt?: string | null, version: number, runCount: number, trialCount: number, scenarioCount: number, preambleVersionId?: string | null, levelPresetVersionId?: string | null, isForked: boolean, resolvedContent: unknown, localContent: unknown, domain?: { __typename?: 'Domain', id: string, name: string } | null, trialConfig: { __typename?: 'TrialConfigSummary', definitionVersion?: number | null, temperature?: number | null, signature?: string | null, isConsistent: boolean, message?: string | null, signatureBreakdown: Array<{ __typename?: 'TrialSignatureBreakdown', signature: string, definitionVersion?: number | null, temperature?: number | null, trialCount: number }> }, preambleVersion?: { __typename?: 'PreambleVersion', id: string, version: string, content: string, preamble?: { __typename?: 'Preamble', name: string } | null } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string, createdAt: string }>, parent?: { __typename?: 'Definition', id: string, name: string } | null, children: Array<{ __typename?: 'Definition', id: string, name: string, createdAt: string }>, overrides: { __typename?: 'DefinitionOverrides', template: boolean, dimensions: boolean, matchingRules: boolean }, inheritedTags: Array<{ __typename?: 'Tag', id: string, name: string, createdAt: string }>, allTags: Array<{ __typename?: 'Tag', id: string, name: string, createdAt: string }>, expansionStatus: { __typename?: 'ExpansionStatus', status: ExpansionJobStatus, jobId?: string | null, triggeredBy?: string | null, createdAt?: string | null, completedAt?: string | null, error?: string | null, scenarioCount: number, progress?: { __typename?: 'ExpansionProgress', phase: string, expectedScenarios: number, generatedScenarios: number, inputTokens: number, outputTokens: number, message: string, updatedAt: string } | null } } | null };

export type DefinitionAncestorsQueryVariables = Exact<{
  id: Scalars['ID']['input'];
  maxDepth?: InputMaybe<Scalars['Int']['input']>;
}>;


export type DefinitionAncestorsQuery = { __typename?: 'Query', definitionAncestors: Array<{ __typename?: 'Definition', id: string, name: string, parentId?: string | null, createdAt: string }> };

export type DefinitionDescendantsQueryVariables = Exact<{
  id: Scalars['ID']['input'];
  maxDepth?: InputMaybe<Scalars['Int']['input']>;
}>;


export type DefinitionDescendantsQuery = { __typename?: 'Query', definitionDescendants: Array<{ __typename?: 'Definition', id: string, name: string, parentId?: string | null, createdAt: string }> };

export type DefinitionCountQueryVariables = Exact<{
  rootOnly?: InputMaybe<Scalars['Boolean']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  tagIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  hasRuns?: InputMaybe<Scalars['Boolean']['input']>;
  domainId?: InputMaybe<Scalars['ID']['input']>;
  withoutDomain?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type DefinitionCountQuery = { __typename?: 'Query', definitionCount: number };

export type CreateDefinitionMutationVariables = Exact<{
  input: CreateDefinitionInput;
}>;


export type CreateDefinitionMutation = { __typename?: 'Mutation', createDefinition: { __typename?: 'Definition', id: string, name: string, parentId?: string | null, content: unknown, createdAt: string, updatedAt: string } };

export type UpdateDefinitionMutationVariables = Exact<{
  id: Scalars['String']['input'];
  input: UpdateDefinitionInput;
}>;


export type UpdateDefinitionMutation = { __typename?: 'Mutation', updateDefinition: { __typename?: 'Definition', id: string, name: string, content: unknown, updatedAt: string } };

export type ForkDefinitionMutationVariables = Exact<{
  input: ForkDefinitionInput;
}>;


export type ForkDefinitionMutation = { __typename?: 'Mutation', forkDefinition: { __typename?: 'Definition', id: string, name: string, parentId?: string | null, content: unknown, createdAt: string, isForked: boolean, resolvedContent: unknown, localContent: unknown, overrides: { __typename?: 'DefinitionOverrides', template: boolean, dimensions: boolean, matchingRules: boolean } } };

export type UnforkDefinitionMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type UnforkDefinitionMutation = { __typename?: 'Mutation', unforkDefinition: { __typename?: 'Definition', id: string, name: string, parentId?: string | null, content: unknown, updatedAt: string, version: number, isForked: boolean, resolvedContent: unknown, localContent: unknown, overrides: { __typename?: 'DefinitionOverrides', template: boolean, dimensions: boolean, matchingRules: boolean } } };

export type DeleteDefinitionMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type DeleteDefinitionMutation = { __typename?: 'Mutation', deleteDefinition: { __typename?: 'DeleteDefinitionResult', deletedIds: Array<string>, count: number } };

export type RegenerateScenariosMutationVariables = Exact<{
  definitionId: Scalars['String']['input'];
}>;


export type RegenerateScenariosMutation = { __typename?: 'Mutation', regenerateScenarios: { __typename?: 'RegenerateScenariosResult', definitionId: string, jobId?: string | null, queued: boolean } };

export type CancelScenarioExpansionMutationVariables = Exact<{
  definitionId: Scalars['String']['input'];
}>;


export type CancelScenarioExpansionMutation = { __typename?: 'Mutation', cancelScenarioExpansion: { __typename?: 'CancelExpansionResult', definitionId: string, cancelled: boolean, jobId?: string | null, message: string } };

export type DomainContextsQueryVariables = Exact<{
  domainId?: InputMaybe<Scalars['String']['input']>;
}>;


export type DomainContextsQuery = { __typename?: 'Query', domainContexts: Array<{ __typename?: 'DomainContext', id: string, domainId: string, text: string, version: number, updatedAt: string, domain?: { __typename?: 'Domain', id: string, name: string } | null }> };

export type CreateDomainContextMutationVariables = Exact<{
  input: CreateDomainContextInput;
}>;


export type CreateDomainContextMutation = { __typename?: 'Mutation', createDomainContext: { __typename?: 'DomainContext', id: string, domainId: string, text: string, version: number, updatedAt: string } };

export type UpdateDomainContextMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateDomainContextInput;
}>;


export type UpdateDomainContextMutation = { __typename?: 'Mutation', updateDomainContext: { __typename?: 'DomainContext', id: string, domainId: string, text: string, version: number, updatedAt: string } };

export type DeleteDomainContextMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteDomainContextMutation = { __typename?: 'Mutation', deleteDomainContext: boolean };

export type DomainAnalysisQueryVariables = Exact<{
  domainId: Scalars['ID']['input'];
  scope?: InputMaybe<Scalars['String']['input']>;
  signature?: InputMaybe<Scalars['String']['input']>;
}>;


export type DomainAnalysisQuery = { __typename?: 'Query', domainAnalysis: { __typename?: 'DomainAnalysisResult', domainId: string, domainName: string, totalDefinitions: number, targetedDefinitions: number, coveredDefinitions: number, missingDefinitionIds: Array<string>, definitionsWithAnalysis: number, cacheStatus: string, generatedAt: string, clusterAnalysisByMethod: unknown, contributionSummary: Array<{ __typename?: 'DomainAnalysisContributionSummary', domainId: string, domainName: string, rawTrialCount: number, share: number }>, excludedDataSummary: Array<{ __typename?: 'DomainAnalysisExcludedDataSummary', domainId: string, domainName: string, reasonCode: string, count: number }>, missingDefinitions: Array<{ __typename?: 'DomainAnalysisMissingDefinition', definitionId: string, definitionName: string, reasonCode: string, reasonLabel: string, missingAllModels: boolean, missingModelIds: Array<string>, missingModelLabels: Array<string> }>, models: Array<{ __typename?: 'DomainAnalysisModel', model: string, label: string, values: Array<{ __typename?: 'DomainAnalysisValueScore', valueKey: string, score: number, prioritized: number, deprioritized: number, neutral: number, totalComparisons: number }>, rankingShape: { __typename?: 'RankingShape', topStructure: string, bottomStructure: string, topGap: number, bottomGap: number, spread: number, steepness: number, dominanceZScore?: number | null } }>, unavailableModels: Array<{ __typename?: 'DomainAnalysisUnavailableModel', model: string, label: string, reason: string }>, rankingShapeBenchmarks: { __typename?: 'RankingShapeBenchmarks', domainMeanTopGap: number, domainStdTopGap?: number | null, medianSpread: number }, clusterAnalysis: { __typename?: 'ClusterAnalysis', skipped: boolean, skipReason?: string | null, defaultPair?: Array<string> | null, faultLinesByPair: unknown, clusters: Array<{ __typename?: 'DomainCluster', id: string, name: string, definingValues: Array<string>, centroid: unknown, members: Array<{ __typename?: 'ClusterMember', model: string, label: string, silhouetteScore: number, isOutlier: boolean, nearestClusterIds?: Array<string> | null, distancesToNearestClusters?: Array<number> | null }> }> } } };

export type RefreshDomainAnalysisMutationVariables = Exact<{
  domainId: Scalars['ID']['input'];
  signature?: InputMaybe<Scalars['String']['input']>;
}>;


export type RefreshDomainAnalysisMutation = { __typename?: 'Mutation', refreshDomainAnalysis: { __typename?: 'DomainAnalysisRefreshResult', success: boolean, mode: string, message: string } };

export type DomainAnalysisLegacyQueryVariables = Exact<{
  domainId: Scalars['ID']['input'];
}>;


export type DomainAnalysisLegacyQuery = { __typename?: 'Query', domainAnalysis: { __typename?: 'DomainAnalysisResult', domainId: string, domainName: string, totalDefinitions: number, targetedDefinitions: number, definitionsWithAnalysis: number, generatedAt: string, models: Array<{ __typename?: 'DomainAnalysisModel', model: string, label: string, values: Array<{ __typename?: 'DomainAnalysisValueScore', valueKey: string, score: number, prioritized: number, deprioritized: number, neutral: number, totalComparisons: number }> }>, unavailableModels: Array<{ __typename?: 'DomainAnalysisUnavailableModel', model: string, label: string, reason: string }> } };

export type DomainAnalysisValueDetailQueryVariables = Exact<{
  domainId: Scalars['ID']['input'];
  modelId: Scalars['String']['input'];
  valueKey: Scalars['String']['input'];
  signature?: InputMaybe<Scalars['String']['input']>;
}>;


export type DomainAnalysisValueDetailQuery = { __typename?: 'Query', domainAnalysisValueDetail: { __typename?: 'DomainAnalysisValueDetailResult', domainId: string, domainName: string, modelId: string, modelLabel: string, valueKey: string, score: number, prioritized: number, deprioritized: number, neutral: number, totalTrials: number, targetedDefinitions: number, coveredDefinitions: number, missingDefinitionIds: Array<string>, generatedAt: string, vignettes: Array<{ __typename?: 'DomainAnalysisVignetteDetail', definitionId: string, definitionName: string, definitionVersion: number, aggregateRunId?: string | null, otherValueKey: string, prioritized: number, deprioritized: number, neutral: number, totalTrials: number, selectedValueWinRate?: number | null, conditions: Array<{ __typename?: 'DomainAnalysisConditionDetail', scenarioId?: string | null, conditionName: string, dimensions?: unknown | null, prioritized: number, deprioritized: number, neutral: number, totalTrials: number, selectedValueWinRate?: number | null, strongly: number, somewhat: number, opponentSomewhat: number, opponentStrongly: number, unknownCount: number }> }> } };

export type DomainAnalysisConditionTranscriptsQueryVariables = Exact<{
  domainId: Scalars['ID']['input'];
  modelId: Scalars['String']['input'];
  valueKey: Scalars['String']['input'];
  definitionId: Scalars['ID']['input'];
  scenarioId?: InputMaybe<Scalars['ID']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  signature?: InputMaybe<Scalars['String']['input']>;
}>;


export type DomainAnalysisConditionTranscriptsQuery = { __typename?: 'Query', domainAnalysisConditionTranscripts: Array<{ __typename?: 'DomainAnalysisConditionTranscript', id: string, runId: string, scenarioId?: string | null, modelId: string, decisionModelV2?: unknown | null, turnCount: number, tokenCount: number, durationMs: number, createdAt: string, content: unknown }> };

export type DomainAvailableSignaturesQueryVariables = Exact<{
  domainId: Scalars['ID']['input'];
  scope?: InputMaybe<Scalars['String']['input']>;
}>;


export type DomainAvailableSignaturesQuery = { __typename?: 'Query', domainAvailableSignatures: Array<{ __typename?: 'DomainAvailableSignature', signature: string, label: string, isVirtual: boolean, temperature?: number | null }> };

export type DomainFindingsEligibilityQueryVariables = Exact<{
  domainId: Scalars['ID']['input'];
}>;


export type DomainFindingsEligibilityQuery = { __typename?: 'Query', domainFindingsEligibility: { __typename?: 'DomainFindingsEligibility', domainId: string, eligible: boolean, status: string, summary: string, reasons: Array<string>, recommendedActions: Array<string>, consideredScopeCategories: Array<string>, completedEligibleEvaluationCount: number, latestEligibleEvaluationId?: string | null, latestEligibleScopeCategory?: string | null, latestEligibleCompletedAt?: string | null } };

export type DomainValueCoverageQueryVariables = Exact<{
  domainId: Scalars['ID']['input'];
  modelIds?: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
  signature?: InputMaybe<Scalars['String']['input']>;
}>;


export type DomainValueCoverageQuery = { __typename?: 'Query', domainValueCoverage?: { __typename?: 'DomainValueCoverageResult', domainId: string, values: Array<string>, cells: Array<{ __typename?: 'DomainValueCoverageCell', valueA: string, valueB: string, batchEquivalent: number, aFirstBatchEquivalent: number, bFirstBatchEquivalent: number, aFirstDefinitionName?: string | null, bFirstDefinitionName?: string | null, contributingDefinitionIds: Array<string>, definitionId?: string | null, aggregateRunId?: string | null, weakestCondition?: { __typename?: 'CoverageWeakestCondition', conditionLabel: string, otherConditionsCount?: number | null, modelCounts: Array<{ __typename?: 'CoverageModelCount', modelId: string, label: string, trialCount: number }> } | null }>, availableModels: Array<{ __typename?: 'CoverageModelOption', modelId: string, label: string }> } | null };

export type DomainValueCoverageLegacyQueryVariables = Exact<{
  domainId: Scalars['ID']['input'];
  modelIds?: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
}>;


export type DomainValueCoverageLegacyQuery = { __typename?: 'Query', domainValueCoverage?: { __typename?: 'DomainValueCoverageResult', domainId: string, values: Array<string>, cells: Array<{ __typename?: 'DomainValueCoverageCell', valueA: string, valueB: string, batchEquivalent: number, aFirstBatchEquivalent: number, bFirstBatchEquivalent: number, aFirstDefinitionName?: string | null, bFirstDefinitionName?: string | null, contributingDefinitionIds: Array<string>, definitionId?: string | null, aggregateRunId?: string | null, weakestCondition?: { __typename?: 'CoverageWeakestCondition', conditionLabel: string, otherConditionsCount?: number | null, modelCounts: Array<{ __typename?: 'CoverageModelCount', modelId: string, label: string, trialCount: number }> } | null }>, availableModels: Array<{ __typename?: 'CoverageModelOption', modelId: string, label: string }> } | null };

export type DomainsQueryVariables = Exact<{
  search?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type DomainsQuery = { __typename?: 'Query', domains: Array<{ __typename?: 'Domain', id: string, name: string, createdAt: string, updatedAt: string, definitionCount: number, defaultLevelPresetVersionId?: string | null, defaultPreambleVersionId?: string | null, defaultContextId?: string | null, defaultModelIds: Array<string>, sentencePrefix?: string | null, labelPrefix?: string | null }> };

export type CreateDomainMutationVariables = Exact<{
  name: Scalars['String']['input'];
}>;


export type CreateDomainMutation = { __typename?: 'Mutation', createDomain: { __typename?: 'Domain', id: string, name: string, createdAt: string, updatedAt: string, definitionCount: number } };

export type RenameDomainMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  name: Scalars['String']['input'];
}>;


export type RenameDomainMutation = { __typename?: 'Mutation', renameDomain: { __typename?: 'Domain', id: string, name: string, createdAt: string, updatedAt: string, definitionCount: number } };

export type DeleteDomainMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteDomainMutation = { __typename?: 'Mutation', deleteDomain: { __typename?: 'DomainMutationResult', success: boolean, affectedDefinitions: number } };

export type AssignDomainToDefinitionsMutationVariables = Exact<{
  definitionIds: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
  domainId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type AssignDomainToDefinitionsMutation = { __typename?: 'Mutation', assignDomainToDefinitions: { __typename?: 'DomainMutationResult', success: boolean, affectedDefinitions: number } };

export type AssignDomainToDefinitionsByFilterMutationVariables = Exact<{
  domainId?: InputMaybe<Scalars['ID']['input']>;
  rootOnly?: InputMaybe<Scalars['Boolean']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  tagIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  hasRuns?: InputMaybe<Scalars['Boolean']['input']>;
  sourceDomainId?: InputMaybe<Scalars['ID']['input']>;
  withoutDomain?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type AssignDomainToDefinitionsByFilterMutation = { __typename?: 'Mutation', assignDomainToDefinitionsByFilter: { __typename?: 'DomainMutationResult', success: boolean, affectedDefinitions: number } };

export type RunTrialsForDomainMutationVariables = Exact<{
  domainId: Scalars['ID']['input'];
  temperature?: InputMaybe<Scalars['Float']['input']>;
  maxBudgetUsd?: InputMaybe<Scalars['Float']['input']>;
  definitionIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
}>;


export type RunTrialsForDomainMutation = { __typename?: 'Mutation', runTrialsForDomain: { __typename?: 'DomainTrialRunResult', domainEvaluationId?: string | null, success: boolean, totalDefinitions: number, targetedDefinitions: number, startedRuns: number, failedDefinitions: number, skippedForBudget: number, projectedCostUsd: number, blockedByActiveLaunch: boolean, runs: Array<{ __typename?: 'DomainTrialRunEntry', definitionId: string, runId: string, modelIds: Array<string> }> } };

export type StartDomainEvaluationMutationVariables = Exact<{
  domainId: Scalars['ID']['input'];
  scopeCategory?: InputMaybe<Scalars['String']['input']>;
  temperature?: InputMaybe<Scalars['Float']['input']>;
  maxBudgetUsd?: InputMaybe<Scalars['Float']['input']>;
  definitionIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  modelIds?: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
  samplePercentage?: InputMaybe<Scalars['Int']['input']>;
  samplesPerScenario?: InputMaybe<Scalars['Int']['input']>;
  targetBatchCount?: InputMaybe<Scalars['Int']['input']>;
}>;


export type StartDomainEvaluationMutation = { __typename?: 'Mutation', startDomainEvaluation: { __typename?: 'DomainTrialRunResult', domainEvaluationId?: string | null, scopeCategory: string, success: boolean, totalDefinitions: number, targetedDefinitions: number, startedRuns: number, failedDefinitions: number, skippedForBudget: number, projectedCostUsd: number, blockedByActiveLaunch: boolean, runs: Array<{ __typename?: 'DomainTrialRunEntry', definitionId: string, runId: string, modelIds: Array<string> }> } };

export type DomainEvaluationsQueryVariables = Exact<{
  domainId: Scalars['ID']['input'];
  scopeCategory?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type DomainEvaluationsQuery = { __typename?: 'Query', domainEvaluations: Array<{ __typename?: 'DomainEvaluation', id: string, domainId: string, domainNameAtLaunch: string, scopeCategory: string, status: string, createdAt: string, startedAt?: string | null, completedAt?: string | null, startedRuns: number, failedDefinitions: number, skippedForBudget: number, projectedCostUsd: number, models: Array<string>, temperature?: number | null, maxBudgetUsd?: number | null, memberCount: number, launchableDefinitionIds: Array<string>, samplePercentage?: number | null, samplesPerScenario?: number | null, targetBatchCount?: number | null }> };

export type DomainEvaluationQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DomainEvaluationQuery = { __typename?: 'Query', domainEvaluation?: { __typename?: 'DomainEvaluation', id: string, domainId: string, domainNameAtLaunch: string, scopeCategory: string, status: string, createdAt: string, startedAt?: string | null, completedAt?: string | null, startedRuns: number, failedDefinitions: number, skippedForBudget: number, projectedCostUsd: number, models: Array<string>, temperature?: number | null, maxBudgetUsd?: number | null, memberCount: number, launchableDefinitionIds: Array<string>, samplePercentage?: number | null, samplesPerScenario?: number | null, targetBatchCount?: number | null, launchableDefinitions: Array<{ __typename?: 'DomainEvaluationLaunchableDefinition', definitionId: string, definitionName: string, pairKey?: string | null }>, members: Array<{ __typename?: 'DomainEvaluationMember', runId: string, definitionIdAtLaunch: string, definitionNameAtLaunch: string, domainIdAtLaunch: string, modelIds: Array<string>, createdAt: string, runStatus: string, runCategory: string, runStartedAt?: string | null, runCompletedAt?: string | null }> } | null };

export type DomainEvaluationStatusQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DomainEvaluationStatusQuery = { __typename?: 'Query', domainEvaluationStatus?: { __typename?: 'DomainEvaluationStatus', id: string, status: string, totalRuns: number, pendingRuns: number, runningRuns: number, completedRuns: number, failedRuns: number, cancelledRuns: number } | null };

export type DomainTrialsPlanQueryVariables = Exact<{
  domainId: Scalars['ID']['input'];
  temperature?: InputMaybe<Scalars['Float']['input']>;
  definitionIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  scopeCategory?: InputMaybe<Scalars['String']['input']>;
}>;


export type DomainTrialsPlanQuery = { __typename?: 'Query', domainTrialsPlan: { __typename?: 'DomainTrialPlanResult', domainId: string, domainName: string, totalEstimatedCost: number, existingTemperatures: Array<number>, defaultTemperature?: number | null, temperatureWarning?: string | null, vignettes: Array<{ __typename?: 'DomainTrialPlanVignette', definitionId: string, definitionName: string, definitionVersion: number, signature: string, scenarioCount: number, existingBatchCount: number }>, models: Array<{ __typename?: 'DomainTrialPlanModel', modelId: string, label: string, isDefault: boolean, supportsTemperature: boolean }>, cellEstimates: Array<{ __typename?: 'DomainTrialPlanCellEstimate', definitionId: string, modelId: string, estimatedCost: number }> } };

export type EstimateDomainEvaluationCostQueryVariables = Exact<{
  domainId: Scalars['ID']['input'];
  definitionIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  modelIds?: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
  temperature?: InputMaybe<Scalars['Float']['input']>;
  samplePercentage?: InputMaybe<Scalars['Int']['input']>;
  samplesPerScenario?: InputMaybe<Scalars['Int']['input']>;
  scopeCategory?: InputMaybe<Scalars['String']['input']>;
}>;


export type EstimateDomainEvaluationCostQuery = { __typename?: 'Query', estimateDomainEvaluationCost: { __typename?: 'DomainEvaluationCostEstimate', domainId: string, domainName: string, scopeCategory: string, targetedDefinitions: number, totalScenarioCount: number, totalEstimatedCost: number, basedOnSampleCount: number, isUsingFallback: boolean, fallbackReason?: string | null, estimateConfidence: string, knownExclusions: Array<string>, existingTemperatures: Array<number>, defaultTemperature?: number | null, temperatureWarning?: string | null, models: Array<{ __typename?: 'DomainEvaluationEstimateModel', modelId: string, label: string, isDefault: boolean, supportsTemperature: boolean, estimatedCost: number, basedOnSampleCount: number, isUsingFallback: boolean }>, definitions: Array<{ __typename?: 'DomainEvaluationEstimateDefinition', definitionId: string, definitionName: string, definitionVersion: number, signature: string, scenarioCount: number, estimatedCost: number, basedOnSampleCount: number, isUsingFallback: boolean }> } };

export type DomainTrialRunsStatusQueryVariables = Exact<{
  runIds: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
}>;


export type DomainTrialRunsStatusQuery = { __typename?: 'Query', domainTrialRunsStatus: Array<{ __typename?: 'DomainTrialRunStatus', runId: string, definitionId: string, status: string, updatedAt: string, stalledModels: Array<string>, analysisStatus?: string | null, modelStatuses: Array<{ __typename?: 'DomainTrialModelStatus', modelId: string, generationCompleted: number, generationFailed: number, generationTotal: number, summarizationCompleted: number, summarizationFailed: number, summarizationTotal: number, latestErrorMessage?: string | null }> }> };

export type DomainSettingsQueryVariables = Exact<{
  domainId: Scalars['ID']['input'];
}>;


export type DomainSettingsQuery = { __typename?: 'Query', domainSettings?: { __typename?: 'DomainSettings', domainId: string, preambleVersionId?: string | null, levelPresetVersionId?: string | null, contextId?: string | null, defaultModelIds: Array<string>, sentencePrefix?: string | null, labelPrefix?: string | null, valueStatements: Array<{ __typename?: 'ValueStatementWithVersions', id: string, token: string, currentContent: string, previousContent?: string | null }> } | null };

export type DomainConfigSnapshotsQueryVariables = Exact<{
  domainId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type DomainConfigSnapshotsQuery = { __typename?: 'Query', domainConfigSnapshots: Array<{ __typename?: 'DomainConfigSnapshotSummary', id: string, createdAt: string, preambleLabel?: string | null, levelPresetLabel?: string | null, contextLabel?: string | null, valueStatementCount: number }> };

export type SetDomainSettingsMutationVariables = Exact<{
  domainId: Scalars['ID']['input'];
  preambleVersionId?: InputMaybe<Scalars['ID']['input']>;
  levelPresetVersionId?: InputMaybe<Scalars['ID']['input']>;
  contextId?: InputMaybe<Scalars['ID']['input']>;
  sentencePrefix?: InputMaybe<Scalars['String']['input']>;
  labelPrefix?: InputMaybe<Scalars['String']['input']>;
  valueStatements: Array<ValueStatementInput> | ValueStatementInput;
}>;


export type SetDomainSettingsMutation = { __typename?: 'Mutation', setDomainSettings: { __typename?: 'Domain', id: string, name: string, defaultPreambleVersionId?: string | null, defaultLevelPresetVersionId?: string | null, defaultContextId?: string | null, defaultModelIds: Array<string> } };

export type BackfillDomainEvaluationModelsMutationVariables = Exact<{
  domainEvaluationId: Scalars['ID']['input'];
  modelIds: Array<Scalars['String']['input']> | Scalars['String']['input'];
  definitionIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  targetBatchCount?: InputMaybe<Scalars['Int']['input']>;
}>;


export type BackfillDomainEvaluationModelsMutation = { __typename?: 'Mutation', backfillDomainEvaluationModels: { __typename?: 'DomainTrialRunResult', domainEvaluationId?: string | null, scopeCategory: string, success: boolean, totalDefinitions: number, targetedDefinitions: number, startedRuns: number, failedDefinitions: number, skippedForBudget: number, projectedCostUsd: number, blockedByActiveLaunch: boolean, runs: Array<{ __typename?: 'DomainTrialRunEntry', definitionId: string, runId: string, modelIds: Array<string> }> } };

export type EnsureDomainVignettePairMutationVariables = Exact<{
  input: EnsureDomainVignettePairInput;
}>;


export type EnsureDomainVignettePairMutation = { __typename?: 'Mutation', ensureDomainVignettePair: { __typename?: 'EnsureDomainVignettePairResult', status: VignettePairStatus, definitionAId?: string | null, definitionBId?: string | null } };

export type SystemHealthQueryVariables = Exact<{
  refresh?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type SystemHealthQuery = { __typename?: 'Query', systemHealth: { __typename?: 'SystemHealth', providers: { __typename?: 'ProviderHealth', checkedAt: string, providers: Array<{ __typename?: 'ProviderHealthStatus', id: string, name: string, configured: boolean, connected: boolean, error?: string | null, remainingBudgetUsd?: number | null, lastChecked?: string | null }> }, queue: { __typename?: 'QueueHealth', isHealthy: boolean, isRunning: boolean, isPaused: boolean, activeJobs: number, pendingJobs: number, completedLast24h: number, failedLast24h: number, successRate?: number | null, error?: string | null, checkedAt: string, jobTypes?: Array<{ __typename?: 'JobTypeStatus', type: string, pending: number, active: number, completed: number, failed: number }> | null }, worker: { __typename?: 'WorkerHealth', isHealthy: boolean, pythonVersion?: string | null, packages: unknown, apiKeys: unknown, warnings: Array<string>, error?: string | null, checkedAt: string } } };

export type GetLevelPresetsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetLevelPresetsQuery = { __typename?: 'Query', levelPresets: Array<{ __typename?: 'LevelPreset', id: string, name: string, updatedAt: string, latestVersion?: { __typename?: 'LevelPresetVersion', id: string, version: string, l1: string, l2: string, l3: string, l4: string, l5: string, createdAt: string } | null }> };

export type CreateLevelPresetMutationVariables = Exact<{
  name: Scalars['String']['input'];
  l1: Scalars['String']['input'];
  l2: Scalars['String']['input'];
  l3: Scalars['String']['input'];
  l4: Scalars['String']['input'];
  l5: Scalars['String']['input'];
}>;


export type CreateLevelPresetMutation = { __typename?: 'Mutation', createLevelPreset: { __typename?: 'LevelPreset', id: string, name: string, latestVersion?: { __typename?: 'LevelPresetVersion', id: string, version: string, l1: string, l2: string, l3: string, l4: string, l5: string } | null } };

export type UpdateLevelPresetMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  l1: Scalars['String']['input'];
  l2: Scalars['String']['input'];
  l3: Scalars['String']['input'];
  l4: Scalars['String']['input'];
  l5: Scalars['String']['input'];
}>;


export type UpdateLevelPresetMutation = { __typename?: 'Mutation', updateLevelPreset: { __typename?: 'LevelPreset', id: string, name: string, updatedAt: string, latestVersion?: { __typename?: 'LevelPresetVersion', id: string, version: string, l1: string, l2: string, l3: string, l4: string, l5: string } | null } };

export type DeleteLevelPresetMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteLevelPresetMutation = { __typename?: 'Mutation', deleteLevelPreset: { __typename?: 'DeleteLevelPresetResult', id: string } };

export type LlmModelFieldsFragment = { __typename?: 'LlmModel', id: string, providerId: string, modelId: string, displayName: string, costInputPerMillion: number, costOutputPerMillion: number, status: string, isDefault: boolean, isAvailable: boolean, apiConfig?: unknown | null, createdAt: string, updatedAt: string };

export type LlmProviderFieldsFragment = { __typename?: 'LlmProvider', id: string, name: string, displayName: string, maxParallelRequests: number, requestsPerMinute: number, isEnabled: boolean, balance?: number | null, createdAt: string, updatedAt: string };

export type LlmProvidersQueryVariables = Exact<{ [key: string]: never; }>;


export type LlmProvidersQuery = { __typename?: 'Query', llmProviders: Array<{ __typename?: 'LlmProvider', id: string, name: string, displayName: string, maxParallelRequests: number, requestsPerMinute: number, isEnabled: boolean, balance?: number | null, createdAt: string, updatedAt: string, models: Array<{ __typename?: 'LlmModel', id: string, providerId: string, modelId: string, displayName: string, costInputPerMillion: number, costOutputPerMillion: number, status: string, isDefault: boolean, isAvailable: boolean, apiConfig?: unknown | null, createdAt: string, updatedAt: string }> }> };

export type LlmModelsQueryVariables = Exact<{
  providerId?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
}>;


export type LlmModelsQuery = { __typename?: 'Query', llmModels: Array<{ __typename?: 'LlmModel', id: string, providerId: string, modelId: string, displayName: string, costInputPerMillion: number, costOutputPerMillion: number, status: string, isDefault: boolean, isAvailable: boolean, apiConfig?: unknown | null, createdAt: string, updatedAt: string, provider: { __typename?: 'LlmProvider', id: string, name: string, displayName: string, maxParallelRequests: number, requestsPerMinute: number, isEnabled: boolean, balance?: number | null, createdAt: string, updatedAt: string } }> };

export type InfraModelQueryVariables = Exact<{
  purpose: Scalars['String']['input'];
}>;


export type InfraModelQuery = { __typename?: 'Query', infraModel?: { __typename?: 'LlmModel', id: string, providerId: string, modelId: string, displayName: string, costInputPerMillion: number, costOutputPerMillion: number, status: string, isDefault: boolean, isAvailable: boolean, apiConfig?: unknown | null, createdAt: string, updatedAt: string, provider: { __typename?: 'LlmProvider', id: string, name: string, displayName: string, maxParallelRequests: number, requestsPerMinute: number, isEnabled: boolean, balance?: number | null, createdAt: string, updatedAt: string } } | null };

export type CreateLlmModelMutationVariables = Exact<{
  input: CreateLlmModelInput;
}>;


export type CreateLlmModelMutation = { __typename?: 'Mutation', createLlmModel: { __typename?: 'LlmModel', id: string, providerId: string, modelId: string, displayName: string, costInputPerMillion: number, costOutputPerMillion: number, status: string, isDefault: boolean, isAvailable: boolean, apiConfig?: unknown | null, createdAt: string, updatedAt: string } };

export type UpdateLlmModelMutationVariables = Exact<{
  id: Scalars['String']['input'];
  input: UpdateLlmModelInput;
}>;


export type UpdateLlmModelMutation = { __typename?: 'Mutation', updateLlmModel: { __typename?: 'LlmModel', id: string, providerId: string, modelId: string, displayName: string, costInputPerMillion: number, costOutputPerMillion: number, status: string, isDefault: boolean, isAvailable: boolean, apiConfig?: unknown | null, createdAt: string, updatedAt: string } };

export type DeprecateLlmModelMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type DeprecateLlmModelMutation = { __typename?: 'Mutation', deprecateLlmModel: { __typename?: 'DeprecateModelResult', model: { __typename?: 'LlmModel', id: string, providerId: string, modelId: string, displayName: string, costInputPerMillion: number, costOutputPerMillion: number, status: string, isDefault: boolean, isAvailable: boolean, apiConfig?: unknown | null, createdAt: string, updatedAt: string }, newDefault?: { __typename?: 'LlmModel', id: string, providerId: string, modelId: string, displayName: string, costInputPerMillion: number, costOutputPerMillion: number, status: string, isDefault: boolean, isAvailable: boolean, apiConfig?: unknown | null, createdAt: string, updatedAt: string } | null } };

export type ReactivateLlmModelMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type ReactivateLlmModelMutation = { __typename?: 'Mutation', reactivateLlmModel: { __typename?: 'LlmModel', id: string, providerId: string, modelId: string, displayName: string, costInputPerMillion: number, costOutputPerMillion: number, status: string, isDefault: boolean, isAvailable: boolean, apiConfig?: unknown | null, createdAt: string, updatedAt: string } };

export type SetDefaultLlmModelMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type SetDefaultLlmModelMutation = { __typename?: 'Mutation', setDefaultLlmModel: { __typename?: 'SetDefaultModelResult', model: { __typename?: 'LlmModel', id: string, providerId: string, modelId: string, displayName: string, costInputPerMillion: number, costOutputPerMillion: number, status: string, isDefault: boolean, isAvailable: boolean, apiConfig?: unknown | null, createdAt: string, updatedAt: string }, previousDefault?: { __typename?: 'LlmModel', id: string, providerId: string, modelId: string, displayName: string, costInputPerMillion: number, costOutputPerMillion: number, status: string, isDefault: boolean, isAvailable: boolean, apiConfig?: unknown | null, createdAt: string, updatedAt: string } | null } };

export type UnsetDefaultLlmModelMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type UnsetDefaultLlmModelMutation = { __typename?: 'Mutation', unsetDefaultLlmModel: { __typename?: 'LlmModel', id: string, providerId: string, modelId: string, displayName: string, costInputPerMillion: number, costOutputPerMillion: number, status: string, isDefault: boolean, isAvailable: boolean, apiConfig?: unknown | null, createdAt: string, updatedAt: string } };

export type UpdateLlmProviderMutationVariables = Exact<{
  id: Scalars['String']['input'];
  input: UpdateLlmProviderInput;
}>;


export type UpdateLlmProviderMutation = { __typename?: 'Mutation', updateLlmProvider: { __typename?: 'LlmProvider', id: string, name: string, displayName: string, maxParallelRequests: number, requestsPerMinute: number, isEnabled: boolean, balance?: number | null, createdAt: string, updatedAt: string } };

export type UpdateSystemSettingMutationVariables = Exact<{
  input: UpdateSystemSettingInput;
}>;


export type UpdateSystemSettingMutation = { __typename?: 'Mutation', updateSystemSetting: { __typename?: 'SystemSetting', id: string, key: string, value: unknown, updatedAt: string } };

export type SetProviderBalanceMutationVariables = Exact<{
  providerId: Scalars['String']['input'];
  balance?: InputMaybe<Scalars['Float']['input']>;
}>;


export type SetProviderBalanceMutation = { __typename?: 'Mutation', setProviderBalance: { __typename?: 'LlmProvider', id: string, name: string, displayName: string, maxParallelRequests: number, requestsPerMinute: number, isEnabled: boolean, balance?: number | null, createdAt: string, updatedAt: string } };

export type AvailableModelsQueryVariables = Exact<{ [key: string]: never; }>;


export type AvailableModelsQuery = { __typename?: 'Query', availableModels: Array<{ __typename?: 'AvailableModel', id: string, providerId: string, displayName: string, versions: Array<string>, defaultVersion?: string | null, isAvailable: boolean, isDefault: boolean }> };

export type ModelsAnalysisQueryVariables = Exact<{
  domainId?: InputMaybe<Scalars['ID']['input']>;
  signature?: InputMaybe<Scalars['String']['input']>;
}>;


export type ModelsAnalysisQuery = { __typename?: 'Query', modelsAnalysis: { __typename?: 'ModelsAnalysisResult', models: Array<{ __typename?: 'ModelsAnalysisModelResult', modelId: string, label: string, values: Array<{ __typename?: 'ModelsAnalysisValueResult', valueKey: string, pooledWinRate?: number | null, stabilityScore?: number | null, eligibleDomainCount: number, domains: Array<{ __typename?: 'ModelsAnalysisDomainBreakdown', domainId: string, domainName: string, winRate: number, evidenceWeight?: number | null }> }> }> } };

export type ModelsConfidenceQueryVariables = Exact<{
  signature?: InputMaybe<Scalars['String']['input']>;
  domainId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type ModelsConfidenceQuery = { __typename?: 'Query', modelsConfidence: { __typename?: 'ModelsConfidenceResult', models: Array<{ __typename?: 'ModelsConfidenceModelResult', modelId: string, label: string, overallConfidence?: number | null, overallStrongCount: number, overallLeanCount: number, values: Array<{ __typename?: 'ModelsConfidenceValueResult', valueKey: string, confidence?: number | null, strongCount: number, leanCount: number }> }> } };

export type ModelsConsistencyQueryVariables = Exact<{
  domainId?: InputMaybe<Scalars['ID']['input']>;
  providerId?: InputMaybe<Scalars['ID']['input']>;
  minScenarios?: InputMaybe<Scalars['Int']['input']>;
  signature: Scalars['String']['input'];
}>;


export type ModelsConsistencyQuery = { __typename?: 'Query', modelsConsistency: { __typename?: 'ModelsConsistencyResult', models: Array<{ __typename?: 'ModelConsistency', modelId: string, label: string, providerName: string, repeatability: { __typename?: 'Repeatability', value: number, ciLow: number, ciHigh: number, withinScenarioSd: number, betweenScenarioSd: number, scenariosMeasured: number, perDomain: Array<{ __typename?: 'ConsistencyPerDomain', domainId: string, domainName: string, value: number, ciLow: number, ciHigh: number, scenariosMeasured: number }>, perScenario: Array<{ __typename?: 'ConsistencyPerScenario', scenarioId: string, matches: number, trials: number, p: number, ciLow: number, ciHigh: number }> }, coherence: { __typename?: 'Coherence', value: number, coherentPairs: number, determinatePairs: number, indeterminatePairs: number, perPair: Array<{ __typename?: 'ConsistencyPerPair', domainId: string, valueKey: string, rho?: number | null, pValue?: number | null, coherent: boolean, determinate: boolean, targetAnalysisRunId?: string | null, targetCompanionRunId?: string | null, primaryConditionIds: Array<string>, companionConditionIds: Array<string>, perCondition: Array<{ __typename?: 'ConsistencyPerCondition', scenarioId: string, netPressureRank: number, winRate?: number | null, matches: number, trials: number }> }> }, orderEffect: { __typename?: 'OrderEffect', samePct: number, flippedPct: number, noisyPct: number, notApplicable: boolean } }>, insufficient: Array<{ __typename?: 'InsufficientModel', modelId: string, label: string, providerName: string, reason: string }> } };

export type CreatePairedVignetteMutationVariables = Exact<{
  input: CreatePairedVignetteInput;
}>;


export type CreatePairedVignetteMutation = { __typename?: 'Mutation', createPairedVignette: { __typename?: 'CreatePairedVignetteResult', definitionA: { __typename?: 'Definition', id: string, name: string }, definitionB: { __typename?: 'Definition', id: string, name: string } } };

export type UpdatePairedVignetteMutationVariables = Exact<{
  input: UpdatePairedVignetteInput;
}>;


export type UpdatePairedVignetteMutation = { __typename?: 'Mutation', updatePairedVignette: { __typename?: 'CreatePairedVignetteResult', definitionA: { __typename?: 'Definition', id: string, name: string }, definitionB: { __typename?: 'Definition', id: string, name: string } } };

export type PairwiseWinRatesQueryVariables = Exact<{
  domainId?: InputMaybe<Scalars['ID']['input']>;
  signature?: InputMaybe<Scalars['String']['input']>;
}>;


export type PairwiseWinRatesQuery = { __typename?: 'Query', pairwiseWinRates: { __typename?: 'PairwiseWinRatesResult', models: Array<{ __typename?: 'ModelPairwiseWinRates', modelId: string, label: string, valueOrder: Array<string>, winRateMatrix: Array<Array<number | null>>, trialCountMatrix: Array<Array<number>> }> } };

export type PressureSensitivityQueryVariables = Exact<{
  domainId?: InputMaybe<Scalars['ID']['input']>;
  definitionId?: InputMaybe<Scalars['ID']['input']>;
  modelIds?: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
  signature: Scalars['String']['input'];
}>;


export type PressureSensitivityQuery = { __typename?: 'Query', pressureSensitivity: { __typename?: 'PressureSensitivityResult', pressureConditionExcludedCount: number, transcriptCapHit: boolean, models: Array<{ __typename?: 'PressureSensitivityModel', modelId: string, label: string, providerName: string, unscoredCount: number, pushedForEffect?: number | null, pushedAgainstEffect?: number | null, pushedEffectPairsUsed: number, domainPressureEffects: Array<{ __typename?: 'DomainPressureEffect', domainId: string, domainName: string, pushedForEffect?: number | null }>, pressureResponseSummary: { __typename?: 'PressureResponseSummary', mean?: number | null, rangeMin?: number | null, rangeMax?: number | null, pairsMeasured: number }, valueRates: Array<{ __typename?: 'PressureSensitivityValueRate', valueToken: string, valueLabel: string, averageWinRate?: number | null, balancedWinRate?: number | null, highPressureOnThisValueWinRate?: number | null, highPressureOnOpposingValueWinRate?: number | null, pairsMeasured: number }>, valuePairs: Array<{ __typename?: 'PressureSensitivityValuePair', pairKey: string, firstValueToken: string, firstValueLabel: string, secondValueToken: string, secondValueLabel: string, n: number, unscoredCount: number, definitionsMeasured: number, directionBalancedWinRate?: number | null, directionBalancedOpponentWinRate?: number | null, directionBalancedBalancedWinRate?: number | null, directionBalancedBalancedOpponentWinRate?: number | null, directionBalancedHighPressureOwnWinRate?: number | null, directionBalancedHighPressureOwnOpponentWinRate?: number | null, directionBalancedHighPressureOpponentWinRate?: number | null, directionBalancedHighPressureOpponentOpponentWinRate?: number | null, pressureResponse: { __typename?: 'PressureResponse', value?: number | null, baselineRate?: number | null, pushTowardFirstRate?: number | null, pushTowardSecondRate?: number | null, qualifyingTrials: number, ciLow?: number | null, ciHigh?: number | null, reason?: string | null }, grid: Array<{ __typename?: 'SensitivityCell', ownLevel: number, opponentLevel: number, n: number, unscoredCount: number, winRate?: number | null, opponentWinRate?: number | null, conviction?: number | null, netScore?: number | null, lowData: boolean }> }> }>, insufficient: Array<{ __typename?: 'InsufficientPressureSensitivityModel', modelId: string, label: string, providerName: string, reason: string }>, excludedDefinitions: Array<{ __typename?: 'ExcludedDefinition', definitionId: string, name: string, reason: string }>, pressureConditionExclusionBreakdown: { __typename?: 'PressureConditionExclusionBreakdown', sourceRunMapping: number, definitionMetadata: number, missingScenario: number, invalidMetadata: number, levelAssignment: number }, directionalSanityCheck: { __typename?: 'DirectionalSanityCheck', positivePct: number, flatPct: number, negativePct: number, measuredCount: number, unmeasurableCount: number, breakdown: Array<{ __typename?: 'DirectionalSanityCheckEntry', modelId: string, pairKey: string, pressureResponse: number, classification: string }> } } };

export type OpenRunAnomaliesQueryVariables = Exact<{
  domainId?: InputMaybe<Scalars['ID']['input']>;
  type?: InputMaybe<RunAnomalyType>;
}>;


export type OpenRunAnomaliesQuery = { __typename?: 'Query', openRunAnomalies: Array<{ __typename?: 'RunAnomaly', id: string, runId: string, type: RunAnomalyType, subject: string, source: RunAnomalySource, details: unknown, firstSeenAt: string, lastSeenAt: string, displayLabel: string, displaySubject: string, reprobeEligible: boolean, reprobeCount: number, reprobeLimitReached: boolean, reprobeStage?: string | null, estimatedCost?: number | null, activeTranscriptId?: string | null, scenarioName?: string | null, dimensionValues?: unknown | null, run: { __typename?: 'Run', id: string, name?: string | null, status: string }, domain?: { __typename?: 'Domain', id: string, name: string } | null }> };

export type ReprobeAnomalySlotMutationVariables = Exact<{
  anomalyId: Scalars['ID']['input'];
}>;


export type ReprobeAnomalySlotMutation = { __typename?: 'Mutation', reprobeAnomalySlot: { __typename?: 'RunAnomaly', id: string, lastSeenAt: string, reprobeCount: number, reprobeLimitReached: boolean } };

export type ResolveRunAnomalyMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type ResolveRunAnomalyMutation = { __typename?: 'Mutation', resolveRunAnomaly: { __typename?: 'RunAnomaly', id: string, resolvedAt?: string | null } };

export type RunFieldsFragment = { __typename?: 'Run', id: string, name?: string | null, definitionId: string, definitionVersion?: number | null, experimentId?: string | null, status: string, runCategory: string, config: unknown, stalledModels: Array<string>, companionRunId?: string | null, isAggregate: boolean, pairedBatchGroupId?: string | null, progress?: unknown | null, startedAt?: string | null, completedAt?: string | null, createdAt: string, updatedAt: string, lastAccessedAt?: string | null, transcriptCount: number, analysisStatus?: string | null, definitionSnapshot?: unknown | null, runProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number, byModel?: Array<{ __typename?: 'ByModelProgress', modelId: string, completed: number, failed: number }> | null } | null, summarizeProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number } | null, unresolvableTranscriptCount?: { __typename?: 'UnresolvableCount', total: number, byModel: Array<{ __typename?: 'UnresolvableByModel', modelId: string, count: number }> } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, definition?: { __typename?: 'Definition', id: string, name: string, version: number, content: unknown, domain?: { __typename?: 'Domain', name: string } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, pairedSibling?: { __typename?: 'Definition', id: string, name: string, content: unknown } | null } | null };

export type RunWithTranscriptsFieldsFragment = { __typename?: 'Run', id: string, name?: string | null, definitionId: string, definitionVersion?: number | null, experimentId?: string | null, status: string, runCategory: string, config: unknown, stalledModels: Array<string>, companionRunId?: string | null, isAggregate: boolean, pairedBatchGroupId?: string | null, progress?: unknown | null, startedAt?: string | null, completedAt?: string | null, createdAt: string, updatedAt: string, lastAccessedAt?: string | null, transcriptCount: number, analysisStatus?: string | null, definitionSnapshot?: unknown | null, failedProbes: Array<{ __typename?: 'ProbeResult', modelId: string, errorCode?: string | null, errorMessage?: string | null }>, transcripts: Array<{ __typename?: 'Transcript', id: string, runId: string, scenarioId?: string | null, modelId: string, modelVersion?: string | null, content: unknown, decisionMetadata?: unknown | null, turnCount: number, tokenCount: number, durationMs: number, estimatedCost?: number | null, createdAt: string, lastAccessedAt?: string | null, dimensionValues?: unknown | null, decisionModelV2?: unknown | null }>, analysis?: { __typename?: 'AnalysisResult', actualCost?: { __typename?: 'ActualCost', total: number, perModel: Array<{ __typename?: 'ActualModelCost', modelId: string, inputTokens: number, outputTokens: number, cost: number, probeCount: number }> } | null } | null, recentTasks: Array<{ __typename?: 'TaskResult', scenarioId: string, modelId: string, status: string, error?: string | null, completedAt?: string | null }>, executionMetrics?: { __typename?: 'ExecutionMetrics', totalActive: number, totalQueued: number, estimatedSecondsRemaining?: number | null, totalRetries: number, providers: Array<{ __typename?: 'ProviderExecutionMetrics', provider: string, activeJobs: number, queuedJobs: number, maxParallel: number, requestsPerMinute: number, activeModelIds: Array<string>, recentCompletions: Array<{ __typename?: 'CompletionEvent', modelId: string, scenarioId: string, success: boolean, completedAt: string, durationMs: number }> }> } | null, runProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number, byModel?: Array<{ __typename?: 'ByModelProgress', modelId: string, completed: number, failed: number }> | null } | null, summarizeProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number } | null, unresolvableTranscriptCount?: { __typename?: 'UnresolvableCount', total: number, byModel: Array<{ __typename?: 'UnresolvableByModel', modelId: string, count: number }> } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, definition?: { __typename?: 'Definition', id: string, name: string, version: number, content: unknown, domain?: { __typename?: 'Domain', name: string } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, pairedSibling?: { __typename?: 'Definition', id: string, name: string, content: unknown } | null } | null };

export type RunsQueryVariables = Exact<{
  definitionId?: InputMaybe<Scalars['String']['input']>;
  experimentId?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  runCategory?: InputMaybe<Scalars['String']['input']>;
  hasAnalysis?: InputMaybe<Scalars['Boolean']['input']>;
  analysisStatus?: InputMaybe<Scalars['String']['input']>;
  runType?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type RunsQuery = { __typename?: 'Query', runs: Array<{ __typename?: 'Run', id: string, name?: string | null, definitionId: string, definitionVersion?: number | null, experimentId?: string | null, status: string, runCategory: string, config: unknown, stalledModels: Array<string>, companionRunId?: string | null, isAggregate: boolean, pairedBatchGroupId?: string | null, progress?: unknown | null, startedAt?: string | null, completedAt?: string | null, createdAt: string, updatedAt: string, lastAccessedAt?: string | null, transcriptCount: number, analysisStatus?: string | null, definitionSnapshot?: unknown | null, runProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number, byModel?: Array<{ __typename?: 'ByModelProgress', modelId: string, completed: number, failed: number }> | null } | null, summarizeProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number } | null, unresolvableTranscriptCount?: { __typename?: 'UnresolvableCount', total: number, byModel: Array<{ __typename?: 'UnresolvableByModel', modelId: string, count: number }> } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, definition?: { __typename?: 'Definition', id: string, name: string, version: number, content: unknown, domain?: { __typename?: 'Domain', name: string } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, pairedSibling?: { __typename?: 'Definition', id: string, name: string, content: unknown } | null } | null }> };

export type RunCountQueryVariables = Exact<{
  definitionId?: InputMaybe<Scalars['String']['input']>;
  experimentId?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  runCategory?: InputMaybe<Scalars['String']['input']>;
  hasAnalysis?: InputMaybe<Scalars['Boolean']['input']>;
  analysisStatus?: InputMaybe<Scalars['String']['input']>;
  runType?: InputMaybe<Scalars['String']['input']>;
}>;


export type RunCountQuery = { __typename?: 'Query', runCount: number };

export type AnalysisFolderCountsQueryVariables = Exact<{
  definitionId?: InputMaybe<Scalars['String']['input']>;
  definitionTagIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  experimentId?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  runCategory?: InputMaybe<Scalars['String']['input']>;
  analysisStatus?: InputMaybe<Scalars['String']['input']>;
  runType?: InputMaybe<Scalars['String']['input']>;
}>;


export type AnalysisFolderCountsQuery = { __typename?: 'Query', analysisFolderCounts: { __typename?: 'AnalysisFolderCounts', aggregateCount: number, untaggedCount: number, aggregateUntaggedCount: number, tagCounts: Array<{ __typename?: 'AnalysisFolderTagCount', tagId: string, name: string, count: number }>, aggregateTagCounts: Array<{ __typename?: 'AnalysisFolderTagCount', tagId: string, name: string, count: number }> } };

export type RunQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type RunQuery = { __typename?: 'Query', run?: { __typename?: 'Run', id: string, name?: string | null, definitionId: string, definitionVersion?: number | null, experimentId?: string | null, status: string, runCategory: string, config: unknown, stalledModels: Array<string>, companionRunId?: string | null, isAggregate: boolean, pairedBatchGroupId?: string | null, progress?: unknown | null, startedAt?: string | null, completedAt?: string | null, createdAt: string, updatedAt: string, lastAccessedAt?: string | null, transcriptCount: number, analysisStatus?: string | null, definitionSnapshot?: unknown | null, failedProbes: Array<{ __typename?: 'ProbeResult', modelId: string, errorCode?: string | null, errorMessage?: string | null }>, transcripts: Array<{ __typename?: 'Transcript', id: string, runId: string, scenarioId?: string | null, modelId: string, modelVersion?: string | null, content: unknown, decisionMetadata?: unknown | null, turnCount: number, tokenCount: number, durationMs: number, estimatedCost?: number | null, createdAt: string, lastAccessedAt?: string | null, dimensionValues?: unknown | null, decisionModelV2?: unknown | null }>, analysis?: { __typename?: 'AnalysisResult', actualCost?: { __typename?: 'ActualCost', total: number, perModel: Array<{ __typename?: 'ActualModelCost', modelId: string, inputTokens: number, outputTokens: number, cost: number, probeCount: number }> } | null } | null, recentTasks: Array<{ __typename?: 'TaskResult', scenarioId: string, modelId: string, status: string, error?: string | null, completedAt?: string | null }>, executionMetrics?: { __typename?: 'ExecutionMetrics', totalActive: number, totalQueued: number, estimatedSecondsRemaining?: number | null, totalRetries: number, providers: Array<{ __typename?: 'ProviderExecutionMetrics', provider: string, activeJobs: number, queuedJobs: number, maxParallel: number, requestsPerMinute: number, activeModelIds: Array<string>, recentCompletions: Array<{ __typename?: 'CompletionEvent', modelId: string, scenarioId: string, success: boolean, completedAt: string, durationMs: number }> }> } | null, runProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number, byModel?: Array<{ __typename?: 'ByModelProgress', modelId: string, completed: number, failed: number }> | null } | null, summarizeProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number } | null, unresolvableTranscriptCount?: { __typename?: 'UnresolvableCount', total: number, byModel: Array<{ __typename?: 'UnresolvableByModel', modelId: string, count: number }> } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, definition?: { __typename?: 'Definition', id: string, name: string, version: number, content: unknown, domain?: { __typename?: 'Domain', name: string } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, pairedSibling?: { __typename?: 'Definition', id: string, name: string, content: unknown } | null } | null } | null };

export type StartRunMutationVariables = Exact<{
  input: StartRunInput;
}>;


export type StartRunMutation = { __typename?: 'Mutation', startRun: { __typename?: 'StartRunPayload', jobCount: number, pairedRunIds?: Array<string> | null, run: { __typename?: 'Run', id: string, name?: string | null, definitionId: string, definitionVersion?: number | null, experimentId?: string | null, status: string, runCategory: string, config: unknown, stalledModels: Array<string>, companionRunId?: string | null, isAggregate: boolean, pairedBatchGroupId?: string | null, progress?: unknown | null, startedAt?: string | null, completedAt?: string | null, createdAt: string, updatedAt: string, lastAccessedAt?: string | null, transcriptCount: number, analysisStatus?: string | null, definitionSnapshot?: unknown | null, runProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number, byModel?: Array<{ __typename?: 'ByModelProgress', modelId: string, completed: number, failed: number }> | null } | null, summarizeProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number } | null, unresolvableTranscriptCount?: { __typename?: 'UnresolvableCount', total: number, byModel: Array<{ __typename?: 'UnresolvableByModel', modelId: string, count: number }> } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, definition?: { __typename?: 'Definition', id: string, name: string, version: number, content: unknown, domain?: { __typename?: 'Domain', name: string } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, pairedSibling?: { __typename?: 'Definition', id: string, name: string, content: unknown } | null } | null } } };

export type PauseRunMutationVariables = Exact<{
  runId: Scalars['ID']['input'];
}>;


export type PauseRunMutation = { __typename?: 'Mutation', pauseRun: { __typename?: 'Run', id: string, name?: string | null, definitionId: string, definitionVersion?: number | null, experimentId?: string | null, status: string, runCategory: string, config: unknown, stalledModels: Array<string>, companionRunId?: string | null, isAggregate: boolean, pairedBatchGroupId?: string | null, progress?: unknown | null, startedAt?: string | null, completedAt?: string | null, createdAt: string, updatedAt: string, lastAccessedAt?: string | null, transcriptCount: number, analysisStatus?: string | null, definitionSnapshot?: unknown | null, runProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number, byModel?: Array<{ __typename?: 'ByModelProgress', modelId: string, completed: number, failed: number }> | null } | null, summarizeProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number } | null, unresolvableTranscriptCount?: { __typename?: 'UnresolvableCount', total: number, byModel: Array<{ __typename?: 'UnresolvableByModel', modelId: string, count: number }> } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, definition?: { __typename?: 'Definition', id: string, name: string, version: number, content: unknown, domain?: { __typename?: 'Domain', name: string } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, pairedSibling?: { __typename?: 'Definition', id: string, name: string, content: unknown } | null } | null } };

export type ResumeRunMutationVariables = Exact<{
  runId: Scalars['ID']['input'];
}>;


export type ResumeRunMutation = { __typename?: 'Mutation', resumeRun: { __typename?: 'Run', id: string, name?: string | null, definitionId: string, definitionVersion?: number | null, experimentId?: string | null, status: string, runCategory: string, config: unknown, stalledModels: Array<string>, companionRunId?: string | null, isAggregate: boolean, pairedBatchGroupId?: string | null, progress?: unknown | null, startedAt?: string | null, completedAt?: string | null, createdAt: string, updatedAt: string, lastAccessedAt?: string | null, transcriptCount: number, analysisStatus?: string | null, definitionSnapshot?: unknown | null, runProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number, byModel?: Array<{ __typename?: 'ByModelProgress', modelId: string, completed: number, failed: number }> | null } | null, summarizeProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number } | null, unresolvableTranscriptCount?: { __typename?: 'UnresolvableCount', total: number, byModel: Array<{ __typename?: 'UnresolvableByModel', modelId: string, count: number }> } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, definition?: { __typename?: 'Definition', id: string, name: string, version: number, content: unknown, domain?: { __typename?: 'Domain', name: string } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, pairedSibling?: { __typename?: 'Definition', id: string, name: string, content: unknown } | null } | null } };

export type CancelRunMutationVariables = Exact<{
  runId: Scalars['ID']['input'];
}>;


export type CancelRunMutation = { __typename?: 'Mutation', cancelRun: { __typename?: 'Run', id: string, name?: string | null, definitionId: string, definitionVersion?: number | null, experimentId?: string | null, status: string, runCategory: string, config: unknown, stalledModels: Array<string>, companionRunId?: string | null, isAggregate: boolean, pairedBatchGroupId?: string | null, progress?: unknown | null, startedAt?: string | null, completedAt?: string | null, createdAt: string, updatedAt: string, lastAccessedAt?: string | null, transcriptCount: number, analysisStatus?: string | null, definitionSnapshot?: unknown | null, runProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number, byModel?: Array<{ __typename?: 'ByModelProgress', modelId: string, completed: number, failed: number }> | null } | null, summarizeProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number } | null, unresolvableTranscriptCount?: { __typename?: 'UnresolvableCount', total: number, byModel: Array<{ __typename?: 'UnresolvableByModel', modelId: string, count: number }> } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, definition?: { __typename?: 'Definition', id: string, name: string, version: number, content: unknown, domain?: { __typename?: 'Domain', name: string } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, pairedSibling?: { __typename?: 'Definition', id: string, name: string, content: unknown } | null } | null } };

export type DeleteRunMutationVariables = Exact<{
  runId: Scalars['ID']['input'];
}>;


export type DeleteRunMutation = { __typename?: 'Mutation', deleteRun: boolean };

export type UpdateRunMutationVariables = Exact<{
  runId: Scalars['ID']['input'];
  input: UpdateRunInput;
}>;


export type UpdateRunMutation = { __typename?: 'Mutation', updateRun: { __typename?: 'Run', id: string, name?: string | null, definitionId: string, definitionVersion?: number | null, experimentId?: string | null, status: string, runCategory: string, config: unknown, stalledModels: Array<string>, companionRunId?: string | null, isAggregate: boolean, pairedBatchGroupId?: string | null, progress?: unknown | null, startedAt?: string | null, completedAt?: string | null, createdAt: string, updatedAt: string, lastAccessedAt?: string | null, transcriptCount: number, analysisStatus?: string | null, definitionSnapshot?: unknown | null, runProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number, byModel?: Array<{ __typename?: 'ByModelProgress', modelId: string, completed: number, failed: number }> | null } | null, summarizeProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number } | null, unresolvableTranscriptCount?: { __typename?: 'UnresolvableCount', total: number, byModel: Array<{ __typename?: 'UnresolvableByModel', modelId: string, count: number }> } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, definition?: { __typename?: 'Definition', id: string, name: string, version: number, content: unknown, domain?: { __typename?: 'Domain', name: string } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, pairedSibling?: { __typename?: 'Definition', id: string, name: string, content: unknown } | null } | null } };

export type CancelSummarizationMutationVariables = Exact<{
  runId: Scalars['ID']['input'];
}>;


export type CancelSummarizationMutation = { __typename?: 'Mutation', cancelSummarization: { __typename?: 'CancelSummarizationPayload', cancelledCount: number, run: { __typename?: 'Run', id: string, name?: string | null, definitionId: string, definitionVersion?: number | null, experimentId?: string | null, status: string, runCategory: string, config: unknown, stalledModels: Array<string>, companionRunId?: string | null, isAggregate: boolean, pairedBatchGroupId?: string | null, progress?: unknown | null, startedAt?: string | null, completedAt?: string | null, createdAt: string, updatedAt: string, lastAccessedAt?: string | null, transcriptCount: number, analysisStatus?: string | null, definitionSnapshot?: unknown | null, runProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number, byModel?: Array<{ __typename?: 'ByModelProgress', modelId: string, completed: number, failed: number }> | null } | null, summarizeProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number } | null, unresolvableTranscriptCount?: { __typename?: 'UnresolvableCount', total: number, byModel: Array<{ __typename?: 'UnresolvableByModel', modelId: string, count: number }> } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, definition?: { __typename?: 'Definition', id: string, name: string, version: number, content: unknown, domain?: { __typename?: 'Domain', name: string } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, pairedSibling?: { __typename?: 'Definition', id: string, name: string, content: unknown } | null } | null } } };

export type RestartSummarizationMutationVariables = Exact<{
  runId: Scalars['ID']['input'];
  force?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type RestartSummarizationMutation = { __typename?: 'Mutation', restartSummarization: { __typename?: 'RestartSummarizationPayload', queuedCount: number, run: { __typename?: 'Run', id: string, name?: string | null, definitionId: string, definitionVersion?: number | null, experimentId?: string | null, status: string, runCategory: string, config: unknown, stalledModels: Array<string>, companionRunId?: string | null, isAggregate: boolean, pairedBatchGroupId?: string | null, progress?: unknown | null, startedAt?: string | null, completedAt?: string | null, createdAt: string, updatedAt: string, lastAccessedAt?: string | null, transcriptCount: number, analysisStatus?: string | null, definitionSnapshot?: unknown | null, runProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number, byModel?: Array<{ __typename?: 'ByModelProgress', modelId: string, completed: number, failed: number }> | null } | null, summarizeProgress?: { __typename?: 'RunProgress', total: number, completed: number, failed: number, percentComplete: number } | null, unresolvableTranscriptCount?: { __typename?: 'UnresolvableCount', total: number, byModel: Array<{ __typename?: 'UnresolvableByModel', modelId: string, count: number }> } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, definition?: { __typename?: 'Definition', id: string, name: string, version: number, content: unknown, domain?: { __typename?: 'Domain', name: string } | null, tags: Array<{ __typename?: 'Tag', id: string, name: string }>, pairedSibling?: { __typename?: 'Definition', id: string, name: string, content: unknown } | null } | null } } };

export type UpdateTranscriptDecisionMutationVariables = Exact<{
  transcriptId: Scalars['ID']['input'];
  decisionState: Scalars['String']['input'];
  favoredValueKey?: InputMaybe<Scalars['String']['input']>;
  strength?: InputMaybe<Scalars['String']['input']>;
}>;


export type UpdateTranscriptDecisionMutation = { __typename?: 'Mutation', updateTranscriptDecision: { __typename?: 'Transcript', id: string, runId: string, scenarioId?: string | null, modelId: string, modelVersion?: string | null, content: unknown, decisionMetadata?: unknown | null, turnCount: number, tokenCount: number, durationMs: number, estimatedCost?: number | null, createdAt: string, lastAccessedAt?: string | null } };

export type ScenariosQueryVariables = Exact<{
  definitionId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type ScenariosQuery = { __typename?: 'Query', scenarios: Array<{ __typename?: 'Scenario', id: string, definitionId: string, name: string, content: unknown, createdAt: string }> };

export type ScenarioCountQueryVariables = Exact<{
  definitionId: Scalars['ID']['input'];
}>;


export type ScenarioCountQuery = { __typename?: 'Query', scenarioCount: number };

export type RunConditionGridQueryVariables = Exact<{
  definitionId: Scalars['ID']['input'];
}>;


export type RunConditionGridQuery = { __typename?: 'Query', runConditionGrid?: { __typename?: 'RunConditionGrid', attributeA: string, attributeB: string, rowLevels: Array<string>, colLevels: Array<string>, cells: Array<{ __typename?: 'RunConditionGridCell', rowLevel: string, colLevel: string, trialCount: number, scenarioCount: number, scenarioIds: Array<string> }> } | null };

export type StandaloneActiveRunsQueryVariables = Exact<{ [key: string]: never; }>;


export type StandaloneActiveRunsQuery = { __typename?: 'Query', standaloneActiveRuns: Array<{ __typename?: 'Run', id: string, status: string, createdAt: string, startedAt?: string | null, config: unknown, definition?: { __typename?: 'Definition', id: string, name: string } | null }> };

export type SurveysQueryVariables = Exact<{
  search?: InputMaybe<Scalars['String']['input']>;
}>;


export type SurveysQuery = { __typename?: 'Query', surveys: Array<{ __typename?: 'Experiment', id: string, name: string, hypothesis?: string | null, analysisPlan?: unknown | null, createdAt: string, updatedAt: string, runCount: number }> };

export type CreateSurveyMutationVariables = Exact<{
  input: CreateSurveyInput;
}>;


export type CreateSurveyMutation = { __typename?: 'Mutation', createSurvey: { __typename?: 'Experiment', id: string, name: string, hypothesis?: string | null, analysisPlan?: unknown | null, createdAt: string, updatedAt: string, runCount: number } };

export type UpdateSurveyMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateSurveyInput;
}>;


export type UpdateSurveyMutation = { __typename?: 'Mutation', updateSurvey: { __typename?: 'Experiment', id: string, name: string, hypothesis?: string | null, analysisPlan?: unknown | null, createdAt: string, updatedAt: string, runCount: number } };

export type DeleteSurveyMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteSurveyMutation = { __typename?: 'Mutation', deleteSurvey: boolean };

export type DuplicateSurveyMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
}>;


export type DuplicateSurveyMutation = { __typename?: 'Mutation', duplicateSurvey: { __typename?: 'Experiment', id: string, name: string, hypothesis?: string | null, analysisPlan?: unknown | null, createdAt: string, updatedAt: string, runCount: number } };

export type TagsQueryVariables = Exact<{
  search?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type TagsQuery = { __typename?: 'Query', tags: Array<{ __typename?: 'Tag', id: string, name: string, createdAt: string, definitionCount: number }> };

export type CreateTagMutationVariables = Exact<{
  name: Scalars['String']['input'];
}>;


export type CreateTagMutation = { __typename?: 'Mutation', createTag: { __typename?: 'Tag', id: string, name: string, createdAt: string } };

export type DeleteTagMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type DeleteTagMutation = { __typename?: 'Mutation', deleteTag: { __typename?: 'DeleteTagResult', success: boolean, affectedDefinitions: number } };

export type AddTagToDefinitionMutationVariables = Exact<{
  definitionId: Scalars['String']['input'];
  tagId: Scalars['String']['input'];
}>;


export type AddTagToDefinitionMutation = { __typename?: 'Mutation', addTagToDefinition: { __typename?: 'Definition', id: string, tags: Array<{ __typename?: 'Tag', id: string, name: string }> } };

export type RemoveTagFromDefinitionMutationVariables = Exact<{
  definitionId: Scalars['String']['input'];
  tagId: Scalars['String']['input'];
}>;


export type RemoveTagFromDefinitionMutation = { __typename?: 'Mutation', removeTagFromDefinition: { __typename?: 'Definition', id: string, tags: Array<{ __typename?: 'Tag', id: string, name: string }> } };

export type CreateAndAssignTagMutationVariables = Exact<{
  definitionId: Scalars['String']['input'];
  tagName: Scalars['String']['input'];
}>;


export type CreateAndAssignTagMutation = { __typename?: 'Mutation', createAndAssignTag: { __typename?: 'Definition', id: string, tags: Array<{ __typename?: 'Tag', id: string, name: string }> } };

export type ListUsersQueryVariables = Exact<{ [key: string]: never; }>;


export type ListUsersQuery = { __typename?: 'Query', listUsers: Array<{ __typename?: 'User', id: string, email: string, name?: string | null, role: UserRole, mustChangePassword: boolean, lastLoginAt?: string | null, createdAt: string }> };

export type CreateUserMutationVariables = Exact<{
  input: CreateUserInput;
}>;


export type CreateUserMutation = { __typename?: 'Mutation', createUser: { __typename?: 'User', id: string, email: string, name?: string | null, role: UserRole, mustChangePassword: boolean, lastLoginAt?: string | null, createdAt: string } };

export type UpdateUserRoleMutationVariables = Exact<{
  input: UpdateUserRoleInput;
}>;


export type UpdateUserRoleMutation = { __typename?: 'Mutation', updateUserRole: { __typename?: 'User', id: string, email: string, name?: string | null, role: UserRole, mustChangePassword: boolean, lastLoginAt?: string | null, createdAt: string } };

export type ValueStatementsQueryVariables = Exact<{
  domainId: Scalars['ID']['input'];
}>;


export type ValueStatementsQuery = { __typename?: 'Query', valueStatements: Array<{ __typename?: 'ValueStatement', id: string, domainId: string, token: string, body: string, updatedAt: string }> };

export type CreateValueStatementMutationVariables = Exact<{
  input: CreateValueStatementInput;
}>;


export type CreateValueStatementMutation = { __typename?: 'Mutation', createValueStatement: { __typename?: 'ValueStatement', id: string, domainId: string, token: string, body: string, updatedAt: string } };

export type UpdateValueStatementMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateValueStatementInput;
}>;


export type UpdateValueStatementMutation = { __typename?: 'Mutation', updateValueStatement: { __typename?: 'ValueStatement', id: string, domainId: string, token: string, body: string, updatedAt: string } };

export type DeleteValueStatementMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteValueStatementMutation = { __typename?: 'Mutation', deleteValueStatement: boolean };

export const AnalysisResultFieldsFragmentDoc = gql`
    fragment AnalysisResultFields on AnalysisResult {
  id
  runId
  analysisType
  status
  codeVersion
  inputHash
  createdAt
  computedAt
  durationMs
  perModel
  preferenceSummary {
    perModel
  }
  reliabilitySummary {
    perModel
  }
  aggregateMetadata {
    aggregateEligibility
    aggregateIneligibilityReason
    sourceRunCount
    sourceRunIds
    conditionCoverage
    perModelRepeatCoverage
    perModelDrift
  }
  modelAgreement
  dimensionAnalysis
  visualizationData
  varianceAnalysis
  mostContestedScenarios {
    scenarioId
    scenarioName
    variance
    modelScores
  }
  methodsUsed
  warnings {
    code
    message
    recommendation
  }
}
    `;
export const ComparisonRunListFieldsFragmentDoc = gql`
    fragment ComparisonRunListFields on Run {
  id
  name
  definitionId
  status
  config
  progress
  startedAt
  completedAt
  createdAt
  transcriptCount
  analysisStatus
  definition {
    id
    name
    tags {
      id
      name
    }
  }
}
    `;
export const ComparisonRunFullFieldsFragmentDoc = gql`
    fragment ComparisonRunFullFields on Run {
  id
  name
  definitionId
  status
  config
  progress
  startedAt
  completedAt
  createdAt
  transcriptCount
  analysisStatus
  definition {
    id
    name
    parentId
    resolvedContent
    tags {
      id
      name
    }
  }
}
    `;
export const LlmModelFieldsFragmentDoc = gql`
    fragment LlmModelFields on LlmModel {
  id
  providerId
  modelId
  displayName
  costInputPerMillion
  costOutputPerMillion
  status
  isDefault
  isAvailable
  apiConfig
  createdAt
  updatedAt
}
    `;
export const LlmProviderFieldsFragmentDoc = gql`
    fragment LlmProviderFields on LlmProvider {
  id
  name
  displayName
  maxParallelRequests
  requestsPerMinute
  isEnabled
  balance
  createdAt
  updatedAt
}
    `;
export const RunFieldsFragmentDoc = gql`
    fragment RunFields on Run {
  id
  name
  definitionId
  definitionVersion
  experimentId
  status
  runCategory
  config
  stalledModels
  companionRunId
  isAggregate
  pairedBatchGroupId
  progress
  runProgress {
    total
    completed
    failed
    percentComplete
    byModel {
      modelId
      completed
      failed
    }
  }
  summarizeProgress {
    total
    completed
    failed
    percentComplete
  }
  unresolvableTranscriptCount {
    total
    byModel {
      modelId
      count
    }
  }
  startedAt
  completedAt
  createdAt
  updatedAt
  lastAccessedAt
  transcriptCount
  analysisStatus
  tags {
    id
    name
  }
  definition {
    id
    name
    version
    domain {
      name
    }
    tags: allTags {
      id
      name
    }
    content
    pairedSibling {
      id
      name
      content
    }
  }
  definitionSnapshot
}
    `;
export const RunWithTranscriptsFieldsFragmentDoc = gql`
    fragment RunWithTranscriptsFields on Run {
  ...RunFields
  failedProbes {
    modelId
    errorCode
    errorMessage
  }
  transcripts {
    id
    runId
    scenarioId
    modelId
    modelVersion
    content
    decisionMetadata
    turnCount
    tokenCount
    durationMs
    estimatedCost
    createdAt
    lastAccessedAt
    dimensionValues
    decisionModelV2
  }
  analysis {
    actualCost {
      total
      perModel {
        modelId
        inputTokens
        outputTokens
        cost
        probeCount
      }
    }
  }
  recentTasks(limit: 10) {
    scenarioId
    modelId
    status
    error
    completedAt
  }
  executionMetrics {
    providers {
      provider
      activeJobs
      queuedJobs
      maxParallel
      requestsPerMinute
      activeModelIds
      recentCompletions {
        modelId
        scenarioId
        success
        completedAt
        durationMs
      }
    }
    totalActive
    totalQueued
    estimatedSecondsRemaining
    totalRetries
  }
}
    ${RunFieldsFragmentDoc}`;
export const ActiveEvaluationsDocument = gql`
    query ActiveEvaluations($domainId: ID) {
  activeEvaluations(domainId: $domainId) {
    id
    domainId
    domainNameAtLaunch
    scopeCategory
    status
    createdAt
    startedAt
    completedAt
    startedRuns
    failedDefinitions
    skippedForBudget
    projectedCostUsd
    models
    temperature
    maxBudgetUsd
    memberCount
    launchableDefinitionIds
    samplePercentage
    samplesPerScenario
    targetBatchCount
    launchableDefinitions {
      definitionId
      definitionName
      pairKey
    }
    members {
      runId
      definitionIdAtLaunch
      definitionNameAtLaunch
      domainIdAtLaunch
      modelIds
      createdAt
      runStatus
      runCategory
      runStartedAt
      runCompletedAt
    }
  }
}
    `;

export function useActiveEvaluationsQuery(options?: Omit<Urql.UseQueryArgs<ActiveEvaluationsQueryVariables>, 'query'>) {
  return Urql.useQuery<ActiveEvaluationsQuery, ActiveEvaluationsQueryVariables>({ query: ActiveEvaluationsDocument, ...options });
};
export const AnalysisDocument = gql`
    query Analysis($runId: ID!) {
  analysis(runId: $runId) {
    ...AnalysisResultFields
  }
}
    ${AnalysisResultFieldsFragmentDoc}`;

export function useAnalysisQuery(options: Omit<Urql.UseQueryArgs<AnalysisQueryVariables>, 'query'>) {
  return Urql.useQuery<AnalysisQuery, AnalysisQueryVariables>({ query: AnalysisDocument, ...options });
};
export const RecomputeAnalysisDocument = gql`
    mutation RecomputeAnalysis($runId: ID!) {
  recomputeAnalysis(runId: $runId) {
    ...AnalysisResultFields
  }
}
    ${AnalysisResultFieldsFragmentDoc}`;

export function useRecomputeAnalysisMutation() {
  return Urql.useMutation<RecomputeAnalysisMutation, RecomputeAnalysisMutationVariables>(RecomputeAnalysisDocument);
};
export const ApiKeysDocument = gql`
    query ApiKeys {
  apiKeys {
    id
    name
    keyPrefix
    lastUsedAt
    expiresAt
    createdAt
  }
}
    `;

export function useApiKeysQuery(options?: Omit<Urql.UseQueryArgs<ApiKeysQueryVariables>, 'query'>) {
  return Urql.useQuery<ApiKeysQuery, ApiKeysQueryVariables>({ query: ApiKeysDocument, ...options });
};
export const CreateApiKeyDocument = gql`
    mutation CreateApiKey($input: CreateApiKeyInput!) {
  createApiKey(input: $input) {
    apiKey {
      id
      name
      keyPrefix
      lastUsedAt
      expiresAt
      createdAt
    }
    key
  }
}
    `;

export function useCreateApiKeyMutation() {
  return Urql.useMutation<CreateApiKeyMutation, CreateApiKeyMutationVariables>(CreateApiKeyDocument);
};
export const RevokeApiKeyDocument = gql`
    mutation RevokeApiKey($id: ID!) {
  revokeApiKey(id: $id)
}
    `;

export function useRevokeApiKeyMutation() {
  return Urql.useMutation<RevokeApiKeyMutation, RevokeApiKeyMutationVariables>(RevokeApiKeyDocument);
};
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
export const AvailableSignaturesDocument = gql`
    query AvailableSignatures {
  availableSignatures {
    signature
    mostRecentRunAt
  }
}
    `;

export function useAvailableSignaturesQuery(options?: Omit<Urql.UseQueryArgs<AvailableSignaturesQueryVariables>, 'query'>) {
  return Urql.useQuery<AvailableSignaturesQuery, AvailableSignaturesQueryVariables>({ query: AvailableSignaturesDocument, ...options });
};
export const CircumplexAnalysisDocument = gql`
    query CircumplexAnalysis($modelIds: [String!]!, $signature: String!, $minTrialsPerValue: Int) {
  circumplexAnalysis(
    modelIds: $modelIds
    signature: $signature
    minTrialsPerValue: $minTrialsPerValue
  ) {
    signature
    eligibilityThreshold
    insufficient {
      modelId
      modelLabel
      providerName
      reason
      trialsPerValue {
        valueKey
        trials
      }
    }
    models {
      modelId
      modelLabel
      providerName
      signature
      valueOrder
      profileCorrelationMatrix
      pairTrialCounts
      excludedValues
      spearmanRho
      spearmanP
      verdictBand
      mds2d {
        valueKey
        x
        y
        theoreticalAngleDeg
      }
      mdsStress
      mdsWarning
      trialsPerValue {
        valueKey
        trials
      }
    }
  }
}
    `;

export function useCircumplexAnalysisQuery(options: Omit<Urql.UseQueryArgs<CircumplexAnalysisQueryVariables>, 'query'>) {
  return Urql.useQuery<CircumplexAnalysisQuery, CircumplexAnalysisQueryVariables>({ query: CircumplexAnalysisDocument, ...options });
};
export const ComparisonRunsListDocument = gql`
    query ComparisonRunsList($definitionId: String, $analysisStatus: String, $limit: Int, $offset: Int) {
  runs(
    hasAnalysis: true
    definitionId: $definitionId
    analysisStatus: $analysisStatus
    limit: $limit
    offset: $offset
  ) {
    ...ComparisonRunListFields
  }
}
    ${ComparisonRunListFieldsFragmentDoc}`;

export function useComparisonRunsListQuery(options?: Omit<Urql.UseQueryArgs<ComparisonRunsListQueryVariables>, 'query'>) {
  return Urql.useQuery<ComparisonRunsListQuery, ComparisonRunsListQueryVariables>({ query: ComparisonRunsListDocument, ...options });
};
export const ConfidenceTranscriptsDocument = gql`
    query ConfidenceTranscripts($modelId: String!, $valueKey: String!, $signature: String, $limit: Int, $definitionId: String, $scenarioId: String, $domainId: ID) {
  confidenceTranscripts(
    modelId: $modelId
    valueKey: $valueKey
    signature: $signature
    limit: $limit
    definitionId: $definitionId
    scenarioId: $scenarioId
    domainId: $domainId
  ) {
    id
    runId
    scenarioId
    modelId
    decisionModelV2
    turnCount
    tokenCount
    durationMs
    createdAt
    content
  }
}
    `;

export function useConfidenceTranscriptsQuery(options: Omit<Urql.UseQueryArgs<ConfidenceTranscriptsQueryVariables>, 'query'>) {
  return Urql.useQuery<ConfidenceTranscriptsQuery, ConfidenceTranscriptsQueryVariables>({ query: ConfidenceTranscriptsDocument, ...options });
};
export const ConfidenceValueDetailDocument = gql`
    query ConfidenceValueDetail($modelId: String!, $valueKey: String!, $signature: String, $domainId: ID) {
  confidenceValueDetail(
    modelId: $modelId
    valueKey: $valueKey
    signature: $signature
    domainId: $domainId
  ) {
    modelLabel
    valueKey
    vignettes {
      definitionId
      definitionName
      definitionVersion
      otherValueKey
      totalTrials
      conditions {
        scenarioId
        conditionName
        dimensions
        prioritized
        deprioritized
        neutral
        totalTrials
        unknownCount
        strongly
        somewhat
        opponentSomewhat
        opponentStrongly
      }
    }
  }
}
    `;

export function useConfidenceValueDetailQuery(options: Omit<Urql.UseQueryArgs<ConfidenceValueDetailQueryVariables>, 'query'>) {
  return Urql.useQuery<ConfidenceValueDetailQuery, ConfidenceValueDetailQueryVariables>({ query: ConfidenceValueDetailDocument, ...options });
};
export const EstimateCostDocument = gql`
    query EstimateCost($definitionId: ID!, $models: [String!]!, $samplePercentage: Int, $samplesPerScenario: Int) {
  estimateCost(
    definitionId: $definitionId
    models: $models
    samplePercentage: $samplePercentage
    samplesPerScenario: $samplesPerScenario
  ) {
    total
    scenarioCount
    basedOnSampleCount
    isUsingFallback
    fallbackReason
    perModel {
      modelId
      displayName
      scenarioCount
      inputTokens
      outputTokens
      inputCost
      outputCost
      totalCost
      avgInputPerProbe
      avgOutputPerProbe
      sampleCount
      isUsingFallback
    }
  }
}
    `;

export function useEstimateCostQuery(options: Omit<Urql.UseQueryArgs<EstimateCostQueryVariables>, 'query'>) {
  return Urql.useQuery<EstimateCostQuery, EstimateCostQueryVariables>({ query: EstimateCostDocument, ...options });
};
export const DefinitionsDocument = gql`
    query Definitions($rootOnly: Boolean, $search: String, $tagIds: [ID!], $hasRuns: Boolean, $domainId: ID, $withoutDomain: Boolean, $limit: Int, $offset: Int) {
  definitions(
    rootOnly: $rootOnly
    search: $search
    tagIds: $tagIds
    hasRuns: $hasRuns
    domainId: $domainId
    withoutDomain: $withoutDomain
    limit: $limit
    offset: $offset
  ) {
    id
    name
    domainId
    domain {
      id
      name
    }
    parentId
    content
    createdAt
    updatedAt
    lastAccessedAt
    version
    runCount
    trialCount
    trialConfig {
      definitionVersion
      temperature
      signature
      signatureBreakdown {
        signature
        definitionVersion
        temperature
        trialCount
      }
      isConsistent
      message
    }
    tags {
      id
      name
    }
    allTags {
      id
      name
    }
  }
}
    `;

export function useDefinitionsQuery(options?: Omit<Urql.UseQueryArgs<DefinitionsQueryVariables>, 'query'>) {
  return Urql.useQuery<DefinitionsQuery, DefinitionsQueryVariables>({ query: DefinitionsDocument, ...options });
};
export const DefinitionDocument = gql`
    query Definition($id: ID!) {
  definition(id: $id) {
    id
    name
    domainId
    domainContextId
    domain {
      id
      name
    }
    parentId
    content
    createdAt
    updatedAt
    lastAccessedAt
    version
    runCount
    trialCount
    trialConfig {
      definitionVersion
      temperature
      signature
      signatureBreakdown {
        signature
        definitionVersion
        temperature
        trialCount
      }
      isConsistent
      message
    }
    scenarioCount
    preambleVersionId
    levelPresetVersionId
    preambleVersion {
      id
      version
      content
      preamble {
        name
      }
    }
    tags {
      id
      name
      createdAt
    }
    parent {
      id
      name
    }
    children {
      id
      name
      createdAt
    }
    isForked
    resolvedContent
    localContent
    overrides {
      template
      dimensions
      matchingRules
    }
    inheritedTags {
      id
      name
      createdAt
    }
    allTags {
      id
      name
      createdAt
    }
    expansionStatus {
      status
      jobId
      triggeredBy
      createdAt
      completedAt
      error
      scenarioCount
      progress {
        phase
        expectedScenarios
        generatedScenarios
        inputTokens
        outputTokens
        message
        updatedAt
      }
    }
  }
}
    `;

export function useDefinitionQuery(options: Omit<Urql.UseQueryArgs<DefinitionQueryVariables>, 'query'>) {
  return Urql.useQuery<DefinitionQuery, DefinitionQueryVariables>({ query: DefinitionDocument, ...options });
};
export const DefinitionAncestorsDocument = gql`
    query DefinitionAncestors($id: ID!, $maxDepth: Int) {
  definitionAncestors(id: $id, maxDepth: $maxDepth) {
    id
    name
    parentId
    createdAt
  }
}
    `;

export function useDefinitionAncestorsQuery(options: Omit<Urql.UseQueryArgs<DefinitionAncestorsQueryVariables>, 'query'>) {
  return Urql.useQuery<DefinitionAncestorsQuery, DefinitionAncestorsQueryVariables>({ query: DefinitionAncestorsDocument, ...options });
};
export const DefinitionDescendantsDocument = gql`
    query DefinitionDescendants($id: ID!, $maxDepth: Int) {
  definitionDescendants(id: $id, maxDepth: $maxDepth) {
    id
    name
    parentId
    createdAt
  }
}
    `;

export function useDefinitionDescendantsQuery(options: Omit<Urql.UseQueryArgs<DefinitionDescendantsQueryVariables>, 'query'>) {
  return Urql.useQuery<DefinitionDescendantsQuery, DefinitionDescendantsQueryVariables>({ query: DefinitionDescendantsDocument, ...options });
};
export const DefinitionCountDocument = gql`
    query DefinitionCount($rootOnly: Boolean, $search: String, $tagIds: [ID!], $hasRuns: Boolean, $domainId: ID, $withoutDomain: Boolean) {
  definitionCount(
    rootOnly: $rootOnly
    search: $search
    tagIds: $tagIds
    hasRuns: $hasRuns
    domainId: $domainId
    withoutDomain: $withoutDomain
  )
}
    `;

export function useDefinitionCountQuery(options?: Omit<Urql.UseQueryArgs<DefinitionCountQueryVariables>, 'query'>) {
  return Urql.useQuery<DefinitionCountQuery, DefinitionCountQueryVariables>({ query: DefinitionCountDocument, ...options });
};
export const CreateDefinitionDocument = gql`
    mutation CreateDefinition($input: CreateDefinitionInput!) {
  createDefinition(input: $input) {
    id
    name
    parentId
    content
    createdAt
    updatedAt
  }
}
    `;

export function useCreateDefinitionMutation() {
  return Urql.useMutation<CreateDefinitionMutation, CreateDefinitionMutationVariables>(CreateDefinitionDocument);
};
export const UpdateDefinitionDocument = gql`
    mutation UpdateDefinition($id: String!, $input: UpdateDefinitionInput!) {
  updateDefinition(id: $id, input: $input) {
    id
    name
    content
    updatedAt
  }
}
    `;

export function useUpdateDefinitionMutation() {
  return Urql.useMutation<UpdateDefinitionMutation, UpdateDefinitionMutationVariables>(UpdateDefinitionDocument);
};
export const ForkDefinitionDocument = gql`
    mutation ForkDefinition($input: ForkDefinitionInput!) {
  forkDefinition(input: $input) {
    id
    name
    parentId
    content
    createdAt
    isForked
    resolvedContent
    localContent
    overrides {
      template
      dimensions
      matchingRules
    }
  }
}
    `;

export function useForkDefinitionMutation() {
  return Urql.useMutation<ForkDefinitionMutation, ForkDefinitionMutationVariables>(ForkDefinitionDocument);
};
export const UnforkDefinitionDocument = gql`
    mutation UnforkDefinition($id: String!) {
  unforkDefinition(id: $id) {
    id
    name
    parentId
    content
    updatedAt
    version
    isForked
    resolvedContent
    localContent
    overrides {
      template
      dimensions
      matchingRules
    }
  }
}
    `;

export function useUnforkDefinitionMutation() {
  return Urql.useMutation<UnforkDefinitionMutation, UnforkDefinitionMutationVariables>(UnforkDefinitionDocument);
};
export const DeleteDefinitionDocument = gql`
    mutation DeleteDefinition($id: String!) {
  deleteDefinition(id: $id) {
    deletedIds
    count
  }
}
    `;

export function useDeleteDefinitionMutation() {
  return Urql.useMutation<DeleteDefinitionMutation, DeleteDefinitionMutationVariables>(DeleteDefinitionDocument);
};
export const RegenerateScenariosDocument = gql`
    mutation RegenerateScenarios($definitionId: String!) {
  regenerateScenarios(definitionId: $definitionId) {
    definitionId
    jobId
    queued
  }
}
    `;

export function useRegenerateScenariosMutation() {
  return Urql.useMutation<RegenerateScenariosMutation, RegenerateScenariosMutationVariables>(RegenerateScenariosDocument);
};
export const CancelScenarioExpansionDocument = gql`
    mutation CancelScenarioExpansion($definitionId: String!) {
  cancelScenarioExpansion(definitionId: $definitionId) {
    definitionId
    cancelled
    jobId
    message
  }
}
    `;

export function useCancelScenarioExpansionMutation() {
  return Urql.useMutation<CancelScenarioExpansionMutation, CancelScenarioExpansionMutationVariables>(CancelScenarioExpansionDocument);
};
export const DomainContextsDocument = gql`
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

export function useDomainContextsQuery(options?: Omit<Urql.UseQueryArgs<DomainContextsQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainContextsQuery, DomainContextsQueryVariables>({ query: DomainContextsDocument, ...options });
};
export const CreateDomainContextDocument = gql`
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

export function useCreateDomainContextMutation() {
  return Urql.useMutation<CreateDomainContextMutation, CreateDomainContextMutationVariables>(CreateDomainContextDocument);
};
export const UpdateDomainContextDocument = gql`
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

export function useUpdateDomainContextMutation() {
  return Urql.useMutation<UpdateDomainContextMutation, UpdateDomainContextMutationVariables>(UpdateDomainContextDocument);
};
export const DeleteDomainContextDocument = gql`
    mutation DeleteDomainContext($id: ID!) {
  deleteDomainContext(id: $id)
}
    `;

export function useDeleteDomainContextMutation() {
  return Urql.useMutation<DeleteDomainContextMutation, DeleteDomainContextMutationVariables>(DeleteDomainContextDocument);
};
export const DomainAnalysisDocument = gql`
    query DomainAnalysis($domainId: ID!, $scope: String, $signature: String) {
  domainAnalysis(domainId: $domainId, scope: $scope, signature: $signature) {
    domainId
    domainName
    contributionSummary {
      domainId
      domainName
      rawTrialCount
      share
    }
    excludedDataSummary {
      domainId
      domainName
      reasonCode
      count
    }
    totalDefinitions
    targetedDefinitions
    coveredDefinitions
    missingDefinitionIds
    missingDefinitions {
      definitionId
      definitionName
      reasonCode
      reasonLabel
      missingAllModels
      missingModelIds
      missingModelLabels
    }
    definitionsWithAnalysis
    cacheStatus
    generatedAt
    models {
      model
      label
      values {
        valueKey
        score
        prioritized
        deprioritized
        neutral
        totalComparisons
      }
      rankingShape {
        topStructure
        bottomStructure
        topGap
        bottomGap
        spread
        steepness
        dominanceZScore
      }
    }
    unavailableModels {
      model
      label
      reason
    }
    rankingShapeBenchmarks {
      domainMeanTopGap
      domainStdTopGap
      medianSpread
    }
    clusterAnalysis {
      skipped
      skipReason
      defaultPair
      clusters {
        id
        name
        definingValues
        centroid
        members {
          model
          label
          silhouetteScore
          isOutlier
          nearestClusterIds
          distancesToNearestClusters
        }
      }
      faultLinesByPair
    }
    clusterAnalysisByMethod
  }
}
    `;

export function useDomainAnalysisQuery(options: Omit<Urql.UseQueryArgs<DomainAnalysisQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainAnalysisQuery, DomainAnalysisQueryVariables>({ query: DomainAnalysisDocument, ...options });
};
export const RefreshDomainAnalysisDocument = gql`
    mutation RefreshDomainAnalysis($domainId: ID!, $signature: String) {
  refreshDomainAnalysis(domainId: $domainId, signature: $signature) {
    success
    mode
    message
  }
}
    `;

export function useRefreshDomainAnalysisMutation() {
  return Urql.useMutation<RefreshDomainAnalysisMutation, RefreshDomainAnalysisMutationVariables>(RefreshDomainAnalysisDocument);
};
export const DomainAnalysisLegacyDocument = gql`
    query DomainAnalysisLegacy($domainId: ID!) {
  domainAnalysis(domainId: $domainId) {
    domainId
    domainName
    totalDefinitions
    targetedDefinitions
    definitionsWithAnalysis
    generatedAt
    models {
      model
      label
      values {
        valueKey
        score
        prioritized
        deprioritized
        neutral
        totalComparisons
      }
    }
    unavailableModels {
      model
      label
      reason
    }
  }
}
    `;

export function useDomainAnalysisLegacyQuery(options: Omit<Urql.UseQueryArgs<DomainAnalysisLegacyQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainAnalysisLegacyQuery, DomainAnalysisLegacyQueryVariables>({ query: DomainAnalysisLegacyDocument, ...options });
};
export const DomainAnalysisValueDetailDocument = gql`
    query DomainAnalysisValueDetail($domainId: ID!, $modelId: String!, $valueKey: String!, $signature: String) {
  domainAnalysisValueDetail(
    domainId: $domainId
    modelId: $modelId
    valueKey: $valueKey
    signature: $signature
  ) {
    domainId
    domainName
    modelId
    modelLabel
    valueKey
    score
    prioritized
    deprioritized
    neutral
    totalTrials
    targetedDefinitions
    coveredDefinitions
    missingDefinitionIds
    generatedAt
    vignettes {
      definitionId
      definitionName
      definitionVersion
      aggregateRunId
      otherValueKey
      prioritized
      deprioritized
      neutral
      totalTrials
      selectedValueWinRate
      conditions {
        scenarioId
        conditionName
        dimensions
        prioritized
        deprioritized
        neutral
        totalTrials
        selectedValueWinRate
        strongly
        somewhat
        opponentSomewhat
        opponentStrongly
        unknownCount
      }
    }
  }
}
    `;

export function useDomainAnalysisValueDetailQuery(options: Omit<Urql.UseQueryArgs<DomainAnalysisValueDetailQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainAnalysisValueDetailQuery, DomainAnalysisValueDetailQueryVariables>({ query: DomainAnalysisValueDetailDocument, ...options });
};
export const DomainAnalysisConditionTranscriptsDocument = gql`
    query DomainAnalysisConditionTranscripts($domainId: ID!, $modelId: String!, $valueKey: String!, $definitionId: ID!, $scenarioId: ID, $limit: Int, $signature: String) {
  domainAnalysisConditionTranscripts(
    domainId: $domainId
    modelId: $modelId
    valueKey: $valueKey
    definitionId: $definitionId
    scenarioId: $scenarioId
    limit: $limit
    signature: $signature
  ) {
    id
    runId
    scenarioId
    modelId
    decisionModelV2
    turnCount
    tokenCount
    durationMs
    createdAt
    content
  }
}
    `;

export function useDomainAnalysisConditionTranscriptsQuery(options: Omit<Urql.UseQueryArgs<DomainAnalysisConditionTranscriptsQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainAnalysisConditionTranscriptsQuery, DomainAnalysisConditionTranscriptsQueryVariables>({ query: DomainAnalysisConditionTranscriptsDocument, ...options });
};
export const DomainAvailableSignaturesDocument = gql`
    query DomainAvailableSignatures($domainId: ID!, $scope: String) {
  domainAvailableSignatures(domainId: $domainId, scope: $scope) {
    signature
    label
    isVirtual
    temperature
  }
}
    `;

export function useDomainAvailableSignaturesQuery(options: Omit<Urql.UseQueryArgs<DomainAvailableSignaturesQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainAvailableSignaturesQuery, DomainAvailableSignaturesQueryVariables>({ query: DomainAvailableSignaturesDocument, ...options });
};
export const DomainFindingsEligibilityDocument = gql`
    query DomainFindingsEligibility($domainId: ID!) {
  domainFindingsEligibility(domainId: $domainId) {
    domainId
    eligible
    status
    summary
    reasons
    recommendedActions
    consideredScopeCategories
    completedEligibleEvaluationCount
    latestEligibleEvaluationId
    latestEligibleScopeCategory
    latestEligibleCompletedAt
  }
}
    `;

export function useDomainFindingsEligibilityQuery(options: Omit<Urql.UseQueryArgs<DomainFindingsEligibilityQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainFindingsEligibilityQuery, DomainFindingsEligibilityQueryVariables>({ query: DomainFindingsEligibilityDocument, ...options });
};
export const DomainValueCoverageDocument = gql`
    query DomainValueCoverage($domainId: ID!, $modelIds: [String!], $signature: String) {
  domainValueCoverage(
    domainId: $domainId
    modelIds: $modelIds
    signature: $signature
  ) {
    domainId
    values
    cells {
      valueA
      valueB
      batchEquivalent
      aFirstBatchEquivalent
      bFirstBatchEquivalent
      aFirstDefinitionName
      bFirstDefinitionName
      weakestCondition {
        conditionLabel
        modelCounts {
          modelId
          label
          trialCount
        }
        otherConditionsCount
      }
      contributingDefinitionIds
      definitionId
      aggregateRunId
    }
    availableModels {
      modelId
      label
    }
  }
}
    `;

export function useDomainValueCoverageQuery(options: Omit<Urql.UseQueryArgs<DomainValueCoverageQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainValueCoverageQuery, DomainValueCoverageQueryVariables>({ query: DomainValueCoverageDocument, ...options });
};
export const DomainValueCoverageLegacyDocument = gql`
    query DomainValueCoverageLegacy($domainId: ID!, $modelIds: [String!]) {
  domainValueCoverage(domainId: $domainId, modelIds: $modelIds) {
    domainId
    values
    cells {
      valueA
      valueB
      batchEquivalent
      aFirstBatchEquivalent
      bFirstBatchEquivalent
      aFirstDefinitionName
      bFirstDefinitionName
      weakestCondition {
        conditionLabel
        modelCounts {
          modelId
          label
          trialCount
        }
        otherConditionsCount
      }
      contributingDefinitionIds
      definitionId
      aggregateRunId
    }
    availableModels {
      modelId
      label
    }
  }
}
    `;

export function useDomainValueCoverageLegacyQuery(options: Omit<Urql.UseQueryArgs<DomainValueCoverageLegacyQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainValueCoverageLegacyQuery, DomainValueCoverageLegacyQueryVariables>({ query: DomainValueCoverageLegacyDocument, ...options });
};
export const DomainsDocument = gql`
    query Domains($search: String, $limit: Int, $offset: Int) {
  domains(search: $search, limit: $limit, offset: $offset) {
    id
    name
    createdAt
    updatedAt
    definitionCount
    defaultLevelPresetVersionId
    defaultPreambleVersionId
    defaultContextId
    defaultModelIds
    sentencePrefix
    labelPrefix
  }
}
    `;

export function useDomainsQuery(options?: Omit<Urql.UseQueryArgs<DomainsQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainsQuery, DomainsQueryVariables>({ query: DomainsDocument, ...options });
};
export const CreateDomainDocument = gql`
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

export function useCreateDomainMutation() {
  return Urql.useMutation<CreateDomainMutation, CreateDomainMutationVariables>(CreateDomainDocument);
};
export const RenameDomainDocument = gql`
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

export function useRenameDomainMutation() {
  return Urql.useMutation<RenameDomainMutation, RenameDomainMutationVariables>(RenameDomainDocument);
};
export const DeleteDomainDocument = gql`
    mutation DeleteDomain($id: ID!) {
  deleteDomain(id: $id) {
    success
    affectedDefinitions
  }
}
    `;

export function useDeleteDomainMutation() {
  return Urql.useMutation<DeleteDomainMutation, DeleteDomainMutationVariables>(DeleteDomainDocument);
};
export const AssignDomainToDefinitionsDocument = gql`
    mutation AssignDomainToDefinitions($definitionIds: [ID!]!, $domainId: ID) {
  assignDomainToDefinitions(definitionIds: $definitionIds, domainId: $domainId) {
    success
    affectedDefinitions
  }
}
    `;

export function useAssignDomainToDefinitionsMutation() {
  return Urql.useMutation<AssignDomainToDefinitionsMutation, AssignDomainToDefinitionsMutationVariables>(AssignDomainToDefinitionsDocument);
};
export const AssignDomainToDefinitionsByFilterDocument = gql`
    mutation AssignDomainToDefinitionsByFilter($domainId: ID, $rootOnly: Boolean, $search: String, $tagIds: [ID!], $hasRuns: Boolean, $sourceDomainId: ID, $withoutDomain: Boolean) {
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

export function useAssignDomainToDefinitionsByFilterMutation() {
  return Urql.useMutation<AssignDomainToDefinitionsByFilterMutation, AssignDomainToDefinitionsByFilterMutationVariables>(AssignDomainToDefinitionsByFilterDocument);
};
export const RunTrialsForDomainDocument = gql`
    mutation RunTrialsForDomain($domainId: ID!, $temperature: Float, $maxBudgetUsd: Float, $definitionIds: [ID!]) {
  runTrialsForDomain(
    domainId: $domainId
    temperature: $temperature
    maxBudgetUsd: $maxBudgetUsd
    definitionIds: $definitionIds
  ) {
    domainEvaluationId
    success
    totalDefinitions
    targetedDefinitions
    startedRuns
    failedDefinitions
    skippedForBudget
    projectedCostUsd
    blockedByActiveLaunch
    runs {
      definitionId
      runId
      modelIds
    }
  }
}
    `;

export function useRunTrialsForDomainMutation() {
  return Urql.useMutation<RunTrialsForDomainMutation, RunTrialsForDomainMutationVariables>(RunTrialsForDomainDocument);
};
export const StartDomainEvaluationDocument = gql`
    mutation StartDomainEvaluation($domainId: ID!, $scopeCategory: String, $temperature: Float, $maxBudgetUsd: Float, $definitionIds: [ID!], $modelIds: [String!], $samplePercentage: Int, $samplesPerScenario: Int, $targetBatchCount: Int) {
  startDomainEvaluation(
    domainId: $domainId
    scopeCategory: $scopeCategory
    temperature: $temperature
    maxBudgetUsd: $maxBudgetUsd
    definitionIds: $definitionIds
    modelIds: $modelIds
    samplePercentage: $samplePercentage
    samplesPerScenario: $samplesPerScenario
    targetBatchCount: $targetBatchCount
  ) {
    domainEvaluationId
    scopeCategory
    success
    totalDefinitions
    targetedDefinitions
    startedRuns
    failedDefinitions
    skippedForBudget
    projectedCostUsd
    blockedByActiveLaunch
    runs {
      definitionId
      runId
      modelIds
    }
  }
}
    `;

export function useStartDomainEvaluationMutation() {
  return Urql.useMutation<StartDomainEvaluationMutation, StartDomainEvaluationMutationVariables>(StartDomainEvaluationDocument);
};
export const DomainEvaluationsDocument = gql`
    query DomainEvaluations($domainId: ID!, $scopeCategory: String, $status: String, $limit: Int, $offset: Int) {
  domainEvaluations(
    domainId: $domainId
    scopeCategory: $scopeCategory
    status: $status
    limit: $limit
    offset: $offset
  ) {
    id
    domainId
    domainNameAtLaunch
    scopeCategory
    status
    createdAt
    startedAt
    completedAt
    startedRuns
    failedDefinitions
    skippedForBudget
    projectedCostUsd
    models
    temperature
    maxBudgetUsd
    memberCount
    launchableDefinitionIds
    samplePercentage
    samplesPerScenario
    targetBatchCount
  }
}
    `;

export function useDomainEvaluationsQuery(options: Omit<Urql.UseQueryArgs<DomainEvaluationsQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainEvaluationsQuery, DomainEvaluationsQueryVariables>({ query: DomainEvaluationsDocument, ...options });
};
export const DomainEvaluationDocument = gql`
    query DomainEvaluation($id: ID!) {
  domainEvaluation(id: $id) {
    id
    domainId
    domainNameAtLaunch
    scopeCategory
    status
    createdAt
    startedAt
    completedAt
    startedRuns
    failedDefinitions
    skippedForBudget
    projectedCostUsd
    models
    temperature
    maxBudgetUsd
    memberCount
    launchableDefinitionIds
    launchableDefinitions {
      definitionId
      definitionName
      pairKey
    }
    samplePercentage
    samplesPerScenario
    targetBatchCount
    members {
      runId
      definitionIdAtLaunch
      definitionNameAtLaunch
      domainIdAtLaunch
      modelIds
      createdAt
      runStatus
      runCategory
      runStartedAt
      runCompletedAt
    }
  }
}
    `;

export function useDomainEvaluationQuery(options: Omit<Urql.UseQueryArgs<DomainEvaluationQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainEvaluationQuery, DomainEvaluationQueryVariables>({ query: DomainEvaluationDocument, ...options });
};
export const DomainEvaluationStatusDocument = gql`
    query DomainEvaluationStatus($id: ID!) {
  domainEvaluationStatus(id: $id) {
    id
    status
    totalRuns
    pendingRuns
    runningRuns
    completedRuns
    failedRuns
    cancelledRuns
  }
}
    `;

export function useDomainEvaluationStatusQuery(options: Omit<Urql.UseQueryArgs<DomainEvaluationStatusQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainEvaluationStatusQuery, DomainEvaluationStatusQueryVariables>({ query: DomainEvaluationStatusDocument, ...options });
};
export const DomainTrialsPlanDocument = gql`
    query DomainTrialsPlan($domainId: ID!, $temperature: Float, $definitionIds: [ID!], $scopeCategory: String) {
  domainTrialsPlan(
    domainId: $domainId
    temperature: $temperature
    definitionIds: $definitionIds
    scopeCategory: $scopeCategory
  ) {
    domainId
    domainName
    vignettes {
      definitionId
      definitionName
      definitionVersion
      signature
      scenarioCount
      existingBatchCount
    }
    models {
      modelId
      label
      isDefault
      supportsTemperature
    }
    cellEstimates {
      definitionId
      modelId
      estimatedCost
    }
    totalEstimatedCost
    existingTemperatures
    defaultTemperature
    temperatureWarning
  }
}
    `;

export function useDomainTrialsPlanQuery(options: Omit<Urql.UseQueryArgs<DomainTrialsPlanQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainTrialsPlanQuery, DomainTrialsPlanQueryVariables>({ query: DomainTrialsPlanDocument, ...options });
};
export const EstimateDomainEvaluationCostDocument = gql`
    query EstimateDomainEvaluationCost($domainId: ID!, $definitionIds: [ID!], $modelIds: [String!], $temperature: Float, $samplePercentage: Int, $samplesPerScenario: Int, $scopeCategory: String) {
  estimateDomainEvaluationCost(
    domainId: $domainId
    definitionIds: $definitionIds
    modelIds: $modelIds
    temperature: $temperature
    samplePercentage: $samplePercentage
    samplesPerScenario: $samplesPerScenario
    scopeCategory: $scopeCategory
  ) {
    domainId
    domainName
    scopeCategory
    targetedDefinitions
    totalScenarioCount
    totalEstimatedCost
    basedOnSampleCount
    isUsingFallback
    fallbackReason
    estimateConfidence
    knownExclusions
    models {
      modelId
      label
      isDefault
      supportsTemperature
      estimatedCost
      basedOnSampleCount
      isUsingFallback
    }
    definitions {
      definitionId
      definitionName
      definitionVersion
      signature
      scenarioCount
      estimatedCost
      basedOnSampleCount
      isUsingFallback
    }
    existingTemperatures
    defaultTemperature
    temperatureWarning
  }
}
    `;

export function useEstimateDomainEvaluationCostQuery(options: Omit<Urql.UseQueryArgs<EstimateDomainEvaluationCostQueryVariables>, 'query'>) {
  return Urql.useQuery<EstimateDomainEvaluationCostQuery, EstimateDomainEvaluationCostQueryVariables>({ query: EstimateDomainEvaluationCostDocument, ...options });
};
export const DomainTrialRunsStatusDocument = gql`
    query DomainTrialRunsStatus($runIds: [ID!]!) {
  domainTrialRunsStatus(runIds: $runIds) {
    runId
    definitionId
    status
    updatedAt
    stalledModels
    analysisStatus
    modelStatuses {
      modelId
      generationCompleted
      generationFailed
      generationTotal
      summarizationCompleted
      summarizationFailed
      summarizationTotal
      latestErrorMessage
    }
  }
}
    `;

export function useDomainTrialRunsStatusQuery(options: Omit<Urql.UseQueryArgs<DomainTrialRunsStatusQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainTrialRunsStatusQuery, DomainTrialRunsStatusQueryVariables>({ query: DomainTrialRunsStatusDocument, ...options });
};
export const DomainSettingsDocument = gql`
    query DomainSettings($domainId: ID!) {
  domainSettings(domainId: $domainId) {
    domainId
    preambleVersionId
    levelPresetVersionId
    contextId
    defaultModelIds
    sentencePrefix
    labelPrefix
    valueStatements {
      id
      token
      currentContent
      previousContent
    }
  }
}
    `;

export function useDomainSettingsQuery(options: Omit<Urql.UseQueryArgs<DomainSettingsQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainSettingsQuery, DomainSettingsQueryVariables>({ query: DomainSettingsDocument, ...options });
};
export const DomainConfigSnapshotsDocument = gql`
    query DomainConfigSnapshots($domainId: ID!, $limit: Int) {
  domainConfigSnapshots(domainId: $domainId, limit: $limit) {
    id
    createdAt
    preambleLabel
    levelPresetLabel
    contextLabel
    valueStatementCount
  }
}
    `;

export function useDomainConfigSnapshotsQuery(options: Omit<Urql.UseQueryArgs<DomainConfigSnapshotsQueryVariables>, 'query'>) {
  return Urql.useQuery<DomainConfigSnapshotsQuery, DomainConfigSnapshotsQueryVariables>({ query: DomainConfigSnapshotsDocument, ...options });
};
export const SetDomainSettingsDocument = gql`
    mutation SetDomainSettings($domainId: ID!, $preambleVersionId: ID, $levelPresetVersionId: ID, $contextId: ID, $sentencePrefix: String, $labelPrefix: String, $valueStatements: [ValueStatementInput!]!) {
  setDomainSettings(
    domainId: $domainId
    preambleVersionId: $preambleVersionId
    levelPresetVersionId: $levelPresetVersionId
    contextId: $contextId
    sentencePrefix: $sentencePrefix
    labelPrefix: $labelPrefix
    valueStatements: $valueStatements
  ) {
    id
    name
    defaultPreambleVersionId
    defaultLevelPresetVersionId
    defaultContextId
    defaultModelIds
  }
}
    `;

export function useSetDomainSettingsMutation() {
  return Urql.useMutation<SetDomainSettingsMutation, SetDomainSettingsMutationVariables>(SetDomainSettingsDocument);
};
export const BackfillDomainEvaluationModelsDocument = gql`
    mutation BackfillDomainEvaluationModels($domainEvaluationId: ID!, $modelIds: [String!]!, $definitionIds: [ID!], $targetBatchCount: Int) {
  backfillDomainEvaluationModels(
    domainEvaluationId: $domainEvaluationId
    modelIds: $modelIds
    definitionIds: $definitionIds
    targetBatchCount: $targetBatchCount
  ) {
    domainEvaluationId
    scopeCategory
    success
    totalDefinitions
    targetedDefinitions
    startedRuns
    failedDefinitions
    skippedForBudget
    projectedCostUsd
    blockedByActiveLaunch
    runs {
      definitionId
      runId
      modelIds
    }
  }
}
    `;

export function useBackfillDomainEvaluationModelsMutation() {
  return Urql.useMutation<BackfillDomainEvaluationModelsMutation, BackfillDomainEvaluationModelsMutationVariables>(BackfillDomainEvaluationModelsDocument);
};
export const EnsureDomainVignettePairDocument = gql`
    mutation EnsureDomainVignettePair($input: EnsureDomainVignettePairInput!) {
  ensureDomainVignettePair(input: $input) {
    status
    definitionAId
    definitionBId
  }
}
    `;

export function useEnsureDomainVignettePairMutation() {
  return Urql.useMutation<EnsureDomainVignettePairMutation, EnsureDomainVignettePairMutationVariables>(EnsureDomainVignettePairDocument);
};
export const SystemHealthDocument = gql`
    query SystemHealth($refresh: Boolean) {
  systemHealth(refresh: $refresh) {
    providers {
      providers {
        id
        name
        configured
        connected
        error
        remainingBudgetUsd
        lastChecked
      }
      checkedAt
    }
    queue {
      isHealthy
      isRunning
      isPaused
      activeJobs
      pendingJobs
      completedLast24h
      failedLast24h
      successRate
      jobTypes {
        type
        pending
        active
        completed
        failed
      }
      error
      checkedAt
    }
    worker {
      isHealthy
      pythonVersion
      packages
      apiKeys
      warnings
      error
      checkedAt
    }
  }
}
    `;

export function useSystemHealthQuery(options?: Omit<Urql.UseQueryArgs<SystemHealthQueryVariables>, 'query'>) {
  return Urql.useQuery<SystemHealthQuery, SystemHealthQueryVariables>({ query: SystemHealthDocument, ...options });
};
export const GetLevelPresetsDocument = gql`
    query GetLevelPresets {
  levelPresets {
    id
    name
    updatedAt
    latestVersion {
      id
      version
      l1
      l2
      l3
      l4
      l5
      createdAt
    }
  }
}
    `;

export function useGetLevelPresetsQuery(options?: Omit<Urql.UseQueryArgs<GetLevelPresetsQueryVariables>, 'query'>) {
  return Urql.useQuery<GetLevelPresetsQuery, GetLevelPresetsQueryVariables>({ query: GetLevelPresetsDocument, ...options });
};
export const CreateLevelPresetDocument = gql`
    mutation CreateLevelPreset($name: String!, $l1: String!, $l2: String!, $l3: String!, $l4: String!, $l5: String!) {
  createLevelPreset(name: $name, l1: $l1, l2: $l2, l3: $l3, l4: $l4, l5: $l5) {
    id
    name
    latestVersion {
      id
      version
      l1
      l2
      l3
      l4
      l5
    }
  }
}
    `;

export function useCreateLevelPresetMutation() {
  return Urql.useMutation<CreateLevelPresetMutation, CreateLevelPresetMutationVariables>(CreateLevelPresetDocument);
};
export const UpdateLevelPresetDocument = gql`
    mutation UpdateLevelPreset($id: ID!, $l1: String!, $l2: String!, $l3: String!, $l4: String!, $l5: String!) {
  updateLevelPreset(id: $id, l1: $l1, l2: $l2, l3: $l3, l4: $l4, l5: $l5) {
    id
    name
    updatedAt
    latestVersion {
      id
      version
      l1
      l2
      l3
      l4
      l5
    }
  }
}
    `;

export function useUpdateLevelPresetMutation() {
  return Urql.useMutation<UpdateLevelPresetMutation, UpdateLevelPresetMutationVariables>(UpdateLevelPresetDocument);
};
export const DeleteLevelPresetDocument = gql`
    mutation DeleteLevelPreset($id: ID!) {
  deleteLevelPreset(id: $id) {
    id
  }
}
    `;

export function useDeleteLevelPresetMutation() {
  return Urql.useMutation<DeleteLevelPresetMutation, DeleteLevelPresetMutationVariables>(DeleteLevelPresetDocument);
};
export const LlmProvidersDocument = gql`
    query LlmProviders {
  llmProviders {
    ...LlmProviderFields
    models {
      ...LlmModelFields
    }
  }
}
    ${LlmProviderFieldsFragmentDoc}
${LlmModelFieldsFragmentDoc}`;

export function useLlmProvidersQuery(options?: Omit<Urql.UseQueryArgs<LlmProvidersQueryVariables>, 'query'>) {
  return Urql.useQuery<LlmProvidersQuery, LlmProvidersQueryVariables>({ query: LlmProvidersDocument, ...options });
};
export const LlmModelsDocument = gql`
    query LlmModels($providerId: String, $status: String) {
  llmModels(providerId: $providerId, status: $status) {
    ...LlmModelFields
    provider {
      ...LlmProviderFields
    }
  }
}
    ${LlmModelFieldsFragmentDoc}
${LlmProviderFieldsFragmentDoc}`;

export function useLlmModelsQuery(options?: Omit<Urql.UseQueryArgs<LlmModelsQueryVariables>, 'query'>) {
  return Urql.useQuery<LlmModelsQuery, LlmModelsQueryVariables>({ query: LlmModelsDocument, ...options });
};
export const InfraModelDocument = gql`
    query InfraModel($purpose: String!) {
  infraModel(purpose: $purpose) {
    ...LlmModelFields
    provider {
      ...LlmProviderFields
    }
  }
}
    ${LlmModelFieldsFragmentDoc}
${LlmProviderFieldsFragmentDoc}`;

export function useInfraModelQuery(options: Omit<Urql.UseQueryArgs<InfraModelQueryVariables>, 'query'>) {
  return Urql.useQuery<InfraModelQuery, InfraModelQueryVariables>({ query: InfraModelDocument, ...options });
};
export const CreateLlmModelDocument = gql`
    mutation CreateLlmModel($input: CreateLlmModelInput!) {
  createLlmModel(input: $input) {
    ...LlmModelFields
  }
}
    ${LlmModelFieldsFragmentDoc}`;

export function useCreateLlmModelMutation() {
  return Urql.useMutation<CreateLlmModelMutation, CreateLlmModelMutationVariables>(CreateLlmModelDocument);
};
export const UpdateLlmModelDocument = gql`
    mutation UpdateLlmModel($id: String!, $input: UpdateLlmModelInput!) {
  updateLlmModel(id: $id, input: $input) {
    ...LlmModelFields
  }
}
    ${LlmModelFieldsFragmentDoc}`;

export function useUpdateLlmModelMutation() {
  return Urql.useMutation<UpdateLlmModelMutation, UpdateLlmModelMutationVariables>(UpdateLlmModelDocument);
};
export const DeprecateLlmModelDocument = gql`
    mutation DeprecateLlmModel($id: String!) {
  deprecateLlmModel(id: $id) {
    model {
      ...LlmModelFields
    }
    newDefault {
      ...LlmModelFields
    }
  }
}
    ${LlmModelFieldsFragmentDoc}`;

export function useDeprecateLlmModelMutation() {
  return Urql.useMutation<DeprecateLlmModelMutation, DeprecateLlmModelMutationVariables>(DeprecateLlmModelDocument);
};
export const ReactivateLlmModelDocument = gql`
    mutation ReactivateLlmModel($id: String!) {
  reactivateLlmModel(id: $id) {
    ...LlmModelFields
  }
}
    ${LlmModelFieldsFragmentDoc}`;

export function useReactivateLlmModelMutation() {
  return Urql.useMutation<ReactivateLlmModelMutation, ReactivateLlmModelMutationVariables>(ReactivateLlmModelDocument);
};
export const SetDefaultLlmModelDocument = gql`
    mutation SetDefaultLlmModel($id: String!) {
  setDefaultLlmModel(id: $id) {
    model {
      ...LlmModelFields
    }
    previousDefault {
      ...LlmModelFields
    }
  }
}
    ${LlmModelFieldsFragmentDoc}`;

export function useSetDefaultLlmModelMutation() {
  return Urql.useMutation<SetDefaultLlmModelMutation, SetDefaultLlmModelMutationVariables>(SetDefaultLlmModelDocument);
};
export const UnsetDefaultLlmModelDocument = gql`
    mutation UnsetDefaultLlmModel($id: String!) {
  unsetDefaultLlmModel(id: $id) {
    ...LlmModelFields
  }
}
    ${LlmModelFieldsFragmentDoc}`;

export function useUnsetDefaultLlmModelMutation() {
  return Urql.useMutation<UnsetDefaultLlmModelMutation, UnsetDefaultLlmModelMutationVariables>(UnsetDefaultLlmModelDocument);
};
export const UpdateLlmProviderDocument = gql`
    mutation UpdateLlmProvider($id: String!, $input: UpdateLlmProviderInput!) {
  updateLlmProvider(id: $id, input: $input) {
    ...LlmProviderFields
  }
}
    ${LlmProviderFieldsFragmentDoc}`;

export function useUpdateLlmProviderMutation() {
  return Urql.useMutation<UpdateLlmProviderMutation, UpdateLlmProviderMutationVariables>(UpdateLlmProviderDocument);
};
export const UpdateSystemSettingDocument = gql`
    mutation UpdateSystemSetting($input: UpdateSystemSettingInput!) {
  updateSystemSetting(input: $input) {
    id
    key
    value
    updatedAt
  }
}
    `;

export function useUpdateSystemSettingMutation() {
  return Urql.useMutation<UpdateSystemSettingMutation, UpdateSystemSettingMutationVariables>(UpdateSystemSettingDocument);
};
export const SetProviderBalanceDocument = gql`
    mutation SetProviderBalance($providerId: String!, $balance: Float) {
  setProviderBalance(providerId: $providerId, balance: $balance) {
    ...LlmProviderFields
  }
}
    ${LlmProviderFieldsFragmentDoc}`;

export function useSetProviderBalanceMutation() {
  return Urql.useMutation<SetProviderBalanceMutation, SetProviderBalanceMutationVariables>(SetProviderBalanceDocument);
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
export const ModelsAnalysisDocument = gql`
    query ModelsAnalysis($domainId: ID, $signature: String) {
  modelsAnalysis(domainId: $domainId, signature: $signature) {
    models {
      modelId
      label
      values {
        valueKey
        pooledWinRate
        stabilityScore
        eligibleDomainCount
        domains {
          domainId
          domainName
          winRate
          evidenceWeight
        }
      }
    }
  }
}
    `;

export function useModelsAnalysisQuery(options?: Omit<Urql.UseQueryArgs<ModelsAnalysisQueryVariables>, 'query'>) {
  return Urql.useQuery<ModelsAnalysisQuery, ModelsAnalysisQueryVariables>({ query: ModelsAnalysisDocument, ...options });
};
export const ModelsConfidenceDocument = gql`
    query ModelsConfidence($signature: String, $domainId: ID) {
  modelsConfidence(signature: $signature, domainId: $domainId) {
    models {
      modelId
      label
      overallConfidence
      overallStrongCount
      overallLeanCount
      values {
        valueKey
        confidence
        strongCount
        leanCount
      }
    }
  }
}
    `;

export function useModelsConfidenceQuery(options?: Omit<Urql.UseQueryArgs<ModelsConfidenceQueryVariables>, 'query'>) {
  return Urql.useQuery<ModelsConfidenceQuery, ModelsConfidenceQueryVariables>({ query: ModelsConfidenceDocument, ...options });
};
export const ModelsConsistencyDocument = gql`
    query ModelsConsistency($domainId: ID, $providerId: ID, $minScenarios: Int, $signature: String!) {
  modelsConsistency(
    domainId: $domainId
    providerId: $providerId
    minScenarios: $minScenarios
    signature: $signature
  ) {
    models {
      modelId
      label
      providerName
      repeatability {
        value
        ciLow
        ciHigh
        withinScenarioSd
        betweenScenarioSd
        scenariosMeasured
        perDomain {
          domainId
          domainName
          value
          ciLow
          ciHigh
          scenariosMeasured
        }
        perScenario {
          scenarioId
          matches
          trials
          p
          ciLow
          ciHigh
        }
      }
      coherence {
        value
        coherentPairs
        determinatePairs
        indeterminatePairs
        perPair {
          domainId
          valueKey
          rho
          pValue
          coherent
          determinate
          targetAnalysisRunId
          targetCompanionRunId
          primaryConditionIds
          companionConditionIds
          perCondition {
            scenarioId
            netPressureRank
            winRate
            matches
            trials
          }
        }
      }
      orderEffect {
        samePct
        flippedPct
        noisyPct
        notApplicable
      }
    }
    insufficient {
      modelId
      label
      providerName
      reason
    }
  }
}
    `;

export function useModelsConsistencyQuery(options: Omit<Urql.UseQueryArgs<ModelsConsistencyQueryVariables>, 'query'>) {
  return Urql.useQuery<ModelsConsistencyQuery, ModelsConsistencyQueryVariables>({ query: ModelsConsistencyDocument, ...options });
};
export const CreatePairedVignetteDocument = gql`
    mutation CreatePairedVignette($input: CreatePairedVignetteInput!) {
  createPairedVignette(input: $input) {
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

export function useCreatePairedVignetteMutation() {
  return Urql.useMutation<CreatePairedVignetteMutation, CreatePairedVignetteMutationVariables>(CreatePairedVignetteDocument);
};
export const UpdatePairedVignetteDocument = gql`
    mutation UpdatePairedVignette($input: UpdatePairedVignetteInput!) {
  updatePairedVignette(input: $input) {
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

export function useUpdatePairedVignetteMutation() {
  return Urql.useMutation<UpdatePairedVignetteMutation, UpdatePairedVignetteMutationVariables>(UpdatePairedVignetteDocument);
};
export const PairwiseWinRatesDocument = gql`
    query PairwiseWinRates($domainId: ID, $signature: String) {
  pairwiseWinRates(domainId: $domainId, signature: $signature) {
    models {
      modelId
      label
      valueOrder
      winRateMatrix
      trialCountMatrix
    }
  }
}
    `;

export function usePairwiseWinRatesQuery(options?: Omit<Urql.UseQueryArgs<PairwiseWinRatesQueryVariables>, 'query'>) {
  return Urql.useQuery<PairwiseWinRatesQuery, PairwiseWinRatesQueryVariables>({ query: PairwiseWinRatesDocument, ...options });
};
export const PressureSensitivityDocument = gql`
    query PressureSensitivity($domainId: ID, $definitionId: ID, $modelIds: [String!], $signature: String!) {
  pressureSensitivity(
    domainId: $domainId
    definitionId: $definitionId
    modelIds: $modelIds
    signature: $signature
  ) {
    models {
      modelId
      label
      providerName
      unscoredCount
      pushedForEffect
      pushedAgainstEffect
      pushedEffectPairsUsed
      domainPressureEffects {
        domainId
        domainName
        pushedForEffect
      }
      pressureResponseSummary {
        mean
        rangeMin
        rangeMax
        pairsMeasured
      }
      valueRates {
        valueToken
        valueLabel
        averageWinRate
        balancedWinRate
        highPressureOnThisValueWinRate
        highPressureOnOpposingValueWinRate
        pairsMeasured
      }
      valuePairs {
        pairKey
        firstValueToken
        firstValueLabel
        secondValueToken
        secondValueLabel
        n
        unscoredCount
        definitionsMeasured
        directionBalancedWinRate
        directionBalancedOpponentWinRate
        directionBalancedBalancedWinRate
        directionBalancedBalancedOpponentWinRate
        directionBalancedHighPressureOwnWinRate
        directionBalancedHighPressureOwnOpponentWinRate
        directionBalancedHighPressureOpponentWinRate
        directionBalancedHighPressureOpponentOpponentWinRate
        pressureResponse {
          value
          baselineRate
          pushTowardFirstRate
          pushTowardSecondRate
          qualifyingTrials
          ciLow
          ciHigh
          reason
        }
        grid {
          ownLevel
          opponentLevel
          n
          unscoredCount
          winRate
          opponentWinRate
          conviction
          netScore
          lowData
        }
      }
    }
    insufficient {
      modelId
      label
      providerName
      reason
    }
    excludedDefinitions {
      definitionId
      name
      reason
    }
    pressureConditionExcludedCount
    pressureConditionExclusionBreakdown {
      sourceRunMapping
      definitionMetadata
      missingScenario
      invalidMetadata
      levelAssignment
    }
    transcriptCapHit
    directionalSanityCheck {
      positivePct
      flatPct
      negativePct
      measuredCount
      unmeasurableCount
      breakdown {
        modelId
        pairKey
        pressureResponse
        classification
      }
    }
  }
}
    `;

export function usePressureSensitivityQuery(options: Omit<Urql.UseQueryArgs<PressureSensitivityQueryVariables>, 'query'>) {
  return Urql.useQuery<PressureSensitivityQuery, PressureSensitivityQueryVariables>({ query: PressureSensitivityDocument, ...options });
};
export const OpenRunAnomaliesDocument = gql`
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
    reprobeStage
    estimatedCost
    activeTranscriptId
    scenarioName
    dimensionValues
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

export function useOpenRunAnomaliesQuery(options?: Omit<Urql.UseQueryArgs<OpenRunAnomaliesQueryVariables>, 'query'>) {
  return Urql.useQuery<OpenRunAnomaliesQuery, OpenRunAnomaliesQueryVariables>({ query: OpenRunAnomaliesDocument, ...options });
};
export const ReprobeAnomalySlotDocument = gql`
    mutation ReprobeAnomalySlot($anomalyId: ID!) {
  reprobeAnomalySlot(anomalyId: $anomalyId) {
    id
    lastSeenAt
    reprobeCount
    reprobeLimitReached
  }
}
    `;

export function useReprobeAnomalySlotMutation() {
  return Urql.useMutation<ReprobeAnomalySlotMutation, ReprobeAnomalySlotMutationVariables>(ReprobeAnomalySlotDocument);
};
export const ResolveRunAnomalyDocument = gql`
    mutation ResolveRunAnomaly($id: ID!) {
  resolveRunAnomaly(id: $id) {
    id
    resolvedAt
  }
}
    `;

export function useResolveRunAnomalyMutation() {
  return Urql.useMutation<ResolveRunAnomalyMutation, ResolveRunAnomalyMutationVariables>(ResolveRunAnomalyDocument);
};
export const RunsDocument = gql`
    query Runs($definitionId: String, $experimentId: String, $status: String, $runCategory: String, $hasAnalysis: Boolean, $analysisStatus: String, $runType: String, $limit: Int, $offset: Int) {
  runs(
    definitionId: $definitionId
    experimentId: $experimentId
    status: $status
    runCategory: $runCategory
    hasAnalysis: $hasAnalysis
    analysisStatus: $analysisStatus
    runType: $runType
    limit: $limit
    offset: $offset
  ) {
    ...RunFields
  }
}
    ${RunFieldsFragmentDoc}`;

export function useRunsQuery(options?: Omit<Urql.UseQueryArgs<RunsQueryVariables>, 'query'>) {
  return Urql.useQuery<RunsQuery, RunsQueryVariables>({ query: RunsDocument, ...options });
};
export const RunCountDocument = gql`
    query RunCount($definitionId: String, $experimentId: String, $status: String, $runCategory: String, $hasAnalysis: Boolean, $analysisStatus: String, $runType: String) {
  runCount(
    definitionId: $definitionId
    experimentId: $experimentId
    status: $status
    runCategory: $runCategory
    hasAnalysis: $hasAnalysis
    analysisStatus: $analysisStatus
    runType: $runType
  )
}
    `;

export function useRunCountQuery(options?: Omit<Urql.UseQueryArgs<RunCountQueryVariables>, 'query'>) {
  return Urql.useQuery<RunCountQuery, RunCountQueryVariables>({ query: RunCountDocument, ...options });
};
export const AnalysisFolderCountsDocument = gql`
    query AnalysisFolderCounts($definitionId: String, $definitionTagIds: [ID!], $experimentId: String, $status: String, $runCategory: String, $analysisStatus: String, $runType: String) {
  analysisFolderCounts(
    definitionId: $definitionId
    definitionTagIds: $definitionTagIds
    experimentId: $experimentId
    status: $status
    runCategory: $runCategory
    analysisStatus: $analysisStatus
    runType: $runType
  ) {
    aggregateCount
    untaggedCount
    aggregateUntaggedCount
    tagCounts {
      tagId
      name
      count
    }
    aggregateTagCounts {
      tagId
      name
      count
    }
  }
}
    `;

export function useAnalysisFolderCountsQuery(options?: Omit<Urql.UseQueryArgs<AnalysisFolderCountsQueryVariables>, 'query'>) {
  return Urql.useQuery<AnalysisFolderCountsQuery, AnalysisFolderCountsQueryVariables>({ query: AnalysisFolderCountsDocument, ...options });
};
export const RunDocument = gql`
    query Run($id: ID!) {
  run(id: $id) {
    ...RunWithTranscriptsFields
  }
}
    ${RunWithTranscriptsFieldsFragmentDoc}`;

export function useRunQuery(options: Omit<Urql.UseQueryArgs<RunQueryVariables>, 'query'>) {
  return Urql.useQuery<RunQuery, RunQueryVariables>({ query: RunDocument, ...options });
};
export const StartRunDocument = gql`
    mutation StartRun($input: StartRunInput!) {
  startRun(input: $input) {
    run {
      ...RunFields
    }
    jobCount
    pairedRunIds
  }
}
    ${RunFieldsFragmentDoc}`;

export function useStartRunMutation() {
  return Urql.useMutation<StartRunMutation, StartRunMutationVariables>(StartRunDocument);
};
export const PauseRunDocument = gql`
    mutation PauseRun($runId: ID!) {
  pauseRun(runId: $runId) {
    ...RunFields
  }
}
    ${RunFieldsFragmentDoc}`;

export function usePauseRunMutation() {
  return Urql.useMutation<PauseRunMutation, PauseRunMutationVariables>(PauseRunDocument);
};
export const ResumeRunDocument = gql`
    mutation ResumeRun($runId: ID!) {
  resumeRun(runId: $runId) {
    ...RunFields
  }
}
    ${RunFieldsFragmentDoc}`;

export function useResumeRunMutation() {
  return Urql.useMutation<ResumeRunMutation, ResumeRunMutationVariables>(ResumeRunDocument);
};
export const CancelRunDocument = gql`
    mutation CancelRun($runId: ID!) {
  cancelRun(runId: $runId) {
    ...RunFields
  }
}
    ${RunFieldsFragmentDoc}`;

export function useCancelRunMutation() {
  return Urql.useMutation<CancelRunMutation, CancelRunMutationVariables>(CancelRunDocument);
};
export const DeleteRunDocument = gql`
    mutation DeleteRun($runId: ID!) {
  deleteRun(runId: $runId)
}
    `;

export function useDeleteRunMutation() {
  return Urql.useMutation<DeleteRunMutation, DeleteRunMutationVariables>(DeleteRunDocument);
};
export const UpdateRunDocument = gql`
    mutation UpdateRun($runId: ID!, $input: UpdateRunInput!) {
  updateRun(runId: $runId, input: $input) {
    ...RunFields
  }
}
    ${RunFieldsFragmentDoc}`;

export function useUpdateRunMutation() {
  return Urql.useMutation<UpdateRunMutation, UpdateRunMutationVariables>(UpdateRunDocument);
};
export const CancelSummarizationDocument = gql`
    mutation CancelSummarization($runId: ID!) {
  cancelSummarization(runId: $runId) {
    run {
      ...RunFields
    }
    cancelledCount
  }
}
    ${RunFieldsFragmentDoc}`;

export function useCancelSummarizationMutation() {
  return Urql.useMutation<CancelSummarizationMutation, CancelSummarizationMutationVariables>(CancelSummarizationDocument);
};
export const RestartSummarizationDocument = gql`
    mutation RestartSummarization($runId: ID!, $force: Boolean) {
  restartSummarization(runId: $runId, force: $force) {
    run {
      ...RunFields
    }
    queuedCount
  }
}
    ${RunFieldsFragmentDoc}`;

export function useRestartSummarizationMutation() {
  return Urql.useMutation<RestartSummarizationMutation, RestartSummarizationMutationVariables>(RestartSummarizationDocument);
};
export const UpdateTranscriptDecisionDocument = gql`
    mutation UpdateTranscriptDecision($transcriptId: ID!, $decisionState: String!, $favoredValueKey: String, $strength: String) {
  updateTranscriptDecision(
    transcriptId: $transcriptId
    decisionState: $decisionState
    favoredValueKey: $favoredValueKey
    strength: $strength
  ) {
    id
    runId
    scenarioId
    modelId
    modelVersion
    content
    decisionMetadata
    turnCount
    tokenCount
    durationMs
    estimatedCost
    createdAt
    lastAccessedAt
  }
}
    `;

export function useUpdateTranscriptDecisionMutation() {
  return Urql.useMutation<UpdateTranscriptDecisionMutation, UpdateTranscriptDecisionMutationVariables>(UpdateTranscriptDecisionDocument);
};
export const ScenariosDocument = gql`
    query Scenarios($definitionId: ID!, $limit: Int, $offset: Int) {
  scenarios(definitionId: $definitionId, limit: $limit, offset: $offset) {
    id
    definitionId
    name
    content
    createdAt
  }
}
    `;

export function useScenariosQuery(options: Omit<Urql.UseQueryArgs<ScenariosQueryVariables>, 'query'>) {
  return Urql.useQuery<ScenariosQuery, ScenariosQueryVariables>({ query: ScenariosDocument, ...options });
};
export const ScenarioCountDocument = gql`
    query ScenarioCount($definitionId: ID!) {
  scenarioCount(definitionId: $definitionId)
}
    `;

export function useScenarioCountQuery(options: Omit<Urql.UseQueryArgs<ScenarioCountQueryVariables>, 'query'>) {
  return Urql.useQuery<ScenarioCountQuery, ScenarioCountQueryVariables>({ query: ScenarioCountDocument, ...options });
};
export const RunConditionGridDocument = gql`
    query RunConditionGrid($definitionId: ID!) {
  runConditionGrid(definitionId: $definitionId) {
    attributeA
    attributeB
    rowLevels
    colLevels
    cells {
      rowLevel
      colLevel
      trialCount
      scenarioCount
      scenarioIds
    }
  }
}
    `;

export function useRunConditionGridQuery(options: Omit<Urql.UseQueryArgs<RunConditionGridQueryVariables>, 'query'>) {
  return Urql.useQuery<RunConditionGridQuery, RunConditionGridQueryVariables>({ query: RunConditionGridDocument, ...options });
};
export const StandaloneActiveRunsDocument = gql`
    query StandaloneActiveRuns {
  standaloneActiveRuns {
    id
    status
    createdAt
    startedAt
    config
    definition {
      id
      name
    }
  }
}
    `;

export function useStandaloneActiveRunsQuery(options?: Omit<Urql.UseQueryArgs<StandaloneActiveRunsQueryVariables>, 'query'>) {
  return Urql.useQuery<StandaloneActiveRunsQuery, StandaloneActiveRunsQueryVariables>({ query: StandaloneActiveRunsDocument, ...options });
};
export const SurveysDocument = gql`
    query Surveys($search: String) {
  surveys(search: $search) {
    id
    name
    hypothesis
    analysisPlan
    createdAt
    updatedAt
    runCount
  }
}
    `;

export function useSurveysQuery(options?: Omit<Urql.UseQueryArgs<SurveysQueryVariables>, 'query'>) {
  return Urql.useQuery<SurveysQuery, SurveysQueryVariables>({ query: SurveysDocument, ...options });
};
export const CreateSurveyDocument = gql`
    mutation CreateSurvey($input: CreateSurveyInput!) {
  createSurvey(input: $input) {
    id
    name
    hypothesis
    analysisPlan
    createdAt
    updatedAt
    runCount
  }
}
    `;

export function useCreateSurveyMutation() {
  return Urql.useMutation<CreateSurveyMutation, CreateSurveyMutationVariables>(CreateSurveyDocument);
};
export const UpdateSurveyDocument = gql`
    mutation UpdateSurvey($id: ID!, $input: UpdateSurveyInput!) {
  updateSurvey(id: $id, input: $input) {
    id
    name
    hypothesis
    analysisPlan
    createdAt
    updatedAt
    runCount
  }
}
    `;

export function useUpdateSurveyMutation() {
  return Urql.useMutation<UpdateSurveyMutation, UpdateSurveyMutationVariables>(UpdateSurveyDocument);
};
export const DeleteSurveyDocument = gql`
    mutation DeleteSurvey($id: ID!) {
  deleteSurvey(id: $id)
}
    `;

export function useDeleteSurveyMutation() {
  return Urql.useMutation<DeleteSurveyMutation, DeleteSurveyMutationVariables>(DeleteSurveyDocument);
};
export const DuplicateSurveyDocument = gql`
    mutation DuplicateSurvey($id: ID!, $name: String) {
  duplicateSurvey(id: $id, name: $name) {
    id
    name
    hypothesis
    analysisPlan
    createdAt
    updatedAt
    runCount
  }
}
    `;

export function useDuplicateSurveyMutation() {
  return Urql.useMutation<DuplicateSurveyMutation, DuplicateSurveyMutationVariables>(DuplicateSurveyDocument);
};
export const TagsDocument = gql`
    query Tags($search: String, $limit: Int) {
  tags(search: $search, limit: $limit) {
    id
    name
    createdAt
    definitionCount
  }
}
    `;

export function useTagsQuery(options?: Omit<Urql.UseQueryArgs<TagsQueryVariables>, 'query'>) {
  return Urql.useQuery<TagsQuery, TagsQueryVariables>({ query: TagsDocument, ...options });
};
export const CreateTagDocument = gql`
    mutation CreateTag($name: String!) {
  createTag(name: $name) {
    id
    name
    createdAt
  }
}
    `;

export function useCreateTagMutation() {
  return Urql.useMutation<CreateTagMutation, CreateTagMutationVariables>(CreateTagDocument);
};
export const DeleteTagDocument = gql`
    mutation DeleteTag($id: String!) {
  deleteTag(id: $id) {
    success
    affectedDefinitions
  }
}
    `;

export function useDeleteTagMutation() {
  return Urql.useMutation<DeleteTagMutation, DeleteTagMutationVariables>(DeleteTagDocument);
};
export const AddTagToDefinitionDocument = gql`
    mutation AddTagToDefinition($definitionId: String!, $tagId: String!) {
  addTagToDefinition(definitionId: $definitionId, tagId: $tagId) {
    id
    tags {
      id
      name
    }
  }
}
    `;

export function useAddTagToDefinitionMutation() {
  return Urql.useMutation<AddTagToDefinitionMutation, AddTagToDefinitionMutationVariables>(AddTagToDefinitionDocument);
};
export const RemoveTagFromDefinitionDocument = gql`
    mutation RemoveTagFromDefinition($definitionId: String!, $tagId: String!) {
  removeTagFromDefinition(definitionId: $definitionId, tagId: $tagId) {
    id
    tags {
      id
      name
    }
  }
}
    `;

export function useRemoveTagFromDefinitionMutation() {
  return Urql.useMutation<RemoveTagFromDefinitionMutation, RemoveTagFromDefinitionMutationVariables>(RemoveTagFromDefinitionDocument);
};
export const CreateAndAssignTagDocument = gql`
    mutation CreateAndAssignTag($definitionId: String!, $tagName: String!) {
  createAndAssignTag(definitionId: $definitionId, tagName: $tagName) {
    id
    tags {
      id
      name
    }
  }
}
    `;

export function useCreateAndAssignTagMutation() {
  return Urql.useMutation<CreateAndAssignTagMutation, CreateAndAssignTagMutationVariables>(CreateAndAssignTagDocument);
};
export const ListUsersDocument = gql`
    query ListUsers {
  listUsers {
    id
    email
    name
    role
    mustChangePassword
    lastLoginAt
    createdAt
  }
}
    `;

export function useListUsersQuery(options?: Omit<Urql.UseQueryArgs<ListUsersQueryVariables>, 'query'>) {
  return Urql.useQuery<ListUsersQuery, ListUsersQueryVariables>({ query: ListUsersDocument, ...options });
};
export const CreateUserDocument = gql`
    mutation CreateUser($input: CreateUserInput!) {
  createUser(input: $input) {
    id
    email
    name
    role
    mustChangePassword
    lastLoginAt
    createdAt
  }
}
    `;

export function useCreateUserMutation() {
  return Urql.useMutation<CreateUserMutation, CreateUserMutationVariables>(CreateUserDocument);
};
export const UpdateUserRoleDocument = gql`
    mutation UpdateUserRole($input: UpdateUserRoleInput!) {
  updateUserRole(input: $input) {
    id
    email
    name
    role
    mustChangePassword
    lastLoginAt
    createdAt
  }
}
    `;

export function useUpdateUserRoleMutation() {
  return Urql.useMutation<UpdateUserRoleMutation, UpdateUserRoleMutationVariables>(UpdateUserRoleDocument);
};
export const ValueStatementsDocument = gql`
    query ValueStatements($domainId: ID!) {
  valueStatements(domainId: $domainId) {
    id
    domainId
    token
    body
    updatedAt
  }
}
    `;

export function useValueStatementsQuery(options: Omit<Urql.UseQueryArgs<ValueStatementsQueryVariables>, 'query'>) {
  return Urql.useQuery<ValueStatementsQuery, ValueStatementsQueryVariables>({ query: ValueStatementsDocument, ...options });
};
export const CreateValueStatementDocument = gql`
    mutation CreateValueStatement($input: CreateValueStatementInput!) {
  createValueStatement(input: $input) {
    id
    domainId
    token
    body
    updatedAt
  }
}
    `;

export function useCreateValueStatementMutation() {
  return Urql.useMutation<CreateValueStatementMutation, CreateValueStatementMutationVariables>(CreateValueStatementDocument);
};
export const UpdateValueStatementDocument = gql`
    mutation UpdateValueStatement($id: ID!, $input: UpdateValueStatementInput!) {
  updateValueStatement(id: $id, input: $input) {
    id
    domainId
    token
    body
    updatedAt
  }
}
    `;

export function useUpdateValueStatementMutation() {
  return Urql.useMutation<UpdateValueStatementMutation, UpdateValueStatementMutationVariables>(UpdateValueStatementDocument);
};
export const DeleteValueStatementDocument = gql`
    mutation DeleteValueStatement($id: ID!) {
  deleteValueStatement(id: $id)
}
    `;

export function useDeleteValueStatementMutation() {
  return Urql.useMutation<DeleteValueStatementMutation, DeleteValueStatementMutationVariables>(DeleteValueStatementDocument);
};