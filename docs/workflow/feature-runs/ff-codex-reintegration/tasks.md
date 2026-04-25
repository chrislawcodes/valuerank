# Tasks — FF Codex Reintegration

Each `[CHECKPOINT]` ends a slice. Run preflight (`python3 -m unittest discover docs/workflow/operations/codex-skills/feature-factory/scripts/tests` from repo root) and commit before continuing.

**Module imports (judges round-2 tasks blockers, common to Slices 4+5)**: every new module must use these specific imports:
- `from factory_state import REPO_ROOT, update_state`  — `REPO_ROOT` is defined at `factory_state.py:22`; `update_state` is the atomic temp+rename helper.
- `from factory_mutating import mutates_state`  — decorator. Defined in `factory_mutating.py`.
- `from run_gemini_review import is_codex_quota_exhaustion` (Slice 5 only) — quota classifier. Note: importing `run_gemini_review` is side-effect-free because its top-level code is gated behind `if __name__ == "__main__":`.

---

## Slice 1 — Banner rename + branch-base fallback `[CHECKPOINT]`

- [ ] T00: **Pre-step audit moved earlier (tasks-round-2 dependency MEDIUM #2 / coverage M-01)**. Run `grep -rn "check_implementation_rule" .` from repo root. Inventory every caller. Expected: only `factory_cmd_deliver.py` and tests under `docs/workflow/operations/codex-skills/feature-factory/scripts/tests/`. If any caller exists elsewhere (`cloud/`, etc.), document in commit message AND fix in this slice (Slice 1 only changes the branch-base path; signature still `(bool, str)`, so any extra caller needs no change yet — but Slice 2 is the one that breaks it, so we want the inventory locked-in early). T07 in Slice 2 confirms the inventory is unchanged before signature migration.
- [ ] T01: In `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_next_action.py`, locate the function emitting `repair_<stage>_checkpoint` for the "advance to next stage's checkpoint" branch and change the literal to `run_<stage>_checkpoint`. Leave `repair_unhealthy_manifest` and other true-repair cases untouched. (FR-016, FR-017)
- [ ] T02: In `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_deliver.py`, rewrite `_resolve_branch_base()` to try `git merge-base origin/main HEAD` → `git merge-base --fork-point origin/main HEAD` → `git merge-base main HEAD` → return `None`. (Tasks-round-1 Gemini L-01 reorder: fork-point ahead of local `main` because local `main` may have diverged from `origin/main`; canonical remote first, then fork-point as the next-most-canonical, then local `main` as last resort.) Drop the `HEAD~50` fallback. Use `subprocess.run(..., timeout=60)` for each git call (tasks-round-2 Gemini L-03: bump from 30s for monorepo headroom); treat `CalledProcessError`, `TimeoutExpired`, `FileNotFoundError` (tasks-round-2 Gemini L-01: explicit, in case `git` is not on PATH), and `OSError` as "this candidate failed, try next." (FR-019, FR-020)
- [ ] T03: In `factory_deliver.py:check_implementation_rule`, when `_resolve_branch_base()` returns `None`, print `implementation-rule check skipped — could not resolve branch base (origin/main, main, fork-point all failed)` to stderr and return `(False, <same message>)`. (FR-021 / Slice-1 ordering note: keep `(bool, str)` shape this slice; Slice 2 promotes to status enum.)
- [ ] T04: In `docs/workflow/operations/codex-skills/feature-factory/scripts/tests/test_factory_next_action.py` (or wherever the next-action banner is asserted), update assertions to expect `run_<stage>_checkpoint`. If no such test exists, create one with one assertion per stage transition.
- [ ] T05: In `docs/workflow/operations/codex-skills/feature-factory/scripts/tests/test_implementation_rule.py`, add cases: `_resolve_branch_base` returns `origin/main` SHA when first try succeeds; falls through to `main` then to `--fork-point`; returns `None` when all three fail; `check_implementation_rule` returns `(False, "implementation-rule check skipped — ...")` when branch-base is `None` and prints the message to stderr.
- [ ] T06: Run preflight: `cd /Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7 && python3 -m unittest discover docs/workflow/operations/codex-skills/feature-factory/scripts/tests`. All existing tests + new T04/T05 cases pass. Commit `slice 1: banner rename + branch-base fork-point fallback`.

---

## Slice 2 — `check_implementation_rule` return-shape migration `[CHECKPOINT]`

- [ ] T07: Pre-step audit. Run `grep -rn "check_implementation_rule" .` from repo root (NOT just `docs/workflow/...` per tasks-round-1 Codex dependency MEDIUM #4 — broader scope catches any caller in `cloud/`, scripts/, tests anywhere). Inventory every caller. Expected: only `factory_cmd_deliver.py` and its tests. If any other caller is found, document it in the commit message AND update it in the same slice.
- [ ] T08: In `factory_deliver.py:check_implementation_rule(slug)`, change the return type annotation to `tuple[Literal["triggered","suppressed","skipped","ok"], str]`. Map the existing return points:
  - "above threshold and no codex_dispatches" → `("triggered", message)`
  - "above threshold and codex_dispatches non-empty" → `("suppressed", note)` where note is the literal string `"implementation-rule check skipped — codex_dispatches[] is non-empty (freshness check lands in Slice 3)"` (judges round-1 tasks blocker 2c: Slice 2 has no freshness data so cannot use FR-009's note format; this static intermediate note is replaced by the FR-009 note in Slice 3 / T15).
  - "branch-base unresolved" → `("skipped", message)` (replaces the Slice-1 `(False, "skipped:...")` workaround)
  - "below threshold" → `("ok", "")`
- [ ] T09: In `factory_cmd_deliver.py`, update the caller of `check_implementation_rule`. Switch on `status` explicitly:
  - `"triggered"` → existing block-or-override logic.
  - `"suppressed"` → print the note and proceed.
  - `"skipped"` → print the skip stderr message and proceed.
  - `"ok"` → proceed silently.
  No boolean compatibility shim — explicit `if/elif/else` on the literal strings.
- [ ] T10: In `tests/test_implementation_rule.py`, migrate existing assertions from boolean checks to status-string checks. Add one assertion per literal status value. Replace any `assertTrue(triggered)` / `assertFalse(triggered)` patterns with `assertEqual(status, "triggered")` / etc. **Add intermediate-state regression test (tasks-round-1 Gemini M-03)**: with `state.codex_dispatches[]` containing one stale-shape entry (e.g., a head_sha not in the current branch), assert `check_implementation_rule` returns `("suppressed", ...)` in this slice. This documents the deliberate intermediate behavior (Slice 2 still suppresses on non-empty `codex_dispatches`); the assertion flips to `("triggered", ...)` in T16's freshness tests after Slice 3.
- [ ] T11: In `tests/test_factory_cmd_deliver.py`, update mocks of `factory_deliver.check_implementation_rule` to return tuples with the new status strings. Existing happy-path cases should now mock `("ok", "")`.
- [ ] T12: Run preflight. All tests pass. Commit `slice 2: check_implementation_rule status enum`.

---

## Slice 3 — Freshness-bound suppression `[CHECKPOINT]`

- [ ] T13: In `factory_state.py`, add helper `is_ancestor_of_head(sha: str | None) -> bool`. Returns `False` immediately if `sha` is `None` or empty. Otherwise calls `subprocess.run(["git", "merge-base", "--is-ancestor", sha, "HEAD"], cwd=REPO_ROOT, capture_output=True, timeout=60)` (tasks-round-2 Gemini L-03 bump) wrapped in try/except for `CalledProcessError`, `TimeoutExpired`, `FileNotFoundError`, `OSError` — any exception returns `False`. Returns `True` only on exit 0.
- [ ] T14: In `factory_deliver.py`, add private helper `_recompute_lines_for_dispatch(entry: dict, current_branch_base: str | None) -> int | None`. If `entry.get("head_sha")` is `None` or `current_branch_base` is `None`, return `None`. Otherwise run `git diff --numstat <current_branch_base>..<head_sha> -- <globs>` where `<globs>` is **the existing module-level constant `_IMPLEMENTATION_RULE_CODE_GLOBS` from `factory_deliver.py`** (defined in PR #751; same constant `_added_code_lines` already uses) — wrap in try/except around `CalledProcessError`/`TimeoutExpired`/`FileNotFoundError`/`OSError`; parse and sum the "added" column **only** (not added+deleted; the implementation-rule measures NEW code, not churn — tasks-round-1 Gemini M-01 acknowledged: counting both would conflate a pure refactor with a real implementation, defeating the rule's intent). Return `None` on any exception.
- [ ] T15: Rewrite the suppression logic in `check_implementation_rule`:
  1. Compute `branch_base = _resolve_branch_base()`. If `None`, return `("skipped", message)` per existing path.
  2. Compute `current_lines = _added_code_lines(branch_base)`.
  3. If `current_lines < 200`, return `("ok", "")` immediately (below-threshold short-circuit, FR-008+plan round-2 MEDIUM #1).
  4. Iterate `state.get("codex_dispatches", [])`. For each entry, evaluate freshness with defensive `.get()` reads:
     - `entry.get("exit_code") == 0` (failed dispatches not fresh)
     - `is_ancestor_of_head(entry.get("head_sha"))` returns `True`
     - Get `entry_lines`: if `entry.get("branch_base_sha") == branch_base` AND `entry.get("lines_added_at_dispatch_time")` is not None, use stored value. Else call `_recompute_lines_for_dispatch(entry, branch_base)`. If result is `None`, entry is not fresh.
     - `abs(current_lines - entry_lines) <= 50`
  5. Among fresh entries, pick the one with maximum `ts` (lexicographic = chronologic for the timestamp format). Return `("suppressed", note)` where note = `f"implementation-rule check skipped — covered by codex dispatch {ts} (sha {head_sha[:7]}, +{entry_lines})"`.
  6. If no fresh entry, return `("triggered", message)`.
- [ ] T16: In `tests/test_implementation_rule.py`, add cases (mocking `is_ancestor_of_head`, `_recompute_lines_for_dispatch`, and `_added_code_lines`):
  - Above threshold + ancestor + line-match → `("suppressed", note)` with the matching `<ts>`/`<sha>`/`<lines>`.
  - Above threshold + non-ancestor (`is_ancestor_of_head` returns False) → `("triggered", ...)`.
  - Above threshold + line-drift > 50 → `("triggered", ...)`.
  - Above threshold + drift exactly 50 → `("suppressed", ...)` (boundary, plan round-2 Gemini TEST-L-01).
  - Above threshold + failed dispatch (`exit_code != 0`) → `("triggered", ...)`.
  - Above threshold + null `lines_added_at_dispatch_time` + recompute succeeds → `("suppressed", ...)`.
  - Above threshold + null `lines_added_at_dispatch_time` + recompute fails → `("triggered", ...)`.
  - Above threshold + mismatched `branch_base_sha` triggers re-baseline (recompute called).
  - Above threshold + multiple fresh entries → highest-`ts` wins regardless of input order.
  - Above threshold + legacy entry missing keys (no `branch_base_sha`, no `exit_code`, etc.) → `("triggered", ...)`, no exception.
  - Below threshold + stale entry → `("ok", "")` (short-circuit).
  - **Slice-2-to-Slice-3 transition (tasks-round-2 dependency HIGH)**: explicitly delete or rewrite the T10 intermediate-state regression test that asserted "stale entry → suppressed in Slice 2". After Slice 3, the same fixture must assert `("triggered", ...)`. Document the transition in the Slice 3 commit message. (T10 was a deliberate intermediate marker; T16 retires it.)
- [ ] T17: Run preflight. All tests pass. Commit `slice 3: freshness-bound implementation-rule suppression`.

---

## Slice 4 — `advance` subcommand `[CHECKPOINT]`

- [ ] T18: New file `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_advance.py`. Define `command_advance(args)`:
  - Eager-validate `len((args.reason or "").strip()) >= 20`. On fail: print `--reason must be at least 20 characters (got N)` to stderr; raise `SystemExit(2)`.
  - Compute `head_sha = subprocess.run(["git","rev-parse","HEAD"], ...).stdout.strip()`.
  - Compute `ts = datetime.utcnow().strftime("%Y%m%dT%H%M%S_%fZ")`.
  - Use `factory_state.update_state(slug, mutator)` where `mutator(state)` sets `state["stages"][args.stage]["judge_next_action"] = "advance"` and appends `{"stage": args.stage, "ts": ts, "reason": args.reason.strip(), "head_sha": head_sha}` to `state.setdefault("annotations", [])`.
  - Decorate with `@mutates_state` from the existing decorator module.
  - Print `[workflow] ✓ advance ({stage}) → next: <next-action computed by factory_next_action>`.
- [ ] T19: In `run_factory.py`, register the `advance` subcommand. Argparse: `--slug <slug>` (required), `--stage <choices: spec, plan, tasks, implementation>` (required), `--reason <text>` (required). Wire to `command_advance`.
- [ ] T20: New test file `tests/test_advance_subcommand.py`:
  - Happy path: valid args → state has `stages.spec.judge_next_action == "advance"`, `annotations[-1]` matches the expected shape with `head_sha` from a mocked `git rev-parse`.
  - Reason 19 chars → `SystemExit(2)`, no state mutation (read state.json before and after, assert identical).
  - Reason exactly 20 chars → passes (boundary, plan round-2 Gemini TEST-L-01).
  - Unknown `--stage` → argparse rejects with `SystemExit(2)`, no state mutation.
  - Reason 20 chars but with leading/trailing whitespace bringing strip-len <20 → `SystemExit(2)`.
- [ ] T21: Run preflight. All tests pass. Commit `slice 4: advance subcommand`.

---

## Slice 5 — `dispatch-codex` subcommand `[CHECKPOINT]`

- [ ] T22: New file `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_dispatch.py`. Module docstring documents the artifacts-first-then-state write order and rationale.
- [ ] T23: In `factory_cmd_dispatch.py`, define `command_dispatch_codex(args)`:
  1. Resolve `codex_path = shutil.which("codex")`. If `None`: print `codex CLI not found on PATH; install or activate before dispatching` to stderr; raise `SystemExit(2)`.
  2. Read prompt: `prompt_text = Path(args.prompt_path).read_text(encoding="utf-8")`. Compute `prompt_bytes = prompt_text.encode("utf-8")`. If `len(prompt_bytes) > 100_000`: print `prompt at <path> is <N> bytes, exceeds 100000-byte hard limit; split into multiple dispatches or use a follow-up feature to add stdin-based prompts` to stderr; raise `SystemExit(2)`. (FR-004c)
  3. Compute `prompt_sha256 = hashlib.sha256(prompt_bytes).hexdigest()`.
  4. Compute `head_sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, capture_output=True, text=True, check=True, timeout=10).stdout.strip()` (captures pre-dispatch HEAD per plan round-2 Codex arch MEDIUM #2).
  5. Resolve `branch_base = factory_deliver._resolve_branch_base()`. If non-None, compute `lines_added = factory_deliver._added_code_lines(branch_base)`; else `lines_added = None`.
  6. Generate dispatch-id atomically:
     - `base_id = datetime.utcnow().strftime("%Y%m%dT%H%M%S_%fZ")`
     - `dir_path = REPO_ROOT / "docs/workflow/feature-runs" / args.slug / "codex-dispatches" / base_id`
     - Try `dir_path.mkdir(parents=True, exist_ok=False)`. On `FileExistsError`, append `_NNN` (start `_000`, increment `_001`, `_002`, ...) and retry until success. Cap retries at 1000; if exhausted, raise `RuntimeError`.
     - Final `dispatch_id = dir_path.name`.
  7. Invoke Codex via `Popen([codex_path, "exec", "-m", args.model, "-s", "workspace-write", prompt_text], cwd=REPO_ROOT, stdout=PIPE, stderr=PIPE, text=True, start_new_session=True)`. Then:
     ```python
     try:
         stdout, stderr = proc.communicate(timeout=600)
     except subprocess.TimeoutExpired as e:
         # tasks-round-1 Codex execution MEDIUM #2 / dependency MEDIUM #2:
         # capture partial output from the exception BEFORE killing,
         # so the artifacts written in step 8 actually contain something
         stdout = (e.stdout or "") if isinstance(e.stdout, str) else (e.stdout or b"").decode("utf-8", errors="replace")
         stderr = (e.stderr or "") if isinstance(e.stderr, str) else (e.stderr or b"").decode("utf-8", errors="replace")
         try:
             os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
             proc.wait(timeout=10)
         except (ProcessLookupError, subprocess.TimeoutExpired):
             try:
                 os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
             except ProcessLookupError:
                 pass
         # write artifacts THEN exit (artifacts captured before the SIGTERM landed)
         (dir_path / "stdout.txt").write_text(stdout, encoding="utf-8")
         (dir_path / "stderr.txt").write_text(stderr, encoding="utf-8")
         print("codex exec exceeded 600s timeout — process group killed", file=sys.stderr)
         raise SystemExit(5)
     ```
  8. (Non-timeout path) Write artifacts FIRST: `(dir_path / "stdout.txt").write_text(stdout, encoding="utf-8")`; `(dir_path / "stderr.txt").write_text(stderr, encoding="utf-8")`. (Plan round-2 Gemini TEST-H-01 ordering rationale.)
  9. Classify quota: `from run_gemini_review import is_codex_quota_exhaustion` (judges round-1 tasks blocker 2d: verified — `is_codex_quota_exhaustion` is defined in `run_gemini_review.py:302` and re-exported via `run_codex_review.py`; both modules' top-level code is gated behind `if __name__ == "__main__":`, so importing has no side effects). If `is_codex_quota_exhaustion(stderr, stdout)`: print `Codex quota exhausted — see https://chatgpt.com/codex/settings/usage` to stderr; raise `SystemExit(4)` WITHOUT appending to state.
  10. Build dispatch record:
     ```
     {
       "head_sha": head_sha,
       "ts": dispatch_id,
       "prompt_path": str(args.prompt_path),
       "prompt_sha256": prompt_sha256,
       "model": args.model,
       "exit_code": proc.returncode,
       "stdout_path": str((dir_path / "stdout.txt").relative_to(REPO_ROOT)),
       "stderr_path": str((dir_path / "stderr.txt").relative_to(REPO_ROOT)),
       "branch_base_sha": branch_base,  # may be None
       "lines_added_at_dispatch_time": lines_added,  # may be None
     }
     ```
  11. Append via `factory_state.update_state(args.slug, lambda s: s.setdefault("codex_dispatches", []).append(record) or s)` or equivalent atomic mutator pattern from existing helpers.
  12. Print summary to stdout: `[workflow] ✓ dispatch-codex ({dispatch_id}) → exit {proc.returncode}`. **Exit code mapping (tasks-round-1 Gemini H-01)**: do NOT propagate raw Codex exit codes verbatim. Map them: Codex `0` → runner `0`; any non-zero Codex exit → runner `1` (collapsed; the actual codex exit_code is preserved in `state.codex_dispatches[-1].exit_code` for audit). The runner reserves: `2` (validation: bad prompt size, codex not on PATH); `4` (quota detected by wrapper); `5` (timeout detected by wrapper). This eliminates collisions where codex's own exit code coincidentally equaled `2`, `4`, or `5`.
- [ ] T24: In `run_factory.py`, register the `dispatch-codex` subcommand. Argparse: `--slug <slug>` (required), `--prompt-path <file>` (required), `--model <name>` (default `gpt-5.4-mini`). Decorate handler call site with `@mutates_state`.
- [ ] T25: New test file `tests/test_dispatch_codex.py`. Mock `subprocess.Popen`/`subprocess.run`, `shutil.which`, `factory_state.update_state`, `factory_deliver._resolve_branch_base`, `factory_deliver._added_code_lines`, AND **`datetime.utcnow()`** (tasks-round-1 Codex dependency MEDIUM #3 — mock the clock so `_NNN` collision tests are deterministic). Cases:
  - Happy path: codex exit 0 → runner exit 0, stdout/stderr files written, dispatch record appended with all fields.
  - **Codex non-zero collapse (tasks-round-1 Gemini H-01)**: codex exit 7 → runner exit 1 (collapsed), record appended with `exit_code: 7` for audit. Codex exit 1 → runner exit 1.
  - Quota exhaustion: stderr contains `usage limit` → runner exit 4, no state append, but stdout/stderr files DO exist.
  - Prompt > 100,000 bytes → runner exit 2, no Codex invocation, no state append, no files written.
  - Prompt exactly 100,000 bytes → success path runs (boundary, plan round-2 Gemini TEST-L-01).
  - Codex not on PATH (`shutil.which` returns `None`) → runner exit 2, no state append (plan round-2 Gemini TEST-M-01).
  - `_NNN` collision (with `datetime.utcnow` mocked to fixed value): pre-create `<base_id>` dir before dispatch; assert dispatch lands in `<base_id>_000` and the record's `ts` field equals `<base_id>_000`. Pre-create both `<base_id>` and `<base_id>_000` → lands in `<base_id>_001`.
  - Null branch-base: `_resolve_branch_base` returns `None` → record has `branch_base_sha: None` AND `lines_added_at_dispatch_time: None`.
  - **Timeout (tasks-round-1 Gemini L-02 + dependency MEDIUM #2)**: `proc.communicate` raises `TimeoutExpired(stdout=b"partial out", stderr=b"partial err")` → runner exit 5, no state append, **assert stdout.txt and stderr.txt files exist with the partial content** (`b"partial out"` decoded), and assert `os.killpg` was called with `SIGTERM`.
  - Prompt sha256 stable: same prompt content → same sha256.
- [ ] T26: Run preflight. All tests pass. Commit `slice 5: dispatch-codex subcommand`.

---

## Final closeout `[CHECKPOINT]`

- [ ] T27: Run full FF test suite once more from a clean state. Verify all 240+ baseline tests still pass plus the new ones from this PR.
- [ ] T28: Run diff checkpoint via FF runner: `python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py checkpoint --slug ff-codex-reintegration --stage diff`. Reconcile reviews. Auto-reconcile.
- [ ] T29: Deliver via FF runner: `python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py deliver --slug ff-codex-reintegration --create-pr --draft --base main`. The implementation-rule WARN MUST suppress correctly (Slice 5 dispatched the work, so `codex_dispatches[]` should have fresh entries). If quota was exhausted again and we fell back to Claude for any slice, use `--override-implementation-rule --override-implementation-reason "<why>"` and document in postmortem.md.
- [ ] T30: Update PR body with summary, fixes, adversarial-review findings addressed, residual risks (R1–R6).
- [ ] T31: Wait for CI; mark ready for review; squash merge into main; confirm merge SHA on main.
