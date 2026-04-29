---
reviewer: "gemini"
lens: "quality-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/implementation.diff.patch"
artifact_sha256: "d54fe983caa2329cfe0bfd339ae00da2fca89d42d57cf2ec7b0702bff9f23bc8"
repo_root: "."
git_head_sha: "6f68da8676f6cefa892631008e0a91c8bf9c8b79"
git_base_ref: "3565133420c716ceba3bc46c0cb784ce7151b8ed"
git_base_sha: "3565133420c716ceba3bc46c0cb784ce7151b8ed"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "MEDIUM (orderBy patch on deeper symptom) ACKNOWLEDGED. Collision root-cause fix is out of scope per Residual Risk; orderBy makes the symptom reproducible while we wait for telemetry from the new warning. LOW (client null handling for winRateDelta) DEFERRED to Slice C which renders the dash and reason hover per FR-008. This slice (B) only updates the operation shape."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/diff.gemini.quality-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff quality-adversarial

## Findings

| Severity | Finding |
| :--- | :--- |
| **MEDIUM** | **[UNVERIFIED] Arbitrary Determinism May Obscure Data Integrity Issues** |
| **LOW** | **[UNVERIFIED] Client May Not Gracefully Handle Null Delta Calculations** |

### **MEDIUM: [UNVERIFIED] Arbitrary Determinism May Obscure Data Integrity Issues**
**File:** `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts`

The addition of `orderBy: { id: 'asc' }` to the `run` query is intended to make a "last write wins" scenario deterministic when multiple runs collide for the same source. While this prevents inconsistent query results, it feels like a patch on a deeper symptom.

- **Weak Assumption:** It assumes the highest `id` always represents the most "correct" or "final" run. This may not be true if data is backfilled, re-imported, or if parallel processes create runs out of order.
- **Hidden Flaw:** Instead of resolving *why* collisions are happening, this change simply picks a winner based on an arbitrary implementation detail (the auto-incrementing primary key). This could mask underlying bugs or race conditions in the run creation logic, leading to the system silently using potentially incorrect source data. A more robust solution would be to address the source of the collisions.

### **LOW: [UNVERIFIED] Client May Not Gracefully Handle Null Delta Calculations**
**Files:** `cloud/apps/web/src/api/operations/pressureSensitivity.graphql`, `cloud/apps/web/src/api/operations/pressureSensitivity.ts`

The new `winRateDelta` field on `valuePairs` is nullable. This is confirmed by the use of `NonNullable` in the web app's TypeScript types. While the `reason` field inside the `winRateDelta` object can explain *why a valid calculation might be invalid*, there appears to be no explicit handling for the case where the entire object is `null`.

- **Omitted Case:** If the backend returns `null` (e.g., due to having zero `qualifyingTrials`), the client-side logic must be prepared to handle this. Without seeing the UI code, it's possible this could lead to a crash (e.g., trying to access a property on `null`) or a confusing empty state. The UI should explicitly check for null and render a state that communicates "Not enough data to compute."

## Residual Risks

- **Breaking API Change**: The GraphQL schema has undergone significant renaming and restructuring (e.g., `aggregateSensitivity` -> `winRateDeltaSummary`, `directionDelta` -> `winRateDelta`). While the web client is updated within this artifact, any other consumer of this API (e.g., data analysis scripts, other internal tools) will break upon deployment. This introduces a risk of service disruption for consumers not accounted for in this change.
- **Loss of Granularity**: The previous implementation exposed `directionDelta`, `convictionDelta`, and `netScoreDelta`. The new implementation consolidates these into a single `winRateDelta`. While this may be an intentional simplification, it represents a loss of data granularity in the API. If clients relied on `conviction` or `netScore` for specific insights, that functionality is now lost. This could be a regression unless it was an explicitly planned removal of those concepts.

## Token Stats

- total_input=13291
- total_output=727
- total_tokens=16011
- `gemini-2.5-pro`: input=13291, output=727, total=16011

## Resolution
- status: accepted
- note: MEDIUM (orderBy patch on deeper symptom) ACKNOWLEDGED. Collision root-cause fix is out of scope per Residual Risk; orderBy makes the symptom reproducible while we wait for telemetry from the new warning. LOW (client null handling for winRateDelta) DEFERRED to Slice C which renders the dash and reason hover per FR-008. This slice (B) only updates the operation shape.
