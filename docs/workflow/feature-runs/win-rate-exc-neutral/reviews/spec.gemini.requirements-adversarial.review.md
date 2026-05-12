---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/win-rate-exc-neutral/spec.md"
artifact_sha256: "006570fbd47340ccb5f569d369c2234fd9c7c3e40997b4b732f8ca1d202a7b95"
repo_root: "."
git_head_sha: "8c8e3ecb4692e3642b26b8b571017d0d04c6983b"
git_base_ref: "origin/main"
git_base_sha: "8c8e3ecb4692e3642b26b8b571017d0d04c6983b"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/win-rate-exc-neutral/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. Toggle State Persistence is Contradictory
- **Severity:** HIGH
- **Finding:** The specification contains a direct contradiction regarding the persistence of the "Exc. neutral" toggle state.
  - User Story `US-1`, Acceptance Scenario 3 states: "Given the researcher selects 'Exc. neutral,' when they switch to a different domain, then the toggle state persists..."
  - The `Edge Cases` section states: "Toggle state on page navigation: toggle is local React state per page; it does not persist across navigation or in the URL."
- **Impact:** These requirements are mutually exclusive. Implementing one will violate the other, leading to unpredictable UI behavior for the user.
- **Evidence:** `[CODE-CONFIRMED]`
  The `DomainAnalysis.tsx` file shows that domain selection is managed via `useSearchParams`. Changing the domain updates the URL and triggers a re-render and data refetch for the page component. A simple `useState` for the toggle, as implied by the "local React state" note, would be reset during this "navigation" event, failing to meet `US-1`.

### 2. Ambiguous `null` for Exc-Neutral Win Rates Prevents Required UI Behavior
- **Severity:** HIGH
- **Finding:** Functional Requirement `FR-006` mandates two different UI behaviors for `null` exc-neutral win rates: an indicator for "cache not ready" and "n/a" for "zero decisive responses." However, the proposed API changes (`FR-008`, `FR-009`, `FR-010`) would result in a simple `null` value from the GraphQL API in both cases.
- **Impact:** The frontend will be unable to distinguish between the two scenarios, making it impossible to implement `FR-006` as specified. It will either show the wrong indicator or the wrong fallback value, failing a key functional requirement and likely confusing the user.
- **Evidence:** `[CODE-CONFIRMED]`
  The existing function `extractWinRates` in `domain-analysis-cache.ts` shows a precedent for this ambiguity. It returns `null` if the total for a calculation is zero. The proposed calculation `counts.prioritized / (counts.prioritized + counts.deprioritized)` would also produce `null` (or `NaN` converted to `null`) when the denominator is zero. The API would also return `null` for a field that is absent from an older snapshot. The front-end therefore cannot differentiate the reason for the `null`.

### 3. Redundant GraphQL Field for Pairwise Matrix
- **Severity:** MEDIUM
- **Finding:** `FR-011` requires adding a new `winRateExcNeutralMatrix` field to the GraphQL schema. This is redundant because the data required to calculate both standard and exc-neutral win rates is already being fetched.
- **Impact:** This will unnecessarily bloat the GraphQL schema and the frontend data model. It introduces a new field that has to be maintained, when the existing data structure could be used to derive both representations on the client or in the resolver.
- **Evidence:** `[CODE-CONFIRMED]`
  The function `buildPairwiseWinRateModel` in `domain-analysis-cache.ts` already fetches `pairwiseWins` and `pairwiseNeutrals`. These two components are sufficient to compute both win rate modes. The "exc-neutral" calculation is simply the standard one with `neutrals` omitted from the denominator.

### 4. Underestimated Complexity of Two-Phase Snapshot Write
- **Severity:** MEDIUM
- **Finding:** The specification requires a two-phase database write for the analysis snapshot (`FR-007`) to ensure the page is usable while exc-neutral data is computed. This is a significant architectural change that is presented as a simple modification.
- **Impact:** The existing `buildSnapshotOutput` function is a single, monolithic operation. Splitting it into two reliable, fault-tolerant phases is a complex task. Underestimating this complexity increases the risk of implementation delays and introduction of bugs, such as race conditions or snapshots getting stuck in an intermediate state if Phase 2 fails.
- **Evidence:** `[CODE-CONFIRMED]`
  The file `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-builder.ts` contains the large, synchronous `buildSnapshotOutput` function, confirming that this is not a trivial modification.

### 5. Misidentified File for Backend Change
- **Severity:** LOW
- **Finding:** The "Key Files" section incorrectly identifies `cloud/apps/api/src/services/analysis/value-win-rate-aggregation.ts` as the place to add an "exc-neutral mode parameter".
- **Impact:** This points to a minor misunderstanding of the codebase within the spec. While low-impact, it could cause a developer to initially look in the wrong place, wasting time. The actual win rate calculations from raw counts occur elsewhere.
- **Evidence:** `[CODE-CONFIRMED]`
  The source code for `value-win-rate-aggregation.ts` shows that it aggregates already-computed rates (`ValueRateInput` contains `vignetteRate`), it does not calculate them from raw win/loss/neutral counts.

## Residual Risks

Even if all findings are addressed, the following risks remain:

- **User Confusion on Fallback:** The requirement to fall back to the standard win rate when exc-neutral data is unavailable (`FR-006`) could confuse users. A user might select "Exc. neutral" mode, see numbers change, and not realize they are viewing the "All responses" data because of a background cache miss. The UI indicator required by `FR-006` is intended to mitigate this, but its effectiveness depends on it being sufficiently noticeable.
- **Cache Inconsistency from Two-Phase Write:** The two-phase write process (`FR-007`), while resilient, introduces a time window where the cache is internally inconsistent (Phase 1 data exists, Phase 2 does not). If the Phase 2 process fails silently or is repeatedly interrupted, some domains could be left without exc-neutral data until the next full cache rebuild is triggered, which may not happen for a while. This could appear to users as the feature being broken for specific domains.

## Token Stats

- total_input=39285
- total_output=1354
- total_tokens=45847
- `gemini-2.5-pro`: input=39285, output=1354, total=45847

## Resolution
- status: open
- note: