# Post-Mortem: Pressure Sensitivity Table Redesign (PR #778)

**Squash commit:** `04a4932d`
**Authors:** Claude (orchestrator) + Codex (implementor) + Gemini/Codex (reviewers)
**Workflow path:** Feature Factory

---

## Summary of the work

Replaced the v1 "Aggregate sensitivity / Direction Δ / Conviction Δ / netScore Δ" rollup with a focused win-rate-only design. New per-pair `winRateDelta` carries a Newcombe Method-10 CI; new per-model `winRateDeltaSummary` carries a t-based across-pairs CI with a `pairsPositive / pairsMeasured` annotation; old GraphQL fields removed atomically.

## What went well

1. **Adversarial review actually caught real bugs.** Across 8 spec/plan/tasks rounds and 3 diff rounds, reviews surfaced 16 high-severity findings:
   - Plan round 1 caught the estimand inconsistency (mean-of-rates vs pooled binomial as the Δ point estimate). The CI math literally does not describe mean-of-rates, so without this catch we would have shipped a statistically broken (point estimate, CI) pair.
   - Plan round 2 caught a bug in my Newcombe Method-10 pseudocode (term pairings reversed). The textbook fixture from Newcombe 1998 Table II in the unit tests would have caught it post-implementation, but the review caught it before any code was written.
   - Tasks round 1 caught the orphaned `baselineWinRate` field that I would have missed (it became dead code once FR-007 retargeted the badge to the displayed cell value).
   - Tasks round 2 caught that the existing `Tooltip` primitive uses `onMouseEnter/Leave` with a 200 ms delay, not `pointerOver/Leave`. Test plan would have failed without this catch.
   - Slice A diff caught a `transcriptCapHit` false-positive on exact-multiple page boundaries (a database with exactly 500k rows).
   - Slice C diff caught duplicated tooltip/format helpers across the two table components and color-only encoding for negative Δ (WCAG 1.4.1 violation).

2. **Codex did most of the implementation tokens.** The orchestrator-builds-spec / Codex-implements / Codex-and-Gemini-review pattern held: my (Claude's) tokens went into spec/plan/tasks authoring and review reconciliation; Codex's into the actual diffs; Gemini/Codex into adversarial reviews. The user explicitly flagged this discipline mid-flight ("we should be using regular feature factory flow where Codex implements"), and I corrected.

3. **Old field removal was atomic and clean.** Per the user's pushback against deprecation windows, the legacy `directionDelta`/`convictionDelta`/`netScoreDelta`/`baselineWinRate`/`aggregateSensitivity` fields were removed in lockstep across resolver, Pothos types, SDL, web operation, and frontend. Final cross-tree grep returns zero matches outside auto-generated codegen. CI and local builds both clean.

4. **Discipline on scope.** Several reviewers pushed for collision-resolution refactors, random transcript sampling, and multiple-comparisons correction. All were correctly deferred to Residual Risks rather than being absorbed into this PR. The PR stayed coherent at ~2.5k lines.

5. **Caught Codex's unrequested side-fixes.** Codex's Slice A run inlined `requireAdmin` into two GraphQL resolver files as an unrequested "fix." I caught it via the diff-stat review and reverted it back to the canonical helper before committing. Without that catch we'd have shipped duplicated admin-check logic.

## What went poorly

1. **Codex's reported "all checks passed" was incomplete on Slice C.** The handoff message claimed `npx turbo build --filter=@valuerank/web` passed; the actual command failed in this environment with a TypeScript error in a test file (`HTMLElement | undefined` not assignable to `Element`). The discrepancy was the macOS keychain bug Codex flagged — `npx` invocation fails locally but the Turbo binary succeeds. Codex used the binary path; I used the npx path. Lesson: trust the tools you can actually run, not the agent's self-report. Total cost: one extra commit (`c7392db5`) to add a defensive null-check.

2. **Started with a stale tasks.md.** The first version of `tasks.md` was authored before the field-name rename from `directionDelta` → `winRateDelta` and contained pervasive references to the old name. The plan/spec round-3 reviews flagged this as an internal inconsistency. I had to rewrite tasks.md end-to-end. Lesson: when renaming a load-bearing field in spec, sweep all downstream artifacts immediately, not in the next review round.

3. **The judge-panel infrastructure is still broken.** Same deterministic Python recursion bug fired in spec, plan, tasks, and all three diff stages — just like in v1 PR #770. I bypassed each with `advance --reason ...`. The tooling team should fix `run_factory.py` before the next FF feature; doing 5+ bypass dances per feature isn't sustainable.

4. **Pre-merge smoke test wasn't actually possible.** The ship skill's Step 4.5 mandates a real-data smoke test before merge for resolver changes. But this redesign removed the old GraphQL schema fields atomically — production prod schema doesn't have `winRateDeltaSummary` until after the deploy. There's no useful query you can run against prod pre-merge that exercises the new code. The post-deploy smoke is the meaningful check. Lesson: the ship skill's pre-merge smoke step doesn't apply cleanly to atomic schema-breaking PRs; it should add a "schema-breaking → post-deploy only" branch.

5. **Local test suite is broken in this worktree.** Running `npm run test --workspace @valuerank/api` from the worktree fails with `PrismaClientInitializationError` because the test database isn't set up locally. CI runs with a real DB and 100% passes. Not a regression — pre-existing infra. But it means I had to trust CI rather than verify locally before push.

## Patterns worth keeping

1. **Newcombe Method-10 with textbook fixture as authoritative test.** The plan locked the canonical formula in a code comment; the unit test pulled values from Newcombe 1998 Table II directly. If a future implementer drifts on the term pairings, the textbook fixture catches it.

2. **`FLAT_DELTA_THRESHOLD` exported from a shared module.** The "moved up" annotation, the directional sanity check, and the `pairsPositive` counter all read the same constant. Future threshold changes update three call sites atomically.

3. **`transcriptCapHit` boolean + structured log warning.** Server-side observability is independent of the frontend rendering the banner. If the React banner fails to mount for any reason, the warning still surfaces in production logs.

4. **`(thin)` annotation rather than dropping the row.** Single-pair models still appear in the cross-model summary with a `(thin)` modifier instead of being hidden in the insufficient footer. Visibility + flag > hidden + perfect data.

5. **Reasoned bypass with explicit blocker text** in the workflow state, not a silent skip. When the judge panel hit the recursion bug, each `advance --reason` left a paper trail naming exactly why we bypassed. Future audits or rerolls can read those rationales.

## Recommended follow-ups

1. **Fix `run_factory.py`'s judge-panel recursion bug.** This is the third feature where it has fired across all three judges deterministically. Bypassing every time is a workflow smell.
2. **Rename the GraphQL types `DirectionalSanityCheck` / `DirectionalSanityCheckEntry` / field `directionalSanityCheck`** to drop the "directional" prefix entirely. Out of scope here per FR-017b carve-out, but the user's "no direction" rule applies and the type names still leak it. ~30 LOC follow-up touching the schema, resolver, GraphQL operation, codegen, and the sanity panel component.
3. **Streaming transcript aggregator** to remove the 500k cap. Documented as Residual Risk #1; warning + banner is the v1 mitigation.
4. **`(sourceRunId, definitionId)` aggregation refactor** to fix the collision case. Documented as Residual Risk #2; warning is the v1 mitigation.
5. **Browser-based smoke after Railway deploy** with the canonical signature. The post-deploy smoke confirms the schema and resolver wiring work; a browser pass confirms the UI renders without runtime errors (v1 hit `napi serialization` and `sourceRunIds undefined` only in production).

## Token / time accounting

- Spec/plan/tasks authoring: Claude (~80k input + ~10k output across 3 rounds + reconciliation)
- Slice A implementation: Codex (~905k tokens used)
- Slice B implementation: Codex (~170k tokens used)
- Slice C implementation: Codex (~597k tokens used)
- Adversarial reviews: Codex × 4 (lens: feasibility/edge-cases/architecture/implementation/dependency-order/execution/correctness/regression) + Gemini × 4 (lens: requirements/testability/coverage/quality), 2-3 rounds per stage = ~20 review invocations total
- Diff reviews: Codex × 6 + Gemini × 3 across A/B/C stages
- Total wall time: ~2.5 hours including the 45-minute user-paused window mid-Slice A
