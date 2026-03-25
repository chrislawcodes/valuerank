# Plan
# Plan: Discovery Enforcement

## Approach

Use the existing structured discovery state in `state.json` and make unresolved items
first-class blockers instead of advisory metadata.

The canonical identity for a discovery item is the normalized item text stored in
`unresolved[]`. `discover --resolve <item>`, `discover --defer <item>`, status reporting,
and checkpoint gating must all use the same normalized text comparison. This slice keeps
that truth in one helper so the runner does not drift across multiple interpretations.

## Implementation Outline

1. Add a pure helper in `factory_state.py` to identify unresolved discovery items that
   still block progress.
2. Wire that helper into `discover` so completion cannot be marked while blocking
   unresolved items remain.
3. Wire the same rule into spec checkpointing so the runner refuses to checkpoint spec
   until the discovery debt is either resolved or deferred.
4. Surface the same blocking state in `status` and `recommended_next_action` so the
   workflow output cannot drift from the enforcement logic.
5. Update the maintained plan and skill guidance to match the implemented behavior.
6. Add regression tests around completion, status, and checkpoint gating.

## Risk Notes

- The helper must ignore deferred items so the runner can intentionally carry accepted
  unknowns forward.
- Migration behavior must remain stable for existing discovery blobs. Only explicit
  `unresolved[]` entries that are not deferred should block progress; old discovery blobs
  without those entries are grandfathered.
- `--force-complete` is not a bypass for unresolved blockers. The recovery path for bad
  discovery state is `discover --clear`, but targeted `discover --resolve` / `--defer`
  operations should be used first wherever possible.
- The change must stay small; this is an enforcement slice, not a broader discovery model
  rewrite.
- The runner already uses atomic JSON writes in the shared state helpers; this slice must
  preserve that behavior and continue to avoid ad hoc file writes in command code.

## Reconciled Review Decisions

- Define the explicit deferral mechanism as `discover --defer <item>`.
- Keep deferred items visible in `status` so they are acknowledged, not hidden.
- Treat legacy discovery blobs as grandfathered unless they contain explicit blocking
  unresolved items.
- Keep `discover --clear` as the break-glass recovery path instead of reintroducing a
  blanket override.
- Make the recovery path visibly destructive in the plan so it is clearly reserved for
  malformed or irrecoverable state, not normal blocker resolution.
- Leave status summarization refinements for a later slice unless review demands it again.

## Slice Boundary

This slice stops after discovery enforcement. Handoff state, deterministic validation gates,
and runner modularization are deliberately left for later slices.

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Accepted after clarifying explicit deferral, grandfathered legacy discovery blobs, and discover --clear as the recovery path; remaining status summarization is deferred to a later slice.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: Accepted after clarifying explicit deferral, grandfathered legacy discovery blobs, and discover --clear as the recovery path; remaining status summarization is deferred to a later slice.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Accepted after clarifying explicit deferral, grandfathered legacy discovery blobs, and discover --clear as the recovery path; remaining status summarization is deferred to a later slice.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: Accepted after defining a single normalized discovery item identity, keeping all gates on one helper, and using discover --clear only for malformed or irrecoverable state.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Accepted after defining a single normalized discovery item identity, keeping all gates on one helper, and using discover --clear only for malformed or irrecoverable state.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Accepted after defining a single normalized discovery item identity, keeping all gates on one helper, and using discover --clear only for malformed or irrecoverable state.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: Accepted after tightening the verification matrix to cover discover, status, checkpoint gating, next-action, and the canonical blocking helper; discover --clear remains the break-glass recovery path.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: Accepted after tightening the verification matrix to cover discover, status, checkpoint gating, next-action, and the canonical blocking helper; discover --clear remains the break-glass recovery path.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Accepted after tightening the verification matrix to cover discover, status, checkpoint gating, next-action, and the canonical blocking helper; discover --clear remains the break-glass recovery path.
- review: reviews/diff.gemini.regression-adversarial.review.md | status: accepted | note: Accepted after making malformed blockers explicit, removing prefix-based malformed detection, and preserving valid discovery context while using discover --clear as a surgical recovery path.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: Accepted after making malformed blockers explicit, removing prefix-based malformed detection, and preserving valid discovery context while using discover --clear as a surgical recovery path.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: Accepted after making malformed blockers explicit, removing prefix-based malformed detection, and preserving valid discovery context while using discover --clear as a surgical recovery path.
