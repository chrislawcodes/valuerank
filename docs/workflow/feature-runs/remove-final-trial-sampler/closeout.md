# Closeout: remove-final-trial-sampler

**Status:** delivered (PR #630 open)
**Branch:** `claude/goofy-shtern`
**PR:** https://github.com/chrislawcodes/valuerank/pull/630
**Delivery path:** Feature Factory
**Commits:** 8 (1 workflow state + 6 slice commits + 1 factory-tooling rename)

## Outcome

Pure-deletion PR that removes the unused Final Trial / adaptive sampler feature. Net change in `cloud/`: ~2000 lines deleted across 25 files (including 4 whole files), plus 1,566 lines of orphaned lint-output artifacts that were accidentally committed in past PRs. No behavioral change for any real user path — every production call site hardcoded `finalTrial: false` and the UI toggle was never exposed.

Prerequisite for the `winrate-honest-denominator` feature run, which was blocked on the ambiguous semantics of the "final trial" code path.

## Slice sequence

| Slice | Commit | Lines changed | Purpose |
|---|---|---:|---|
| A | `1fda033f` | +75 | Alias test migration (prep, no production code touched) |
| B | `0fb8ffe4` | −634 | Delete sampler service (4 files) + queue cleanup |
| C | `39b9949a` | +25 / −50 | Run start path (service layer) + configExtras sanitizer |
| D | `9ad613a2` | +2 / −41 | GraphQL surface + web + schema + codegen |
| E | `10214b10` | +130 / −4 | Test fixture updates + 4-case sanitizer test block |
| F | `a90bdaeb` | +3 / −1572 | Final grep sweep + orphan artifact cleanup |

Slices B and C intentionally leave the build broken at their commit boundaries; Slices D and E fix those breaks and land in the same PR. Every slice passed its scoped preflight contract at commit time.

## Validation

All 8 Preflight Gate commands pass against the rebased branch (onto origin/main with PR #628's compression middleware):

- `npm run lint --workspace @valuerank/shared` — 0 errors
- `npm run lint --workspace @valuerank/db` — 0 errors
- `npm run lint --workspace @valuerank/api` — 0 errors, 10 pre-existing warnings
- `npm run test --workspace @valuerank/api` — **2003 passed**, 1 skipped (includes new sanitizer test block)
- `npm run build --workspace @valuerank/api` — 0 errors
- `npm run lint --workspace @valuerank/web` — 0 errors, 79 pre-existing warnings
- `npm run test --workspace @valuerank/web` — **1488 passed**
- `npm run build --workspace @valuerank/web` — 0 errors

### Grep contract (Slice F, §7.1–7.3c)

| Check | Expected | Actual |
|---|---|---|
| `finalTrial` case-sensitive, full tree | 0 | 0 |
| `planFinalTrial` | 0 | 0 |
| `FinalTrialPlan` | 0 | 0 |
| `final-trial` (hyphen) | 0 | 0 |
| `Final Trial` (two-word label) | 0 | 0 |
| `final trial` case-insensitive, full tree | 0 (or manual exception) | 0 |
| `isFinalTrial` | exactly 2 sanctioned sites | 2 ✓ |
| `queries/index.ts` | 0 | 0 |
| `schema.graphql` | 0 | 0 |
| `generated/graphql.ts` | 0 | 0 |
| API-side `.graphql` artifact | discovery check | none on disk |
| `find -iname '*final-trial*'` | 0 | 0 |

The 2 sanctioned `isFinalTrial` sites are:

1. `cloud/apps/api/src/services/run/start.ts:222` — the sanitizer destructure key `isFinalTrial: _dropIsFinalTrial` from Task C.1 step 5.
2. `cloud/apps/api/tests/services/run/start.test.ts:1803` — the `DEAD_KEY = 'isFinalTrial'` constant from Task E.3.

### Manual spot-check (Task F.5) — deferred

Task F.5 required an interactive browser session (Chrome DevTools network inspection, log in with dev account, submit a Start Run mutation, confirm no `finalTrial` in the network payload). This was not feasible in this agent run. It is deferred to human review of PR #630.

**The API-side deletion is safe regardless** because the `configExtras` sanitizer in `start.ts` unconditionally strips `isFinalTrial` from any source (fresh form, rehydrated draft, local storage, stale client cache, primitive input, array input, null/undefined). The 4-case sanitizer test block in `start.test.ts` proves the sanitizer handles all branches of the guard. A stale browser payload cannot corrupt persisted run config.

## Notable incidents

### Review loop runaway (14 rounds)

The tasks-checkpoint Codex `execution-adversarial` review went 14 rounds before convergence was declared. Most of the later rounds surfaced repeated `[UNVERIFIED] MEDIUM` findings that could not be resolved against the artifact alone. Resolution: accepted convergence with a transparent note documenting that remaining concerns are deferred to the Task F.4 Preflight Gate at runtime validation. This is the expected termination pattern for adversarial reviews that cannot prove a negative against source text.

### User-caught hand-writing mid-Slice A

Slice A was hand-written (aliases.test.ts created via Write tool) instead of being dispatched to Codex. The user noticed and asked "Is Codex writing the code?" — a correction that caught me violating the Feature Factory delegation contract. Fix: kept Slice A committed (it was already done), dispatched Slices B–F to Codex. The user then asked me to spawn a subagent to propose safeguards against this failure mode, and to apply Option 1 (rename `implement_next_slice` → `dispatch_next_slice_to_codex` in `factory_review.py`). Applied as a separate commit `24de1092` on the same branch.

### Codex sandbox blockers

Codex's sandbox limits it to `[workdir, /tmp, $TMPDIR]`. This caused two separate blockers:

1. **Slice B (git index)**: Codex initially returned `IMPLEMENTATION_BLOCKED: cannot write to .git/worktrees/goofy-shtern/index.lock`. Fix: rewrote the Slice B spec to forbid Codex from running git commands, made Claude own all git operations after Codex returns.
2. **Slice E (Postgres localhost)**: Codex's sandbox returned EPERM on connections to `127.0.0.1:5433` and `::1:5433`, so the integration-style sanitizer test couldn't run. Fix: Codex completed all edits successfully, then returned `IMPLEMENTATION_BLOCKED: test DB not reachable`. Claude ran the tests from an unsandboxed shell — all 2004 API tests passed including the new 4-case sanitizer block.

### Main drift and rebase

Main advanced 10 commits between branch creation and PR delivery, including PR #628 which added a `compression` middleware dependency. Rebase onto origin/main was clean (8 commits replayed with no conflicts), but `npm install` was needed afterward to pick up the new `compression` package before the post-rebase preflight could pass. The post-rebase API test count dropped by 1 (2004 → 2003) because a new test skipped flag landed on main; the new sanitizer test block's 5 cases (1 object + 1 primitive + 1 array + 2 nullish via `it.each`) are all still passing.

### Orphan lint artifacts (Slice F surprise)

The Slice F full-tree grep caught 5 lint-output log files (`cloud/lint_output.txt`, `cloud/lint_report.txt`, `cloud/global_lint_output.txt`, `cloud/api_lint_full.txt`, `cloud/apps/api/lint_output.txt`) that were accidentally committed in past PRs and contained stale references to the deleted `final-trial-plan.ts` filename. These are build artifacts that should never have been tracked. Deleted as pure cleanup in the Slice F commit — 1,566 lines removed. The `.gitignore` was protected and not touched; adding these globs is a follow-up for a future PR.

## Follow-ups

1. **Unblock `winrate-honest-denominator`** — the feature run that was blocked on this deletion. Resume at its next factory stage once PR #630 merges.
2. **`.gitignore` cleanup** — the 5 deleted lint-output files should be added to `.gitignore` so they don't get re-committed. Out of scope for this PR (the AGENTS.md contract forbade `.gitignore` edits during Slice F), but worth a tiny follow-up PR.
3. **Coverage threshold**: sanitizer test adds ~130 lines to `start.test.ts` and exercises the new `safeConfigExtras` branches. Coverage for `start.ts` should go up measurably — confirm against the coverage baseline after merge if anyone is tracking.

## Data point for the review-effort experiment

Per `~/.claude/rules/experiment-review-protocol.md`, the purpose of adversarial reviews is to measure whether they change the code, not whether AI agents agree. This feature run's tasks-review loop (14 rounds) did change the artifact materially across rounds 8–13, but rounds 13 and 14 surfaced only repeated findings. Rounds 8–12 were net-positive (caught real ambiguities in the grep design, the test fixture circularity, the `temperature` empirical verification, and the C.3 coverage note). Rounds 13–14 were net-neutral. Convergence cap at round 14 was the right call.
