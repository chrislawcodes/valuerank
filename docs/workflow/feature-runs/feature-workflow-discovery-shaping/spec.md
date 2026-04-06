# Spec
# Spec: Discovery Enforcement

## Problem

Discovery in the feature-factory workflow is currently advisory in practice. The runner
already stores structured discovery data, but a state can still be treated as "complete"
even when unresolved items remain. That creates a false sense of readiness and lets spec
checkpointing proceed too early.

## Goal

Make discovery enforceable so unresolved discovery items must be resolved or explicitly
deferred before discovery can complete, spec can checkpoint, or the workflow can move
forward automatically.

## Requirements

- Discovery must keep using the existing structured `state.json` schema.
- Unresolved discovery items that are not deferred must block discovery completion.
- Explicit deferral uses `discover --defer <item>`, and deferred items remain visible in
  status as non-blocking debt.
- Spec checkpointing must stop if unresolved discovery items remain.
- `status` must surface blocking unresolved discovery items clearly.
- `recommended_next_action` must prefer `discover` while blocking unresolved items exist.
- `discover --clear` is the break-glass recovery path for bad or stale discovery state.
- The change must be non-destructive and should not introduce new external dependencies.

## Non-goals

- New product-discovery questions
- Session handoff tracking
- Deterministic test/build/lint validation gates
- Runner modularization

## Acceptance Criteria

- `discover --complete` fails when unresolved items remain, including `--force-complete`.
- Legacy discovery states without explicit unresolved entries remain grandfathered and do
  not become newly blocking.
- `checkpoint --stage spec` fails when unresolved items remain.
- `status` shows unresolved open items and makes the blocking action visible.
- `next-action` points to `discover` while unresolved items remain.
- Existing structured discovery migration behavior remains intact.
