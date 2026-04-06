# Vignette Analysis Decision Model Phase 1 — Plan

## Goal

Establish the canonical decision contract for vignette-analysis without changing the meaning
of any existing V1 fields or migrating any live consumer surface yet.

Phase 1 is intentionally narrow:

- update active docs so `direction + strength` is the canonical model for value-labeled
  transcripts
- add a shared, pure adapter boundary for canonical and legacy-compatible decision shapes
- add a default-off `decision_model_v2` config hook
- prove the adapter with deterministic tests and legacy parity checks
- leave API, worker, export, and web consumers on the current V1 path

## Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| Canonical contract shape | `RawDecisionEvidence`, `CanonicalDecision`, `LegacyDecisionCompat` | Keeps audit evidence, canonical meaning, and legacy compatibility separated |
| Adapter placement | `cloud/apps/api/src/graphql/queries/domain/decision-model.ts` | Keeps phase-1 logic in one shared module instead of scattering it through query code |
| Integration point | `cloud/apps/api/src/graphql/queries/domain/shared.ts` | Lets existing domain-analysis code import the adapter later without changing the current consumer behavior in phase 1 |
| Flag hook | `cloud/apps/api/src/config.ts` | Uses the repo's existing env/config style instead of inventing a new feature-flag service |
| Manual override shape | Canonical-first `appliedDecision` plus `previousDecisionCode` audit history | Makes the override authoritative in the new model while preserving the prior legacy value for audit |
| Provenance handling | `deterministic`, `manual`, `error`, `unknown` | Keeps the failure model explicit and fail-closed |
| Legacy compatibility | `canonicalScore` is derived, `rawScore` remains available for legacy numeric history | Preserves current scalar-dependent code paths without redefining V1 semantics |

## Contract Recap

The phase-1 plan implements the spec's contract, not a new one.

- `RawDecisionEvidence` carries parser audit data, manual override history, and parse
  provenance
- `CanonicalDecision` carries the canonical meaning used by later report surfaces:
  `favoredValueKey`, `opposedValueKey`, `direction`, `strength`, normalization metadata, and
  `source`
- `LegacyDecisionCompat` carries compatibility scalars for older analysis math and exports
- `parsePath` is audit provenance only and is never rewritten by normalization
- canonical validity rules are fail-closed: missing metadata, malformed metadata, malformed
  overrides, and unrecognized parser states all resolve to `unknown` or `error`
- manual overrides are canonical-first: the override decision wins, and the previous legacy
  code is audit history only
- exact and fallback-resolved parses are deterministic branches, not fuzzy heuristics
- `neutral` and `unknown` are matched states; mixed direction/strength combinations are
  invalid

## Wave Breakdown

| Wave | Scope | Files | Exit Rule |
|---|---|---|---|
| 1 | Lock terminology in active docs | `docs/canonical-glossary.md`, `docs/valuerank_prd.yaml`, `docs/README.md` | Active docs no longer teach score-first semantics as the main vignette-analysis model |
| 2 | Add the canonical adapter boundary and flag hook | `cloud/apps/api/src/config.ts`, `cloud/apps/api/src/graphql/queries/domain/decision-model.ts` | Adapter functions are pure, typed, and do not mutate any consumer surface |
| 3 | Wire integration points and test coverage | `cloud/apps/api/src/graphql/queries/domain/shared.ts`, `cloud/apps/api/tests/graphql/queries/domain/decision-model.test.ts` | Legacy numeric fixtures and adapter examples both pass, and existing query outputs stay identical on current fixtures |

## Implementation Notes

- The adapter must be a pure function layer, not a query-local helper, so later phases can
  reuse it from API, worker, and export code.
- `parsePath` stays as audit provenance and is not rewritten by normalization.
- `shared.ts` may import the new adapter later, but phase 1 must not change the meaning of
  current query outputs.
- The new config hook exists now so later phases can gate consumer rollout without adding a
  second rollout mechanism.
- The first phase should not try to solve the full override-history problem. It preserves the
  latest prior value and the current canonical override, which is enough for phase 1 audit
  and replay.
- `fallback_resolved` is a deterministic parser branch, not a free-form rescue path.
- label resolution must allow a matched label to refer to either value in the pair; favored
  vs. opposed is derived from the parse branch and orientation metadata.
- plan-phase verification should use deep-equality assertions for the specified API query
  outputs and worker artifacts, not a manual spot-check.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Historical rows without pair/orientation metadata may remain undecodable canonically | Some legacy transcripts may only preserve the scalar compatibility path | Keep `LegacyDecisionCompat` available and treat canonical unknowns as explicit coverage gaps |
| Manual override semantics can drift if the adapter and tests disagree on valid input | Broken audit trail or inconsistent canonical results | Keep override validation in the adapter and add explicit negative tests for inconsistent inputs |
| `shared.ts` refactor could silently change live outputs | User-visible regressions in analysis views | Require regression checks on current legacy fixtures before any consumer wiring lands |
| The feature flag exists before any consumer uses it | Dead code risk if later phases stall | Treat the flag as a boundary only; later phases must wire it into a real consumer before rollout |

## Verification Plan

1. Run the phase-1 adapter tests for exact, fallback, ambiguous, unparseable, manual
   override, orientation normalization, and malformed metadata cases.
2. Run parity checks against the existing numeric legacy fixtures in
   `cloud/apps/api/tests/graphql/queries/domain-analysis.test.ts` and
   `cloud/workers/tests/test_analyze_basic.py`.
3. Add explicit tests for:
   - canonical unknowns on missing metadata
   - valid manual override application
   - invalid manual override rejection
   - `decision_model_v2` defaulting off in config
   - unchanged domain-analysis output on the designated legacy fixture set
4. Confirm the new docs no longer teach score-first semantics as the primary model with a
   grep-style check over the three listed doc files.

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Added canonical-first override fields, explicit direction-plus-strength contract wording, and fail-closed parse and compatibility rules.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: Clarified orientation normalization, label resolution, and error-versus-unknown behavior for canonical decisions.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Defined rawScore and canonicalScore mapping, legacy compatibility preservation, and the phase-1 adapter boundary.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: The plan intentionally anchors the phase-1 adapter in the API GraphQL domain module, while later phases reuse it through service wrappers and server-side boundaries rather than direct cross-language import. The failure/provenance contract is now explicit in the plan, so the remaining concerns are architectural follow-on risks, not blockers for this checkpoint.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: The plan now defines the invalid-override failure mode, required null and neutral coverage, and a concrete parity-check rule using legacy fixture outputs. The remaining fixture-golden-set concerns are valid but not blockers for this wave because the parity scope is explicitly bounded to the designated legacy fixtures.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: The plan now spells out precedence, provenance, and compatibility mapping in the contract recap and deterministic rules, so the implementation concerns are addressed at the planning layer. The API-layer placement is intentional for the initial shared adapter boundary, with later consumer wrappers handling reuse.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: Added inline fixture creation to Slice 2, explicit mixed-precedence coverage, and a broader docs/repo sanity check so the task list is self-contained enough to implement safely.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: Added a web typecheck sanity check for the shared export boundary, explicit true-path config coverage, mixed-precedence coverage, and a narrow import-compatibility check for the shared barrel.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Added a regression-test-on-edge-case clause to Slice 3 and clarified that valid overrides can coexist with conflicting raw metadata without ambiguity.
- review: reviews/diff.gemini.regression-adversarial.review.md | status: deferred | note: Deferred as intentional report-level consistency. The surface keeps one decision mode per report view, and mixed conditions remain legacy until the condition is fully V2-backed.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: deferred | note: Deferred as intentional report-level consistency. The surface keeps one decision mode per report view, and mixed conditions remain legacy until the condition is fully V2-backed.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: deferred | note: Deferred as intentional report-level consistency. The surface keeps one decision mode per report view, and mixed conditions remain legacy until the condition is fully V2-backed.

## Acceptance Criteria

- The canonical contract is documented and deterministic
- The adapter can derive canonical and legacy-compatible outputs from the same transcript
- The phase-1 feature flag exists and defaults off
- Existing V1 field semantics remain unchanged
- Existing consumer behavior remains unchanged
- Phase 1 stops before any API, worker, export, or web consumer migration
on
