# Plan — FF Codex Reintegration

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Round 2 HIGH #1 (path/invocation contradictions) + HIGH #2 (return-contract mismatch) FIXED in spec round-3. Round 3 MEDIUM #1 (ts/dir id round-trip) + MEDIUM #2 (compat shim defeats enum) + MEDIUM #3 (no hard prompt size limit) FIXED via FR-003 / FR-009a / FR-004c.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: Round 1 HIGH #1 (timestamp collision) + HIGH #2 (failed dispatches suppress) FIXED in spec round-2. Round 2 MEDIUM #1 (branch-base drift) + MEDIUM #2 (shell vs argv) + MEDIUM #3 (path inconsistency) + MEDIUM #4 (null vs int contract) FIXED in spec round-3. Round 3 auto-accepted.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: No actionable findings (auto-accepted all 3 rounds).
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: MEDIUM #1 (hidden caller truthy on tuple): grep audit pre-step in Slice 2 is the fix; type/runtime check would over-engineer. MEDIUM #2 (skipped disables in shallow clones): accepted as residual R2 per spec FR-021 design (honest skip > silent under-report). MEDIUM #3 (prompt in process listings): documented as residual R6 — prompts in this repo are workflow specs (no secrets); stdin mode is out of scope. MEDIUM #4 (process-group cleanup on timeout): FIXED — Slice 5 now uses Popen + start_new_session=True, on TimeoutExpired calls os.killpg with SIGTERM then SIGKILL. MEDIUM #5 (subprocess exceptions): FIXED — Slice 3 freshness helpers wrap subprocess.run in try/except for CalledProcessError/TimeoutExpired/FileNotFoundError/OSError, return not-fresh on any.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: HIGH H-01 (argv command injection): REJECTED — reviewer conflates shell substitution with argv. argv-style subprocess passes the prompt as an argv element, NOT through a shell, so there is no injection risk; the 100KB FR-004c hard limit handles ARG_MAX. Stdin would require Codex CLI to support stdin which it does not. Already documented in plan R6 + spec FR-004b. MEDIUM M-01 [UNVERIFIED] (audit incomplete): FIXED — T00 audit moved to Slice 1, repo-wide grep + dynamic-call risk acknowledged as residual (very unlikely in this codebase, no metaprogramming patterns). MEDIUM M-02 (perf with large dispatches): residual — single feature run rarely has more than 5-10 dispatches; if it grows, optimization is a future feature. MEDIUM M-03 [UNVERIFIED] (daemonized subprocess survival): residual — codex CLI does not spawn daemons in observed usage; if it does in future, killpg is the best-effort cleanup. LOW L-01 (FileNotFoundError on git): FIXED — T02 now explicitly catches FileNotFoundError. LOW L-02 (null-base records pollute state): accepted-by-design — knowingly-not-useful-for-suppression is preferable to crashing the dispatch. LOW L-03 (30s timeout in monorepos): FIXED — T02/T13/T14 bumped to 60s.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.codex.dependency-order-adversarial.review.md | status: accepted | note: HIGH (T10 stale-suppression test contradicts Slice 3): FIXED — T16 now explicitly retires/rewrites T10's intermediate-state assertion when Slice 3 lands; transition documented. MEDIUM [UNVERIFIED] (audit timing): FIXED — moved to T00 in Slice 1 so inventory is locked before any signature change in Slice 2.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: HIGH (plan.md says accepted but review files still open): EXPLAINED — this is the round-2 review of the same artifact stack; auto-reconcile sets the new reviews to needs-review, then this manual reconcile transitions them to accepted. The plan.md note from round-1 referred to round-1 reviews; this commit closes round-2. State and reviews now in sync. UNVERIFIED MEDIUM (external refs not in patch): EXPLAINED — diff review only sees the implementation patch, not the prose artifacts (spec/plan/tasks). FR-019 / R6 / commit b3f8684b are verifiable via spec.md grep + git log; reviewer cannot see them by design but they exist. No fix needed.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/diff.codex.regression-adversarial.review.md | status: accepted | note: UNVERIFIED MEDIUM #1 (cited proof not in patch): same as correctness review — diff review scope is intentionally just the patch. UNVERIFIED MEDIUM #2 (header vs body inconsistency): EXPLAINED — round-2 reviews start with status=open (default frontmatter) and contain new findings text. This reconcile transitions them to accepted. After this commit lands, state and reviews are in sync.

## Architecture

| Fix | Files | Entry point |
|---|---|---|
| 1 — `dispatch-codex` subcommand | NEW `factory_cmd_dispatch.py`; edit `run_factory.py` (route + decorator); reuse `is_codex_quota_exhaustion` from `run_codex_review.py` | `command_dispatch_codex(args)` |
| 2 — Freshness-bound suppression | `factory_deliver.py` (rewrite `check_implementation_rule`); helper `factory_state.py:is_ancestor_of_head(sha)` | `check_implementation_rule(slug) -> tuple[Literal["triggered","suppressed","skipped","ok"], str]` |
| 3 — `advance` subcommand | NEW `factory_cmd_advance.py`; edit `run_factory.py` (route + decorator); reuse `factory_state.update_state` | `command_advance(args)` |
| 4 — Banner rename | edit `factory_next_action.py`; update affected tests | string change `repair_X_checkpoint` → `run_X_checkpoint` |
| 5 — Branch-base fallback | edit `factory_deliver.py:_resolve_branch_base()` | new fallback chain → `Optional[str]` |

## Implementation slices

### Slice 1 — Banner rename + branch-base fallback `[CHECKPOINT]`

Smallest, lowest-risk, no schema changes. Lands first to keep diff per slice small. ~80 lines including tests.

- **Fix 4 (banner)**: in `factory_next_action.py`, find the function that emits `repair_<stage>_checkpoint` for the "next stage needs its checkpoint run" case and change the literal to `run_<stage>_checkpoint`. Leave `repair_unhealthy_manifest` and similar truly-repair cases unchanged. The `repair` CLI subcommand and its handler name are NOT renamed (FR-017).
- **Fix 5 (branch-base)**: in `factory_deliver.py`, rewrite `_resolve_branch_base()` to try in order: `git merge-base origin/main HEAD` → `git merge-base --fork-point origin/main HEAD` → `git merge-base main HEAD` → return `None`. Drop the `HEAD~50` fallback. (Judges round-2 tasks blocker: this prose now matches FR-019 and tasks T02 — fork-point ahead of local `main`, because local `main` may have diverged from `origin/main`.)
- **Slice ordering fix (round-2 plan Codex impl HIGH #1)**: this slice does NOT introduce the `Literal[...]` status enum yet — that's Slice 2. Within Slice 1, `check_implementation_rule` keeps its current `(bool, str)` return contract. The branch-base failure path returns `(False, "implementation-rule check skipped — could not resolve branch base (origin/main, main, fork-point all failed)")` with the message printed to stderr. Slice 2 promotes this `(False, "skipped:...")` workaround to explicit `("skipped", message)` per FR-021. This makes Slice 1 mergeable independently.
- Tests: `test_factory_next_action.py` (or equivalent) — updated string assertion. `test_implementation_rule.py` — extend with branch-base mock cases (origin/main fail / main fail / fork-point success; all-three fail → returns `(False, message starting with "implementation-rule check skipped")`).

### Slice 2 — `check_implementation_rule` return-shape migration `[CHECKPOINT]`

Foundational refactor for Slice 3's freshness work. Touches the return contract from `(bool, str)` → `(Literal[...], str)`. ~120 lines.

- **Pre-step (callsite audit, addresses round-1 plan Codex impl/arch MEDIUM #2)**: before changing the signature, run `grep -rn "check_implementation_rule" docs/workflow/operations/codex-skills/feature-factory/scripts/` and inventory ALL callers. PR #751 created the function with one caller in `factory_cmd_deliver.py`; verify that's still the only caller before proceeding. Document any additional callers in the slice's commit message.
- Change `check_implementation_rule(slug)` signature: returns `tuple[Literal["triggered","suppressed","skipped","ok"], str]` (FR-009a).
- Update `factory_cmd_deliver.py` caller to switch on `status` explicitly per FR-009a: `"triggered"` → block (or honor `--override-implementation-rule`); `"suppressed"` → print suppression note + proceed; `"skipped"` → print skip stderr message + proceed; `"ok"` → proceed silently. **No boolean compatibility shim** (per FR-009a).
- For this slice, suppression rule is unchanged from PR #751 (still `bool(state.codex_dispatches)` for now); freshness binding lands in Slice 3. The status enum just makes the call sites cleaner first.
- Tests: extend `test_implementation_rule.py` with one assertion per status. Existing assertions migrated from boolean checks to status-string checks.

### Slice 3 — Freshness-bound suppression `[CHECKPOINT]`

Builds on Slice 2's status enum. Implements the real freshness check. ~150 lines.

- Add helper `factory_state.is_ancestor_of_head(sha: str) -> bool` (subprocess wrapper around `git merge-base --is-ancestor`, with `timeout=30` per round-1 plan Codex impl MEDIUM #4).
- **Legacy/missing-field handling (round-1 plan Codex impl MEDIUM #1)**: read all dispatch fields defensively via `entry.get("field_name")` returning `None` for missing keys. Records written by PR #751 (or any prior version) lacking `branch_base_sha`, `lines_added_at_dispatch_time`, `exit_code`, etc. are treated identically to records explicitly carrying `null` — they fail the freshness check and do not suppress. This is backward-compatible: legacy records simply stop suppressing rather than crashing the consumer. Note: `state.codex_dispatches[]` is empty in current production state.json (nothing populated it before this PR), so legacy records exist only in theory.
- **Freshness ordering (round-1 plan Codex arch MEDIUM #3)**: when iterating, evaluate ALL entries for freshness, then among the fresh ones pick the one with the lexicographically maximum `ts` (which equals chronological maximum since `ts` is `YYYYMMDDTHHMMSS_ffffffZ[_NNN]`). This is deterministic regardless of list order. The selected entry's `<ts>` + `<head_sha[:7]>` + `<lines>` go into the suppression note.
- Rewrite suppression logic in `check_implementation_rule`:
  - For each entry in `state.codex_dispatches[]`, check freshness per FR-008: `entry.get("exit_code") == 0` AND `is_ancestor_of_head(entry.get("head_sha"))` AND `entry.get("lines_added_at_dispatch_time")` is not null AND `abs(<current snapshot> - <entry snapshot>) <= 50` (round-2 plan Codex impl MEDIUM #2: explicitly absolute-value comparison so a large negative delta cannot pass).
  - **Defensive guards (round-2 plan Codex impl MEDIUM #3)**: `is_ancestor_of_head(None)` MUST return `False`; recompute helpers called with a `None` `head_sha` MUST return `None`; `entry.get("exit_code")` returning `None` MUST NOT compare equal to `0`. All `None` cases short-circuit to "not fresh"; no helper raises on missing fields.
  - **Subprocess-exception guards (round-3 plan Codex impl MEDIUM #5)**: each git helper (`is_ancestor_of_head`, the recompute path) MUST wrap its `subprocess.run` in try/except for `subprocess.CalledProcessError`, `subprocess.TimeoutExpired`, `FileNotFoundError`, and `OSError`. On any exception, the helper returns the "not fresh"/"recompute failed" sentinel — never propagates the exception. This means a malformed SHA, pruned object, or corrupt repo turns a single bad record into "not fresh", not a runtime crash of the rule check.
  - When `branch_base_sha` differs from current `_resolve_branch_base()`, recompute via `git diff --numstat <current_branch_base>..<entry.head_sha>` (FR-008b, with `timeout=30`) and use the recomputed value.
  - When entry has `lines_added_at_dispatch_time: null`, attempt recompute (FR-008a) — if succeeds, use it; if fails, entry stays not-fresh.
  - **Below-threshold short-circuit (round-2 plan Codex impl MEDIUM #1)**: if `_added_code_lines(branch_base) < 200`, return `("ok", "")` immediately. The freshness check only runs when we're above threshold and would otherwise trigger; below threshold there is nothing to suppress, regardless of dispatch history.
  - If at least one fresh entry above threshold → return `("suppressed", note)` using the highest-`ts` fresh entry per the ordering rule above (FR-009).
  - If above threshold and no fresh entry → return `("triggered", message)` (FR-010).
  - If below threshold → return `("ok", "")` (covered by short-circuit above).
- Tests: extend `test_implementation_rule.py` with the 4 acceptance scenarios from US2: ancestor + line-match → suppressed; non-ancestor → triggered; line-drift > 50 → triggered; empty dispatches → triggered (above threshold) or ok (below). Plus new cases: failed dispatch (`exit_code != 0`) → not fresh; null `lines_added_at_dispatch_time` with successful recompute → suppressed; null + recompute fails → not fresh; mismatched `branch_base_sha` → re-baseline; legacy record missing keys → treated as null → not fresh; **legacy fixture** (round-2 plan Gemini TEST-L-02: hand-craft a state.json with codex_dispatches[] entry containing only old PR #751-shape keys, assert `check_implementation_rule` returns `("triggered", message)` not a crash); multiple fresh entries → highest-`ts` wins (deterministic, regardless of list order); **drift exactly 50** passes (round-2 plan Gemini TEST-L-01 boundary); **stale dispatch + below threshold** → returns `("ok", "")` (round-2 plan Codex impl MEDIUM #1 short-circuit).

### Slice 4 — `advance` subcommand `[CHECKPOINT]`

Independent from Slices 2/3. Can land in any order after Slice 1. ~120 lines.

- New module `factory_cmd_advance.py` with `command_advance(args)`.
- Argparse on `run_factory.py`: `advance --slug <slug> --stage <spec|plan|tasks|implementation> --reason <text>`.
- Eager-validate `len(reason.strip()) >= 20` BEFORE any state mutation (FR-013). On fail: print clear message to stderr, exit 2, no state writes.
- Validate `--stage` is one of the allowed values (argparse `choices=` covers this; assert no implicit handling).
- Atomic state mutation via `factory_state.update_state`: set `state.stages[<stage>].judge_next_action = "advance"` AND append `{stage, ts, reason, head_sha}` to `state.annotations[]` in a single update (FR-014).
- Decorate handler with `@mutates_state` (FR-015).
- Tests: new `tests/test_advance_subcommand.py` — happy path; reason <20 chars exits 2 with no state write; reason *exactly* 20 chars passes (round-2 plan Gemini TEST-L-01 boundary); unknown stage exits 2 with no state write; verify state.annotations[-1] shape; verify `factory_state.update_state` writes via temp + `os.replace` (atomic) — verified by inspection of factory_state.py (uses temp file + atomic rename per PR #751 pattern). (Round-2 plan Gemini TEST-M-02 [UNVERIFIED] resolved by inspection: not retesting the helper itself, just relying on its documented atomicity.)

### Slice 5 — `dispatch-codex` subcommand `[CHECKPOINT]`

Largest slice. Lands last so it can dogfood the rest of this PR. ~250 lines.

- New module `factory_cmd_dispatch.py` with `command_dispatch_codex(args)`.
- Argparse on `run_factory.py`: `dispatch-codex --slug <slug> --prompt-path <file> [--model <name>]` (default model `gpt-5.4-mini`).
- Eager-validate prompt size: `len(prompt_text.encode('utf-8')) <= 100_000` (FR-004c). On fail: exit 2 with the templated message, no Codex invocation.
- Generate `<dispatch-id>` = `YYYYMMDDTHHMMSS_ffffffZ` from UTC now (`datetime.utcnow().strftime("%Y%m%dT%H%M%S_%fZ")`). **Atomic claim (round-1 plan Codex arch MEDIUM #1 / impl MEDIUM #3)**: use `Path(<dir>).mkdir(parents=True, exist_ok=False)` to atomically reserve the directory before any subprocess invocation. On `FileExistsError`, increment `_NNN` counter (000, 001, ...) and retry. The first successful `mkdir` wins the directory; subsequent racers move to the next counter. This makes path selection truly race-free even though the spec declares concurrent dispatch out of scope — defensive depth costs ~5 lines.
- Compute prompt sha256 from `prompt_text.encode('utf-8')` (FR-004).
- Resolve `branch_base_sha` via `_resolve_branch_base()` (Slice 1 path); if `None`, set `lines_added_at_dispatch_time` and `branch_base_sha` both to `null` (FR-004a). Otherwise compute `lines_added_at_dispatch_time` via `_added_code_lines(branch_base)` from `factory_deliver.py`.
- Invoke Codex via `subprocess.Popen([codex_path, "exec", "-m", model, "-s", "workspace-write", prompt_text], cwd=REPO_ROOT, stdout=PIPE, stderr=PIPE, text=True, start_new_session=True)` then `proc.communicate(timeout=600)` (FR-002, FR-004b). The `start_new_session=True` puts Codex in its own process group so we can clean up grandchildren on timeout. 600s ceiling per round-1 plan Codex impl MEDIUM #4. **On `TimeoutExpired` (round-3 plan Codex impl MEDIUM #4)**: call `os.killpg(os.getpgid(proc.pid), signal.SIGTERM)`, wait briefly, then `SIGKILL` if still alive; print "codex exec exceeded 600s timeout — process group killed" to stderr; **exit 5** (round-2 plan Codex arch MEDIUM #1: distinct from quota-exit-4); do NOT record dispatch. No `shell=True`. `codex_path` = `shutil.which("codex")` or fail with a clear message + exit 2 if not found (round-2 plan Gemini TEST-M-01).
- **Write order (round-2 plan Gemini TEST-H-01)**: write `stdout.txt` + `stderr.txt` under `docs/workflow/feature-runs/<slug>/codex-dispatches/<dispatch-id>/` (FR-003) FIRST, THEN append to `state.codex_dispatches[]`. Crash between steps leaves an orphaned artifact dir + no state record. The orphan is harmless (no consumer reads dispatch dirs without a state pointer); the operator simply re-dispatches. The reverse order (state first, artifacts second) would leave a state record pointing at a non-existent dir, which IS bad for audit. Document this in the module docstring.
- **head_sha capture point (round-2 plan Codex arch MEDIUM #2)**: `entry.head_sha` is captured via `git rev-parse HEAD` BEFORE invoking Codex (i.e., the SHA reflects the operator's repo state when the dispatch was initiated). This makes the ancestor check meaningful: a dispatch was "for" the head it saw at start, not whatever Codex ended up creating. Codex may make commits during dispatch — those are observable via the git history but are not in the dispatch's recorded `head_sha`.
- Classify quota via `is_codex_quota_exhaustion(result.stderr, result.stdout)` (FR-005). On quota: print message pointing at usage URL, exit 4, do NOT append to state.
- On non-quota (exit 0 or non-zero, non-quota), append the dispatch record to `state.codex_dispatches[]` (FR-004) AND propagate Codex's exit code as the runner's exit code (FR-007; quota → 4, timeout → 5, codex-not-found → 2).
- Decorate `command_dispatch_codex` with `@mutates_state` (FR-006).
- Tests: new `tests/test_dispatch_codex.py` — happy path (subprocess.run mocked success); quota exhaustion (exit 4, no state write); non-quota failure (entry recorded with exit_code=N, runner propagates N); prompt size > 100KB (exit 2, no Codex invocation); prompt size *exactly* 100,000 bytes (passes — round-2 plan Gemini TEST-L-01 boundary); `_NNN` collision suffix when same-microsecond directory exists (test by pre-creating the unsuffixed dir, also tests sort order with `_NNN` suffixes — round-2 plan Gemini TEST-L-03); null branch-base path (entry has both branch_base_sha and lines_added_at_dispatch_time as null); prompt sha256 stable across reads; **timeout** (mock subprocess.run to raise `TimeoutExpired` → exit 5, no state write); **codex not on PATH** (mock `shutil.which("codex")` to return `None` → exit 2, no Codex invocation, no state write — round-2 plan Gemini TEST-M-01).

## Test approach

- All 5 slices keep the existing 240+ FF test count green; new behavior gets new tests.
- Mock pattern follows PR #751: subprocess calls mocked at the boundary, no live Codex/git invocations in unit tests.
- For Slice 5, the `subprocess.run` mock returns canned `(returncode, stdout, stderr)` and the test asserts on file paths written + state mutations. No actual Codex CLI required.
- For Slice 3, mock `git merge-base --is-ancestor` and `git diff --numstat` separately so we can exercise the recompute path independently.
- Smoke test (post-merge, manual): run `python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py dispatch-codex --slug ff-codex-reintegration-smoke --prompt-path /tmp/hello.txt` against a real prompt and verify state + dispatch directory exist.

## Implementation strategy (operator note)

Codex quota is restored. All 5 slices land via `codex exec -m gpt-5.4-mini -s workspace-write "$(cat /tmp/codex-spec.txt)"` from the shell (PR #751's `--override-implementation-rule` plus the new freshness check is what the dispatcher consumer-side targets). Future features dogfood `dispatch-codex` once it's merged.

Each slice ends with `[CHECKPOINT]`: run preflight (`cd cloud && npm run lint --workspace @valuerank/api && python3 -m unittest discover docs/workflow/operations/codex-skills/feature-factory/scripts/tests`) before moving to the next. Commit per slice.

## Risks (carried from spec)

- R1 (medium): Codex CLI flag drift — mitigated by mocking `subprocess.run`, not the CLI.
- R2 (medium): `git merge-base --fork-point` fragile in shallow clones — documented skip-on-fail. Per spec FR-021, "honest skip beats silent under-report" is the explicit design choice. (Round-3 plan Codex impl MEDIUM #2 raised this; accepted as residual.)
- R3 (low): `lines_added_at_dispatch_time` is a snapshot; post-dispatch Claude edits can re-trigger WARN — intentional.
- R4 (low): `prompt_sha256` hashes pre-Codex content; matches what's passed via argv.
- R5 (low): `advance` is a manual override — reason ≥20 chars + recorded annotation is the audit guardrail.
- R6 (low, **round-3 plan Codex impl MEDIUM #3**): the prompt is passed as an argv element to `codex exec`. On Linux/macOS, this means the prompt text appears in `ps`/`/proc/<pid>/cmdline` for the duration of the Codex run. **Trade-off accepted**: prompts in this repo are workflow specs (no API keys, no PII, no secrets); audit logs that capture argv (e.g., `auditd`) will record them, but that matches the existing pattern for `codex exec` invoked from the shell. Switching to stdin (which would hide the prompt from `ps`) would prevent Codex from accepting the prompt — Codex's CLI takes the prompt as an argv argument, and changing that contract is out of scope for this feature. If a future feature carries sensitive content (API keys, etc.) through dispatch-codex, that feature MUST add an opt-in stdin mode.
