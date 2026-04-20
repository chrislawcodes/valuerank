---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/remove-decision-code/spec.md"
artifact_sha256: "2c40c139f87d48cfa7bb0659a243acc9093dadee342734a99880c7f5840e6989"
repo_root: "."
git_head_sha: "a50a4b6e54d0816f0ff99be3defba99d0315f4ad"
git_base_ref: "origin/main"
git_base_sha: "bd742f04a07dd015aa976e30754c675d915b3903"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/remove-decision-code/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | Finding | Evidence |
| --- | --- | --- |
| HIGH | `resolveCanonicalDecision` mishandles the new `refusal` state | `[CODE-CONFIRMED]` |
| HIGH | Contradictory definition of the manual override payload | `[CODE-CONFIRMED]` |
| MEDIUM | Migration's "unknown recovery" logic diverges from original parser | `[UNVERIFIED]` |
| LOW | JSDoc allowlist is a weak guardrail for `scaleCodeFromCanonical` | `[UNVERIFIED]` |

---

### HIGH: `resolveCanonicalDecision` mishandles the new `refusal` state
The migration script is designed to write `canonicalDecision` objects with `decisionState: "refusal"`. However, the primary read-path helper, `resolveCanonicalDecision` in `decision-model.ts`, does not have a case to handle this new state. When it encounters a `cachedDecision` where `decisionState` is `'refusal'`, it will fail to produce a corresponding `CanonicalDecision`, falling through to one of the `buildUnknownCanonicalDecision` paths at the end of the function. This means that refusal data correctly written by the migration will be incorrectly interpreted as "unknown" by the API and UI, undermining a key goal of the spec (distinguishing parser failure from model refusal).

**Evidence:** `[CODE-CONFIRMED]`
The function `resolveCanonicalDecision` in `cloud/apps/api/src/graphql/queries/domain/decision-model.ts` checks for `cachedDecision.decisionState === 'neutral'` and `cachedDecision.decisionState !== 'unknown'`, but has no explicit branch for `cachedDecision.decisionState === 'refusal'`. The `isCachedWinnerFirstDecision` helper in `cloud/apps/api/src/graphql/queries/domain/decision-model-helpers.ts` is updated to allow this state, but the downstream consumer is not.

### HIGH: Contradictory definition of the manual override payload
The spec contains a direct contradiction regarding the fields in the manual override mutation payload.
-   **Assumption #2:** `Manual override mutation will be reshaped to accept {favoredValueKey, strength, direction}`.
-   **FR-007 and Key Entities:** State that the payload is `{favoredValueKey, strength}` and the server will derive the `direction`.

This ambiguity creates implementation risk. The intended and more robust design is to derive `direction` on the server to prevent inconsistent client submissions, meaning the assumption is likely a stale artifact that was not updated.

**Evidence:** `[CODE-CONFIRMED]`
The contradiction exists entirely within the provided `spec.md` artifact.

### MEDIUM: Migration's "unknown recovery" logic diverges from original parser
The migration's "unknown-recovery" case (Case 3) specifies using TypeScript helpers (`resolveValueKeyFromText`, `parseJobChoiceStrengthFromText`) to re-interpret `matchedLabel` and recover a canonical decision. This logic appears to be a re-implementation of functionality that lives within the Python-based parser. This introduces a significant risk of divergence; the TS recovery logic may not perfectly match the Python parser's original logic, leading to incorrect recoveries. The project already has a pattern for this type of work in `backfill-reparse-decisions.ts`, which calls the Python parser directly to ensure consistency. The migration should follow this safer pattern.

**Evidence:** `[UNVERIFIED]`
The spec explicitly names the TS helpers to be used. The risk is architectural and based on the principle of not having two implementations of the same business logic. The code for the Python parser itself was not provided to confirm divergence, but the risk is inherent in the specified design.

### LOW: JSDoc allowlist is a weak guardrail for `scaleCodeFromCanonical`
`FR-008` proposes creating a shared helper `scaleCodeFromCanonical` to derive the legacy 1-5 number, but restricts its usage via a JSDoc allowlist comment. This is a convention-based control, not a technical one. It is easily bypassed by developers who are unaware of the convention or under time pressure, creating a pathway for the legacy `decisionCode` logic to creep back into the codebase outside of its intended narrow use case.

**Evidence:** `[UNVERIFIED]`
This finding is based on the design described in `spec.md`. An unenforced comment is a well-known weak guardrail in software engineering.

## Residual Risks

-   **Data Model Complexity:** The `decisionMetadata` JSONB blob stores parser evidence in multiple locations (top-level keys and nested within `summaryCache.summary.decisionMetadata`). The `backfill-reparse-decisions.ts` script even writes to both locations simultaneously. The spec works within this existing complexity but does not address it. This creates ongoing maintenance risks, as developers may read from a stale source of truth, and increases the cognitive load required to work with transcript data.

-   **Unmitigated Client Breakage:** Per `US3`, the spec mandates a "scorched-earth" removal of `decisionCode` from all external APIs to force clients to migrate. While this is intentional, it carries the risk that unknown or forgotten external dependencies (e.g., non-maintained scripts, third-party integrations) will break with no warning. The project may not have a full inventory of all consumers, leading to potential operational incidents post-deployment.

## Token Stats

- total_input=27094
- total_output=1170
- total_tokens=46178
- `gemini-2.5-pro`: input=27094, output=1170, total=46178

## Resolution
- status: open
- note: