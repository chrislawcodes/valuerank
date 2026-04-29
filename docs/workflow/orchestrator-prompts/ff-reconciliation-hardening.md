# Codex Orchestrator Prompt — FF Reconciliation Hardening

You are running the **Feature Factory workflow** as the orchestrator. You author spec.md, plan.md, tasks.md, run checkpoints, reconcile reviewer findings, dispatch the implementation (do it inline — you ARE Codex), and deliver the PR.

## Repo

- Working directory: the current `cwd` should already be the repo root or a worktree of `chrislawcodes/valuerank`.
- Branch you'll create: `claude/ff-reconciliation-hardening`.
- Slug: `ff-reconciliation-hardening`.

## Read these first

Required context (read in this order, take 2-3 minutes):
- `docs/workflow/operations/codex-skills/feature-factory/SKILL.md` — workflow overview.
- `docs/workflow/operations/codex-skills/feature-factory/CODEX-ORCHESTRATOR.md` — Codex-specific orchestrator guide.
- `docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py --help` — runner CLI surface.
- `AGENTS.md` and `cloud/CLAUDE.md` — project conventions.
- One prior shipped FF run for reference, e.g. `docs/workflow/feature-runs/ff-token-reliability/spec.md` and `plan.md` and `tasks.md` (PR #765, just shipped).

## What this PR fixes

Four issues from a real FF session that locked the operator out of plan-stage iteration. Source: PR #765's adversarial-review feedback batch.

### Fix 1 — Auto-reconciler false-positives on CRITICAL severity (HIGH priority)

**File**: `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_review_specs.py`

**Today**: the auto-reconcile path:
- (a) pre-populates `resolution_status: "accepted"` and `resolution_note: "No actionable findings detected — auto-accepted"` in the review's YAML frontmatter BEFORE parsing the body for severity tags, AND
- (b) the severity regex set covers HIGH/MEDIUM/LOW only — **CRITICAL is missing entirely**.

**Real session result**: 3 reviews with HIGH and CRITICAL findings in the body got auto-accepted with the boilerplate note. Operators who trust auto-accept skip real findings.

**Fix**:
1. Add CRITICAL to every severity regex in the set. Each pattern needs the alternation extended:
   - `^\s*-\s*\*\*(HIGH|MEDIUM|LOW|CRITICAL)\*\*[\s:\[]`
   - `^\s*-\s*(HIGH|MEDIUM|LOW|CRITICAL)\s*:`
   - `^\s*\d+\.\s*\*\*(HIGH|MEDIUM|LOW|CRITICAL)\*\*`
   - `^#+\s*(HIGH|MEDIUM|LOW|CRITICAL)(\s*:|\s*$)` (require `:` or EOL — NOT `\b` — so "Low-level" doesn't match)
   - `^\s*\*\*(HIGH|MEDIUM|LOW|CRITICAL)[\s:\[]`
   - `^\s*Severity:\s*(HIGH|MEDIUM|LOW|CRITICAL)`
   - `^\s*\|\s*\*\*(HIGH|MEDIUM|LOW|CRITICAL)\*\*\s*\|`
2. Reverse the auto-reconcile default: set `resolution_status: "open"` in the boilerplate. Only flip to `"accepted"` AFTER body parse confirms zero matches of any severity. Update boilerplate note to reflect what was checked: `"No HIGH/MEDIUM/LOW/CRITICAL findings detected — auto-accepted"`.
3. Add tests covering: a review with `**CRITICAL**:` bullet → not auto-accepted; a review with `## CRITICAL: foo` heading → not auto-accepted; pure-prose review with no severity tags → auto-accepted with the new boilerplate note.

### Fix 2 — Canonical comparison for reconciliation notes (HIGH priority)

**File**: `docs/workflow/operations/codex-skills/review-lens/scripts/verify_reconciliation.py`

**Today**: validation compares plan.md note text against YAML frontmatter `resolution_note` text byte-for-byte. YAML escaping (`\"flapping\"` vs `"flapping"` after parse) and inner double quotes trip the comparator even when content is semantically identical. Operator gets a "note mismatch" loop.

**Fix**:
1. Parse the YAML frontmatter using `yaml.safe_load`. Get the parsed `resolution_note` string (this gives semantic content, with escapes resolved).
2. Compare to the plan.md note text canonically:
   - both strings stripped of leading/trailing whitespace
   - both with internal whitespace runs collapsed to single space (`re.sub(r"\s+", " ", text).strip()`)
   - case-sensitive content match
3. If `pyyaml` isn't importable, fall back to current behavior with a printed warning to stderr ("yaml not available; falling back to byte comparison; YAML escaping mismatches may surface as note mismatches").
4. Tests must cover: escaped vs raw quotes pair → match; trailing whitespace difference → match; case difference → mismatch (intentional).

### Fix 3 — Repair preserves checkpoint flags + content-aware staleness (MEDIUM-HIGH priority)

**Files**:
- `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_state.py` (schema + helper)
- `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_checkpoint.py` (persist on success)
- the repair command handler (search via `grep -rn "command_repair" docs/workflow/operations/codex-skills/feature-factory/scripts/`)

**Today**: when an operator edits plan.md to address a review finding, all reviews go stale; repair regenerates them from scratch and FORGETS the operator's previous successful flags (e.g. `--no-auto-context`, `--max-artifact-chars 200000`). The regen then hits char limits, fails, and the operator is stuck in a loop.

**Fix part A** — persist flags:
1. Add a new field `state.last_successful_checkpoint_flags: dict` (top-level), shape:
   ```
   {
     "spec":  {"max_artifact_chars": 50000, "max_total_chars": 200000, "no_auto_context": false, ...},
     "plan":  {...},
     "tasks": {...},
     "diff":  {...},
     "closeout": {...}
   }
   ```
2. On every successful checkpoint, persist the flag set actually used to that stage's slot. Capture flags at the top of `command_checkpoint` after argparse, and write them to state on the success path.
3. Don't break the existing `command_telemetry` and `token_usage` schemas — this is a NEW top-level field. Add `setdefault("last_successful_checkpoint_flags", {})` to the load path.

**Fix part B** — repair re-uses flags:
1. When `command_repair` triggers a regen of a stage's reviews, read `state.last_successful_checkpoint_flags[stage]` and apply those flags to the regen invocation transparently.
2. Operator sees a log line: `[repair] re-using flags from last successful checkpoint: --no-auto-context --max-artifact-chars 200000`.
3. Operator can override by passing flags explicitly to the repair command — explicit flags WIN over persisted flags.

**Fix part C** — content-aware staleness:
1. Today, ANY edit to plan.md bumps the artifact's sha256, marking all reviews stale. Including reconciliation-section appends.
2. Add a helper `factory_state.compute_narrowed_artifact_sha(path: Path) -> str` that strips the `## Review Reconciliation` section from plan.md before hashing. (For spec.md, tasks.md, etc., narrowed sha == full sha — no special section to strip.)
3. Reviews compare against the narrowed sha. Operator's plan.md edits that ONLY touch the reconciliation section don't mark reviews stale. Edits that touch any other section DO mark reviews stale.
4. Add tests: edit just `## Review Reconciliation` content → reviews stay healthy; edit any other plan section → reviews go stale; compute_narrowed_artifact_sha produces consistent output regardless of trailing whitespace in the reconciliation block.

### Fix 4 — Default `--no-auto-context` at plan + diff stages (XS effort, high impact)

**File**: `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_checkpoint.py`

**Today**: auto-context is on by default at every stage. At plan/diff stages, the artifact IS the source of truth; auto-context just adds noise that pushes char counts over the limit.

**Fix**:
1. At plan and diff stages, default `--no-auto-context` to True (was False).
2. Add `--auto-context` flag (boolean, default False at plan/diff, True at spec/tasks) so operators can force-enable auto-context if they actually want it.
3. Spec and tasks stages keep auto-context on by default.
4. Update help text.
5. Update `docs/workflow/operations/codex-skills/feature-factory/SKILL.md` to mention the new default.

## Workflow you will execute

Drive the FF runner end-to-end. Sequence:

### 1. Branch + init

```bash
git fetch origin main
git checkout -b claude/ff-reconciliation-hardening origin/main
python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py init \
  --slug ff-reconciliation-hardening \
  --path docs/workflow/feature-runs/ff-reconciliation-hardening
```

### 2. Discover

```bash
python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py discover \
  --slug ff-reconciliation-hardening \
  --summary "<2-3 sentence summary>" \
  --non-goal "..." (5-6 of these) \
  --acceptance-criteria "..." (8-10 of these, each user-facing) \
  --complete
```

### 3. Author spec.md

Write a comprehensive spec covering the 4 fixes. Use FR numbering (FR-001, FR-002, ...). Document residual risks. Reference PRs #744 (severity regex), #751 (3-way reconcile), #765 (token reliability) as prior art. Target ~250-400 lines. Include user stories with Given/When/Then acceptance scenarios.

### 4. Spec checkpoint loop

```bash
python3 .../run_factory.py checkpoint --slug ff-reconciliation-hardening --stage spec --repair-timeout-seconds 900 --no-auto-context
```

(Note: `--no-auto-context` is part of what we're fixing. For this PR, pass it explicitly until Fix 4 lands.)

Then:
```bash
python3 .../run_factory.py auto-reconcile --slug ff-reconciliation-hardening --stage spec
```

For each "needs-review" output, READ the review's `## Findings` section. For each finding, decide:
- **FIXED** — update spec.md to address, then `reconcile --status accepted --note "<short note explaining the fix>"`.
- **ACCEPTED AS RESIDUAL** — document the trade-off in spec.md Risks section (R1, R2, ...), then `reconcile --status accepted --note "documented as residual R<N>"`.
- **DEFERRED** — out of scope, defer to follow-up. `reconcile --status deferred --note "<reason>"`.
- **REJECTED** — reviewer is wrong. `reconcile --status accepted --note "<rebuttal>"`. Be honest about WHY.

Re-checkpoint. Iterate until either:
- (a) all reviewers pass on a clean round (auto-reconcile shows zero needs-review), OR
- (b) you hit the 3-round adversarial cap.

On cap, run `judge --slug ff-reconciliation-hardening --stage spec`. If judge says advance, proceed. If judge says block with unresolved concerns, address them before retrying.

### 5. Author plan.md → plan checkpoint loop (same process)

### 6. Author tasks.md → record parallel analysis → tasks checkpoint loop

```bash
python3 .../run_factory.py parallel --slug ff-reconciliation-hardening --note "<reasoning about parallel opportunities>"
python3 .../run_factory.py checkpoint --slug ff-reconciliation-hardening --stage tasks --repair-timeout-seconds 900 --no-auto-context
```

### 7. Implement

You ARE the implementer. Do the edits inline. Each fix maps to ~50-200 lines of code + tests:

- **Fix 1**: `factory_review_specs.py` + `tests/test_factory_review_specs.py`
- **Fix 2**: `verify_reconciliation.py` (review-lens) + new tests for canonical comparison
- **Fix 3**: `factory_state.py` + `factory_cmd_checkpoint.py` + `factory_cmd_repair.py` (or wherever repair lives) + tests
- **Fix 4**: `factory_cmd_checkpoint.py` defaults + tests + SKILL.md update

After each logical chunk, run preflight:
```bash
python3 -m unittest discover docs/workflow/operations/codex-skills/feature-factory/scripts/tests
```
Check exit code DIRECTLY — do NOT pipe to tail/grep. Pipe loses the runner's exit status. To see a summary AFTER the gate passes, run a second time piping to `tail -3` for human display.

### 8. Commit

Stage modified files explicitly (NOT `git add -A` — the worktree has unrelated dirty paths from concurrent FF runs):
```bash
git add docs/workflow/operations/codex-skills/feature-factory/scripts/factory_review_specs.py
git add docs/workflow/operations/codex-skills/feature-factory/scripts/factory_state.py
git add docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_checkpoint.py
# ... etc, list each file you actually modified
git add docs/workflow/operations/codex-skills/feature-factory/scripts/tests/
git add docs/workflow/operations/codex-skills/review-lens/scripts/verify_reconciliation.py
git add docs/workflow/feature-runs/ff-reconciliation-hardening/
git commit -m "ff-reconciliation-hardening: <one-line summary>

<multi-line body covering each fix>

Co-Authored-By: Codex (gpt-5.4) <noreply@openai.com>"
```

### 9. Run diff checkpoint + reconcile (same process)

### 10. Deliver

```bash
git push -u origin claude/ff-reconciliation-hardening
gh pr create --repo chrislawcodes/valuerank \
  --base main \
  --head claude/ff-reconciliation-hardening \
  --draft \
  --title "FF Reconciliation Hardening: CRITICAL severity, canonical note compare, flag persistence, plan no-auto-context default" \
  --body "$(cat <<'EOF'
## Summary
<...>

## What changed
<table of fixes>

## Tests
<count: was 327; should be ~340>

## Adversarial review fixes
<the HIGHs that were caught and addressed>

## Test plan
- [x] All FF tests pass locally
- [ ] CI green

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 11. Ship

```bash
gh pr checks <pr-number> --repo chrislawcodes/valuerank --watch
gh pr ready <pr-number> --repo chrislawcodes/valuerank
gh pr merge <pr-number> --repo chrislawcodes/valuerank --squash --delete-branch
git fetch origin main && git log origin/main --oneline -2
```

## Escape hatches you may need

- **Codex review timeout**: if a Codex reviewer subprocess times out during checkpoint, reconcile that one review as `--status deferred --note "Codex timed out; round-N findings already addressed."` and proceed.
- **Char overflow** at any stage: pass `--no-auto-context` AND `--max-artifact-chars 200000 --max-total-chars 400000`. (Once Fix 4 lands, plan/diff won't need `--no-auto-context` — but until commit, keep passing it.)
- **Diff artifact > 150KB hard cap**: pass `--allow-large-diff-rerun` AND raise `--max-artifact-chars` to ~300000.
- **Dirty path outside scope**: pass `--allow-dirty-path docs/workflow/feature-runs/ff-reconciliation-hardening/`.
- **PR refuses to merge ("not up to date")**: rebase on origin/main, force-push (`--force-with-lease`), wait for CI, retry merge.
- **`docs/workflow/operations/review-attempts.jsonl` is dirty after each checkpoint**: it's an audit log; `git checkout --` it before any path-sensitive command. Do NOT commit it.
- **Workflow state files for OTHER feature runs get dirtied during test runs**: `git checkout --` them; this is the test-isolation issue PR #765's gate caught; fixing those tests is out of scope here.
- **Codex sandbox can't commit (`.git/worktrees/<name>/index.lock` not writable)**: NOT applicable when YOU are running as orchestrator (you have full git access). Just commit normally.
- **Out of Codex quota mid-run**: stop, write a postmortem at `docs/workflow/feature-runs/ff-reconciliation-hardening/postmortem.md` explaining where you stopped, commit progress, push, leave the PR draft. Do NOT mark ready.

## DO NOT TOUCH

- `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`, `.gitignore`, `cloud/CLAUDE.md`
- Any file outside `docs/workflow/` and `docs/workflow/operations/codex-skills/feature-factory/scripts/` and `docs/workflow/operations/codex-skills/review-lens/scripts/`
- The `repair`, `block`, `discover`, `parallel`, `init` CLI subcommand HANDLER NAMES (you can change behavior, not names)
- Other feature runs' state.json or scope.json files
- `factory_telemetry.py` (existing reviewer-LLM telemetry — separate concern; PR #765 added `factory_telemetry_commands.py` for orchestrator telemetry)

## Output

When the PR is merged, print:
- The PR URL
- The merge commit SHA on main
- The final test count
- Any issues you encountered and how you resolved them
- Any items deferred to follow-up

## When you're stuck

If you've made 3+ attempts to resolve a single reviewer finding without progress: write a brief note to stderr explaining the impasse, mark that review as `--status deferred`, and continue. Don't loop.

If a checkpoint blocks on something you can't unblock with a documented escape hatch: stop, write a postmortem, leave the PR draft, exit. The operator (the user who launched you) will pick up from there.
