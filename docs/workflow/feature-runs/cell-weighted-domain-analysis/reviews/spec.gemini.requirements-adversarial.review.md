---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/cell-weighted-domain-analysis/spec.md"
artifact_sha256: "2a1b790484effd59dba4588e04e1954991e413d2acdf3cddd0a4b276e8e3aee3"
repo_root: "."
git_head_sha: "b0cabb57fda701370894594aa2d7a68338016bf9"
git_base_ref: "origin/fix/pressure-sensitivity-opponent-win-rate"
git_base_sha: "b0cabb57fda701370894594aa2d7a68338016bf9"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/cell-weighted-domain-analysis/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. HIGH: Snapshot output generation will break due to a missed dependency

The spec correctly identifies that `aggregateAnalysisRows` and its underlying query against `analysis_results` must be replaced with a transcript-based pipeline. However, it fails to account for another function, `buildContributionAndExcludedSummary`, which also depends on this same `analysis_results` data. The spec does not include refactoring this function in its scope.

If the `analysis_results` query is removed as planned, the `analysisRows` variable passed to `buildContributionAndExcludedSummary` will be empty, causing the `contributionSummary` and `excludedDataSummary` sections of the final snapshot to be incorrect or causing the build to fail entirely.

**[CODE-CONFIRMED]** — `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-builder.ts` shows that `buildSnapshotOutput` calls `buildContributionAndExcludedSummary` and passes `analysisRows` to it, confirming the dependency that the spec overlooks.

```typescript
// from cloud/apps/api/src/services/analysis/domain-analysis-snapshot-builder.ts

export async function buildSnapshotOutput(
  state: DomainAnalysisPreparedState,
): Promise<DomainAnalysisSnapshotOutput> {
  // ...
  const analysisRows: AnalysisOutputRow[] = state.resolvedSignatureRuns.filteredSourceRunIds.length === 0
    ? []
    : await db.analysisResult.findMany({ /* ...query slated for removal... */ });

  // ... aggregateAnalysisRows is called (this is being replaced)

  const { contributionSummary, excludedDataSummary } = buildContributionAndExcludedSummary({
    domainNameById,
    definitionDomainIdById: state.definitionDomainIdById,
    valuePairByDefinition,
    analysisRows, // <-- This dependency is not addressed in the spec
    filteredSourceRunDefinitionById: state.resolvedSignatureRuns.filteredSourceRunDefinitionById,
  });

  // ...
}
```

### 2. MEDIUM: Transcript query strategy has a hidden scalability failure mode

The spec advises copying the data loading pattern from `circumplex/aggregation.ts`, which batches transcript queries by `modelId` to avoid Prisma's buffer limits. While this prevents crashes when many models are queried, it does not protect against the case where a *single model* has a very large number of associated transcripts.

If a domain analysis is run on a scope that includes a very large number of runs for a single model, the query for that model's transcripts could still fetch enough data to exceed Prisma's internal buffer and crash the process.

**[CODE-CONFIRMED]** — The referenced file, `cloud/apps/api/src/services/circumplex/aggregation.ts`, confirms it uses a `Promise.all` over an array of `modelIds`, where each parallel promise fetches all transcripts for that model in a single `findMany` call. This pattern is vulnerable to the single-model-high-volume failure case.

```typescript
// from cloud/apps/api/src/services/circumplex/aggregation.ts
const transcriptBatches = await Promise.all(
  args.modelIds.map(async (modelId) => (await db.transcript.findMany({
    where: {
      runId: { in: scopedRunIds },
      modelId, // <-- one query per modelId
      deletedAt: null,
    },
    // ...
  })) as TranscriptRow[]),
);
```

### 3. MEDIUM: Proposed "shared" accumulator will introduce new code duplication

The spec calls for creating a new, pure `transcript-cell-accumulator.ts` to be used by Domain Analysis and, in the future, Pressure Sensitivity. However, it overlooks that a large, nearly identical transcript processing pipeline already exists in `cloud/apps/api/src/services/circumplex/aggregation.ts`.

Creating the new accumulator as specified, without first extracting the common logic from `circumplex/aggregation.ts`, will result in two parallel and highly similar transcript aggregation pipelines. This introduces tech debt and increases the maintenance burden, as any changes to core transcript processing (e.g., how decisions are resolved) would need to be implemented in multiple places.

**[CODE-CONFIRMED]** — `cloud/apps/api/src/services/circumplex/aggregation.ts` contains logic for fetching transcripts based on a signature, resolving decisions using `resolveTranscriptDecisionModel`, canonicalizing value pairs, and accumulating wins/losses. This is substantively the same set of operations required for the new Domain Analysis pipeline, confirming the duplication risk.

### 4. UNVERIFIED: Core logic for cell mapping is based on an uninspected assumption

A central requirement of the spec is to weight win rates by "pressure cells," which are defined by `ownLevel` and `opponentLevel` (from 1-5). The spec states that the new accumulator will derive these levels by reusing a helper function, `assignOwnOpponentLevels`, from a file that was not provided in the context (`pressure-sensitivity/value-pair.ts`).

Because this function is critical for correctly mapping trials to cells, and its code is not available for review, its correctness is an unverified assumption. Any bugs or logical flaws in this unseen helper would invalidate the "cell-weighted" results.

**[UNVERIFIED]** — The relevant code for `assignOwnOpponentLevels` was not provided, so this finding cannot be confirmed or refuted by the available context.

## Residual Risks

If the spec is implemented as written, the following risks remain:

1.  **Broken Snapshot Data:** The `contributionSummary` and `excludedDataSummary` fields in the domain analysis snapshot will be empty or incorrect, as their data source will have been removed without a replacement. This could break downstream data consumers or UI components.
2.  **Production Failures at Scale:** The service is likely to experience crashes when calculating domain analysis for large domains, due to the vulnerability in the transcript query batching strategy.
3.  **Increased Maintenance Cost:** The codebase will contain two divergent, hard-to-maintain transcript processing pipelines, increasing the risk of bugs and the effort required for future changes.
4.  **Incorrect Analysis:** If the unverified `assignOwnOpponentLevels` helper contains flaws, the resulting `valueWinRates` will be calculated incorrectly, undermining the primary goal of the feature.

## Token Stats

- total_input=25947
- total_output=1381
- total_tokens=31271
- `gemini-2.5-pro`: input=25947, output=1381, total=31271

## Resolution
- status: open
- note: