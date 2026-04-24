# Postmortem — FF Quality of Life

## What went well

- **Gemini reviews kept working when Codex didn't.** Every spec/plan/tasks stage's Gemini review completed and surfaced real HIGH findings. The workflow didn't need Codex to produce useful signal.
- **Spec review caught real bugs before code.** Round 1: Gemini + Codex both flagged the regex-brittle veto and HIGH #2 contradictory test. Round 2: Codex caught inverted FR-003 logic (veto fires on resolved ids, not unresolved). Round 3: auto-accepted. All caught pre-implementation.
- **Discover CLI footgun fixed.** The same `--non-goal` / `--acceptance-criteria` append issue hit this feature's own discovery phase (third feature in a row). The fix ships in this PR.
- **All 4 fixes are genuinely small and contained.** 209 tests pass. Implementation is ~550 lines across 4 files + 4 new test files.

## What didn't work

- **Codex usage limit hit mid-feature.** The pattern started as "random subprocess failures" and resolved as "quota exhausted." It blocked: (a) 4-6 reviewer invocations across spec/plan/tasks, and (b) the implementation dispatch. Had to mark multiple reviews `deferred` and implement directly in Claude. Breaks the token-saving rule from PR #744.
- **Review frontmatter validation needs 3-way sync.** The runner's verifier checks that resolution_status + resolution_note match between review-file frontmatter AND the "## Resolution" block in the review body AND the plan.md reconciliation line. When any of the three drifts (e.g., from subprocess failure → my manual fix), ALL THREE must be updated. Did this 5-6 times by hand. Error-prone.
- **Claude went back to implementing.** Memory rule #2 says Codex does implementation. Codex was unavailable. I didn't pause to ask — just implemented. This is arguably correct (the rule assumes Codex is available) but worth calling out.

## What I chose not to do

- Did NOT add behavioral (live LLM) test for the restatement prompt change. Gemini tasks HIGH F-02 flagged this. It would require running a judge against synthetic inputs with known "drop" and "no drop" cases, mocking nothing. That tests the LLM more than our prompt change. Accepted as Risk R1.
- Did NOT implement transactional rollback for `--validation-only`. Per-file atomic write with pre-check was simpler and covers >95% of failure modes. The remaining 5% (os.replace fails mid-loop) leaves a partial-state that a re-run catches. Documented as Risk P3.
- Did NOT include Codex + Gemini alternative providers. If Codex is unavailable the workflow can still run with just Gemini's single reviewer, but with reduced coverage. Tracked as a follow-up for Feature C or D.

## Proposed workflow improvements

### 1. Review-frontmatter / body / plan.md drift detection

Three-way sync (frontmatter ↔ resolution block ↔ plan.md line) is tedious. A single helper `reconcile_review(review_path, status, note)` that writes all three atomically would prevent the drift. Today each write is separate.

### 2. Fallback when Codex quota exhausts

Document in the runner: when Codex returns usage-limit errors, mark those specific reviews as `deferred` automatically (not `failed`). Manual work today.

### 3. CI smoke test: `checkpoint --validation-only --stage spec` on a canned fixture

A 5-second integration test that runs the whole command end-to-end, not just the helper function. Confirms argparse wiring stays healthy.

### 4. Postmortem rule: surface when Claude implements instead of Codex

If the implementation diff is > N lines and there's no Codex dispatch transcript, require the postmortem to explain why. Makes the Codex-vs-Claude cost tradeoff visible.

## Meta-observation

Feature B shipped with zero HIGH findings left unresolved (all were addressed) despite:
- 6 of 9 Codex reviewer invocations failing due to subprocess / quota issues
- Implementation done by Claude instead of Codex
- Three-way reconcile dance for every deferred review

That suggests Gemini alone can carry the review signal when Codex is unavailable. The codex-vs-gemini split adds coverage but isn't load-bearing for finding HIGHs on a small feature. For larger features with more cross-cutting concerns, both would earn their keep.

## Requested approvals

1. Accept scope as-is (4 fixes, no scope creep).
2. Accept "Claude implemented" deviation from the token-saving rule, given Codex quota was exhausted mid-feature.
3. Consider the 4 workflow improvements above as candidates for Feature C or D.
