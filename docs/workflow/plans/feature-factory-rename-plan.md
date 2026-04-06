# Plan: Rename feature-workflow → feature-factory

**Goal:** Eliminate the terminology collision between the meta-pipeline system ("feature workflow")
and per-feature artifact directories (`docs/workflows/`). Clean up all shipped workflow dirs.

**After this rename:**
- Runner lives at: `docs/operations/codex-skills/feature-factory/scripts/run_factory.py`
- Per-feature state lives at: `docs/feature-runs/<slug>/state.json`
- No overlapping use of the word "workflow" between system and artifacts

---

## Phase 1 — Delete stale workflow dirs

These dirs correspond to features that shipped. Delete them with `git rm -r`.

| Dir | Shipped as |
|-----|-----------|
| `docs/workflows/aggregate-service-split` | No workflow.json — orphan |
| `docs/workflows/analysis-scenario-metadata-normalization` | #362 |
| `docs/workflows/batch-paired-batch-semantics` | #380 |
| `docs/workflows/definition-mutation-split` | #340 |
| `docs/workflows/domain-dropdown-cleanup` | #363 |
| `docs/workflows/domain-first-site-ia-migration` | #352 |
| `docs/workflows/domain-query-split` | No workflow.json — orphan |
| `docs/workflows/dominance-section-split` | #339 |
| `docs/workflows/feature-workflow-discovery-shaping` | Discovery phase docs, done |
| `docs/workflows/job-choice-implementation` | #353–#369 series |
| `docs/workflows/paired-batch-launch-page` | #382 |
| `docs/workflows/paired-vignette-analysis-shell` | #365 area |
| `docs/workflows/run-form-split` | #338 area |
| `docs/workflows/run-mutation-split` | #338 |
| `docs/workflows/top-of-response-decision-parser` | #362 |
| `docs/workflows/workflow-two-mode-implementation` | f41c7b26 |

**Keep:**
- `docs/workflows/workflow-runner-hardening` — active, not yet shipped

---

## Phase 2 — Rename the system side

### 2a. Rename containing directory
```
docs/operations/codex-skills/feature-workflow/
→ docs/operations/codex-skills/feature-factory/
```
Use `git mv`. All files inside move with it.

### 2b. Rename scripts
| Old | New |
|-----|-----|
| `scripts/run_feature_workflow.py` | `scripts/run_factory.py` |
| `scripts/workflow_state.py` | `scripts/factory_state.py` |

### 2c. Update imports inside run_factory.py
```python
# Old
from workflow_state import (REPO_ROOT, WORKFLOWS_ROOT, WORKFLOW_STATE, ...)
# New
from factory_state import (REPO_ROOT, FACTORY_RUNS_ROOT, FACTORY_STATE, ...)
```

### 2d. Rename constants inside factory_state.py
| Old | New |
|-----|-----|
| `WORKFLOWS_ROOT` | `FACTORY_RUNS_ROOT` |
| `WORKFLOW_STATE = "workflow.json"` | `FACTORY_STATE = "state.json"` |

All call sites of `WORKFLOWS_ROOT` and `WORKFLOW_STATE` in `run_factory.py` update automatically
via the import rename — but verify with grep after.

### 2e. Fix hardcoded path strings in run_factory.py (Gemini finding)
Two functions still hardcode `docs/workflows/` after the constant rename — they must be
updated to use `FACTORY_RUNS_ROOT` or the equivalent string:

- **`save_scope_manifest`**: builds `allowed_dirty_paths` with `f"docs/workflows/{safe_slug}"`.
  Change to `f"docs/feature-runs/{safe_slug}"` or derive from `FACTORY_RUNS_ROOT`.
- **`deliver --create-pr` PR body builder**: hardcodes `docs/workflows/{args.slug}/spec.md`
  (and plan.md, tasks.md) in the generated PR description.
  Change to `docs/feature-runs/{args.slug}/...`.

Grep to confirm no other hardcoded `docs/workflows` strings survive in the script after this fix.

### 2f. Rename test file
```
tests/test_run_feature_workflow_repair.py
→ tests/test_run_factory_repair.py
```
(was 2e, renumbered to 2f)
Update path assertions inside from `docs/workflows` → `docs/feature-runs`
and `workflow.json` → `state.json`.

---

## Phase 3 — Rename the artifact side

### 3a. Move the directory
```bash
git mv docs/workflows docs/feature-runs
```

> **Ordering warning (Gemini):** Do 3a before 3b. If you rename `workflow.json` to `state.json`
> first, it implicitly creates `docs/feature-runs/` on disk. Then `git mv docs/workflows
> docs/feature-runs` will nest the directory as `docs/feature-runs/workflows/` — broken.
> Always move the parent directory first.

### 3b. Rename the one remaining state.json
The only remaining workflow dir after Phase 1 is `workflow-runner-hardening`.
```bash
git mv docs/feature-runs/workflow-runner-hardening/workflow.json \
       docs/feature-runs/workflow-runner-hardening/state.json
```

### 3c. Update scope.json inside workflow-runner-hardening
`docs/feature-runs/workflow-runner-hardening/scope.json` lists old script paths.
Update the `paths` array:
```json
"docs/operations/codex-skills/feature-factory/scripts/run_factory.py"
```

### 3d. Update working docs inside workflow-runner-hardening
`spec.md`, `plan.md`, and `tasks.md` all reference the old runner path. Update occurrences of:
- `run_feature_workflow.py` → `run_factory.py`
- `docs/operations/codex-skills/feature-workflow/` → `docs/operations/codex-skills/feature-factory/`
- `docs/workflows/` → `docs/feature-runs/` (where it appears as a path, not in historical prose)

**Codex-identified line ranges:**
- `spec.md`: 48, 54, 60, 65, 73
- `plan.md`: 11, 33, 49, 84
- `tasks.md`: 5, 30, 58

### 3e. Update ALL checkpoint JSON files inside workflow-runner-hardening (Gemini + Codex)
Not just `implementation.diff.patch.json` — every `.json` file in the active workflow dir
that contains `artifact_path`, `paths`, `context_paths`, or `allowed_dirty_paths` pointing
to old locations will cause `resolve_stored_path()` to return a non-existent path, blocking
pipeline progression with a false "missing-artifact" or "missing-manifest" error.

`resolve_stored_path()` does NOT translate old paths — it only strips the repo root prefix.
`verify_review_checkpoint.py` does strict `artifact_path` matching and will hard-reject
any checkpoint whose recorded path doesn't exist on disk.

**Exact files to update** (Codex-confirmed):
- `reviews/spec.checkpoint.json`
- `reviews/plan.checkpoint.json`
- `reviews/tasks.checkpoint.json`
- `reviews/diff.checkpoint.json`
- `reviews/closeout.checkpoint.json`
- `reviews/implementation.diff.patch.json`
- `scope.json` (also covered in 3c — update `paths` and `allowed_dirty_paths`)
- `state.json` (formerly `workflow.json` — check `delivery.head_sha` context fields)

Run a global find-and-replace across all JSON files in `docs/feature-runs/workflow-runner-hardening/`:
```bash
# Dry-run first
grep -rl "docs/workflows\|feature-workflow\|run_feature_workflow\|workflow\.json" \
  docs/feature-runs/workflow-runner-hardening/
```

---

## Phase 3f — Fix cloud/scripts/job-choice-bridge-report.ts (Gemini 2 finding)

`cloud/scripts/job-choice-bridge-report.ts` line 25 hardcodes an absolute default output path:
```ts
let outputDir = path.resolve('/Users/chrislaw/valuerank/docs/workflows/job-choice-implementation/bridge-report');
```

This is tracked production code. The target dir (`job-choice-implementation`) is being deleted in
Phase 1. Fix: remove the hardcoded absolute path — require `--output-dir` to be passed explicitly,
or default to a repo-relative path that isn't inside `docs/feature-runs/`.

---

## Phase 4 — Update documentation

### Files to update

| File | What changes |
|------|-------------|
| `docs/operations/codex-skills/feature-factory/SKILL.md` | All `docs/workflows` → `docs/feature-runs`, `workflow.json` → `state.json`, script name |
| `docs/operations/codex-skills/feature-factory/CODEX-ORCHESTRATOR.md` | Same + model table script path |
| `~/.claude/CLAUDE.md` | Invocation examples, directory references |
| `~/.claude/projects/-Users-chrislaw-valuerank/memory/MEMORY.md` | Local dev pattern notes |
| `docs/plans/feature-workflow-plan.md` | References to improvement items and runner |

---

## Phase 5 — Verify

```bash
# 1. Run tests
cd /Users/chrislaw/valuerank
python3 -m pytest docs/operations/codex-skills/feature-factory/tests/test_run_factory_repair.py -v

# 2. Smoke-test the runner on the active workflow
python3 docs/operations/codex-skills/feature-factory/scripts/run_factory.py \
  status --slug workflow-runner-hardening

# 3. Grep for any surviving "workflow" references that should have been renamed
grep -r "run_feature_workflow\|WORKFLOWS_ROOT\|WORKFLOW_STATE\|docs/workflows" \
  docs/operations/codex-skills/feature-factory/ \
  docs/feature-runs/ \
  ~/.claude/CLAUDE.md
```

Expected: zero matches.

---

## Commit strategy

Single atomic commit. All phases in one go — avoids a broken intermediate state where the
runner looks for `state.json` but finds `workflow.json`, or looks for `docs/feature-runs`
but finds `docs/workflows`.

```
chore(rename): feature-workflow → feature-factory, docs/workflows → docs/feature-runs

- Delete 16 stale shipped workflow dirs
- Rename runner: run_feature_workflow.py → run_factory.py
- Rename state module: workflow_state.py → factory_state.py
- Rename constants: WORKFLOWS_ROOT → FACTORY_RUNS_ROOT, WORKFLOW_STATE → FACTORY_STATE
- Rename artifact dir: docs/workflows/ → docs/feature-runs/
- Rename state file: workflow.json → state.json
- Update SKILL.md, CODEX-ORCHESTRATOR.md, CLAUDE.md, MEMORY.md
```
