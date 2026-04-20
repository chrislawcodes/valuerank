import type { DomainAnalysisValueKey, DomainAnalysisValuePair } from '../domain-analysis-values.js';

export type DecisionDirection = 'favor_first' | 'favor_second' | 'neutral' | 'refusal' | 'unknown';
export type DecisionStrength = 'strong' | 'lean' | 'neutral' | 'unknown';
export type DecisionSource = 'deterministic' | 'manual' | 'error' | 'unknown';

export type CanonicalAppliedDecision = {
  favoredValueKey: DomainAnalysisValueKey | null;
  opposedValueKey: DomainAnalysisValueKey | null;
  direction: DecisionDirection;
  strength: DecisionStrength;
};

export type RawDecisionEvidence = {
  matchedText: string | null;
  matchedLabel: string | null;
  parseClass: 'exact' | 'fallback_resolved' | 'ambiguous' | 'unparseable' | null;
  parsePath: string | null;
  parserVersion: string | null;
  responseExcerpt: string | null;
  /** First-class refusal signal from the Python worker. When true, the model
   * refused to answer. Replaces the legacy `summary.decisionCode === "refusal"`
   * encoding. */
  refusal: boolean;
  manualOverride: {
    previousValue: string | null;
    overriddenAt: string | null;
    overriddenByUserId: string | null;
  } | null;
};

export type CanonicalDecision = {
  favoredValueKey: DomainAnalysisValueKey | null;
  opposedValueKey: DomainAnalysisValueKey | null;
  direction: DecisionDirection;
  strength: DecisionStrength;
  normalizationApplied: boolean;
  normalizationReason: 'orientation_flipped' | null;
  source: DecisionSource;
};

export type DecisionReadSurface = 'api' | 'web' | 'worker' | 'export';
export type DecisionReadMode = 'v1' | 'v2';
export type DecisionReadRule = {
  surface: DecisionReadSurface;
  defaultMode: DecisionReadMode;
  fallbackLayer: 'server_adapter' | 'none';
};

export const DECISION_MODEL_READ_RULES: Record<DecisionReadSurface, DecisionReadRule> = {
  api: {
    surface: 'api',
    defaultMode: 'v1',
    fallbackLayer: 'server_adapter',
  },
  web: {
    surface: 'web',
    defaultMode: 'v1',
    fallbackLayer: 'none',
  },
  worker: {
    surface: 'worker',
    defaultMode: 'v1',
    fallbackLayer: 'server_adapter',
  },
  export: {
    surface: 'export',
    defaultMode: 'v1',
    fallbackLayer: 'server_adapter',
  },
} as const;

export type DecisionPair = {
  valueA: DomainAnalysisValueKey;
  valueB: DomainAnalysisValueKey;
};

export type ValueStatementEntry = { token: string; body: string };

export type DecisionModelInput = {
  pair: DecisionPair | null;
  orientationFlipped: boolean | null | undefined;
  raw: RawDecisionEvidence;
  manualOverridePresent?: boolean;
  manualOverrideDecision?: CanonicalAppliedDecision | null;
  cachedDecision?: CachedWinnerFirstDecision | null;
  valueStatements?: readonly ValueStatementEntry[];
  labelPrefix?: string | null;
};

export type DecisionModelResult = {
  raw: RawDecisionEvidence;
  canonical: CanonicalDecision;
};

export type TranscriptDecisionModelInput = {
  decisionMetadata: unknown;
  /** Supply definitionSnapshot OR pairOverride — pairOverride takes precedence if both provided */
  definitionSnapshot?: unknown;
  orientationFlipped: boolean | null | undefined;
  /** Pre-resolved value pair; avoids fetching definitionSnapshot from DB when pair is already known */
  pairOverride?: DomainAnalysisValuePair | null;
};

export type TranscriptDecisionModelResult = DecisionModelResult;

export type ParsedDecisionPath = {
  branch: 'exact' | 'fallback' | 'manual';
  direction: DecisionDirection;
  strength: DecisionStrength;
};

/**
 * Cached canonical decision attached to a summarize cache entry.
 *
 * `cacheVersion`:
 * - `2` — the current shape. Fresh writes always emit v2.
 * - `1` — legacy rows written before the single-source-of-truth migration.
 *   Accepted by the validator as a deploy-window tolerance bridge; a
 *   follow-up mini-PR tightens the union to literal `2` after the
 *   migration's --apply step verifies zero v1 rows remain.
 *
 * `decisionState`:
 * - `"resolved"`: parser chose a value (favoredValueKey + strength populated).
 * - `"neutral"`: model explicitly picked the middle / "neutral" scale option.
 * - `"unknown"`: parser could not resolve.
 * - `"refusal"`: model explicitly refused to answer. Signalled by the Python
 *   worker setting `decisionMetadata.refusal = true`.
 */
export type CachedWinnerFirstDecision = {
  cacheVersion: 1 | 2;
  decisionState: 'resolved' | 'neutral' | 'unknown' | 'refusal';
  favoredValueKey: DomainAnalysisValueKey | null;
  strength: DecisionStrength;
};
