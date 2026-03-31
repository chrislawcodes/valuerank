# Feature Factory Experiments

Tracking whether adversarial reviews (factory pipeline) actually change code vs. Claude-direct solo.

**Measurement:** git SHA before and after each review. If the SHA changed, the review had teeth.

**Pattern hypothesis:** Factory has an edge on backend/algorithmic work. Claude-direct has an edge on UI/nav work where codebase context eliminates false assumptions.

---

## Experiment 5 — `provider-budget` (2026-03-31)

**Feature:** Per-provider balance tracking — manual entry, auto-deduct on run completion, manual sync with drift logging, soft pre-run warning gate. UI on Settings → Models.

**Direct PR:** #482 (closed, duplicate) | **Factory PR:** #483 (merged)

| | Claude-direct | Factory |
|--|--------------|---------|
| Reviews that changed code | 3/4 (spec, plan, tasks) | 2/3 (spec via Gemini, plan via Codex) |
| Critical catch | Spec: `Run` has no `estimatedCost` (would be runtime bug); Tasks: race condition on deduction → atomic `{ decrement }` | Spec: cost data source clarified (`run.config.estimatedCosts.perModel`); added FR-015/016/017 |
| Post-implementation bug | None caught | `cache-only` → overdraft check silent in cold session (caught in manual review, fixed before merge) |
| Tests | 0 new | 2 new test files (mutations + deduct service) |
| Claude tokens | 73,642 (306 input + 73,336 output) | 7,029 (202 input + 6,827 output; coordinator only — excludes Gemini/Codex) |
| Human interruptions | 0 | 2 (Prisma version conflict, cache-only bug) |

**Verdict:** Factory won on tests — it added 2 test files that direct skipped entirely. Both pipelines caught the same core correctness issues (atomic deduction, cost data source). Factory required 2 human interventions (Prisma version conflict mid-run, cache-only bug missed by Phase 7 cleanup). Direct ran cleanly.

**Lesson:** Factory enforces test discipline that direct skips. For features with non-trivial service logic, that's worth the overhead. But factory still needs human review of the final output — it shipped a silent bug in the pre-run gate.

---

## Experiment 4 — `cross-run-reliability` (2026-03-31)

**Feature:** Fix `build_pooled_aggregate_reliability` so N-runs × 1-sample/condition aggregates surface `baselineReliability` + `directionalAgreement` instead of "unavailable". Also fix silent drift collection bug.

**Direct PR:** #471 | **Factory PR:** #472

| | Claude-direct | Factory |
|--|--------------|---------|
| Reviews that changed code | 1/1 (self-review: removed dead loop) | 3/4 (spec, plan, Codex adversarial) |
| Critical catch | n/a | Codex adversarial caught: `drift_samples` still always empty after implementation — wrong key name (`uniqueScenarios` not in `ModelStats`). Tests passed silently. |
| False positives | 0 | 1 (Gemini HIGH on `isMultiSample` — misread, uses `max` not `avg`) |
| Tests | 32/32 | 32/32 |
| Claude tokens | 125,452 | 129,517 |
| Human interruptions | 0 | 0 |

**Verdict:** Factory was worth it. The Codex adversarial review caught a silent correctness bug that unit tests masked — the drift fix compiled and all tests passed, but `drift_samples` was always empty because Codex used the wrong dict key. Claude-direct avoided this by writing the fix directly with the correct field names. Token delta negligible (<4%).

**Lesson:** Use factory for Python worker internals with non-obvious field names. Direct is fine for straightforward refactors.

---

## Experiment 3 — `settings-restructure` (2026-03-30)

**Feature:** Restructure Settings nav from single tab to dropdown with separate pages per section. Move Preambles + Level Presets from Domains dropdown to Settings > Research Setup.

**PR:** #468

| | Claude-direct | Factory (spec+checkpoint) |
|--|--------------|--------------------------|
| Pre-impl actionable findings | 4 (redirect, ref/state wiring, tests, thin wrappers) | 0 actionable |
| Unique findings | 4 real structural issues | 0 |
| False positives | 0 | 6 (deep links, RBAC, shared state, MEMORY.md clause misread) |
| Human interruptions | 0 | 1 (triage) |
| Tests | 1466/1466 | — |

**Verdict:** Factory overhead not justified. All 6 factory findings were false positives based on assumptions that don't hold (app has no URL-hash tabs, no RBAC, no shared panel state). Claude-direct caught the real structural issues (redirect needed, NavTabs ref/state wiring, test updates) via pre-implementation analysis.

**Lesson:** UI/nav refactors favor direct. Codebase context eliminates the assumptions that factory reviewers false-positive on.

---

## Experiment 2 — `aggregate-cross-batch-reliability` (2026-03-30)

**Feature:** Fix reliability metrics for mixed aggregates (some within-run repeats, some without).

**PR:** #466

| | Claude-direct | Factory (spec+checkpoint) |
|--|--------------|--------------------------|
| Actionable findings pre-implementation | 0 | 3 |
| Unique findings | 0 | 1 HIGH (mixed-mode gap — real correctness bug) |
| False positives | n/a | Low |
| Human interruptions | 0 | 1 (approved acting on all findings) |

**Verdict:** Factory justified. Caught a real correctness bug: the conditional fallback silently under-reported reliability for mixed aggregates. Final implementation materially better because of the review.

---

## Experiment 1 — `domain-coverage-hub` (2026-03-30)

**Feature:** UI feature — domain coverage hub page.

**PR:** #465

| | Claude-direct | Factory (spec+checkpoint) |
|--|--------------|--------------------------|
| Actionable findings pre-implementation | 7 | 4 |
| Unique findings | 3 (file size limit, legacy fallback, empty state) | 0 |
| False positives | Low | Several |
| Human interruptions | 1 (4 product decisions) | n/a |

**Verdict:** Factory's one "unique" finding turned out to be a deliberate architectural choice. Claude-direct caught more real issues.

---

## Running Tally

| Experiment | Type | Factory worth it? | Key reason |
|-----------|------|-------------------|------------|
| 1 — domain-coverage-hub | UI | No | Claude-direct found more real issues; factory had false positives |
| 2 — aggregate-cross-batch-reliability | Backend bug fix | Yes | Factory caught real correctness gap Claude-direct missed |
| 3 — settings-restructure | UI/nav refactor | No | 6 false positives, 0 actionable |
| 4 — cross-run-reliability | Backend/worker fix | Yes | Codex adversarial caught silent wrong-key bug that passed tests |
| 5 — provider-budget | Full-stack feature | Partial | Factory enforced test discipline; both caught same correctness bugs; factory needed 2 human interventions |

**Pattern (5 data points):** Factory 2/2 on backend/algorithmic work. Claude-direct 2/2 on UI/nav work. Full-stack features are mixed — factory adds test coverage but introduces more process friction.

**Recommendation:** Route features by type before choosing pipeline:
- Backend algorithmic / Python worker internals → factory
- UI / nav / component refactors → direct
- Full-stack features → factory if test coverage is the priority; direct if clean execution matters more
