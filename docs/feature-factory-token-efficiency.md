# Feature Factory — Token Efficiency Improvements

Ordered by impact. Each item is a concrete, bounded change.

---

## High Impact

- [x] **#1 — Short-circuit empty review resolutions** ✅ DONE
  When all Gemini/Codex findings are LOW severity or empty, the runner should mark `resolution_status: accepted` automatically — without handing control back to Claude to read and process the review.
  - Change is in the factory runner (Python), not in the skills
  - Condition: no HIGH or MEDIUM findings in review file → skip Claude revision pass entirely
  - From the archived runs, this would have eliminated 2 of 4 resolution steps in workflow-runner-hardening

- [x] **#2 — Compressed plan summary for downstream stages** ✅ DONE
  Plan.md (~12KB) is loaded in full at tasks and diff stages, but those stages only need file paths, migration steps, key constraints, and data model. Everything else (rationale, options considered, background) is already resolved.
  - feature-plan skill should produce a `plan-summary.md` alongside `plan.md` (~2–3KB)
  - Summary must include: file paths, migration steps, key constraints **with their rationale** (not just the constraint — the diff review stage needs to understand *why* a constraint exists to make correct judgment calls), and data model
  - feature-tasks and diff stages load `plan-summary.md` instead of `plan.md`
  - `plan.md` stays intact for human review; only the downstream context input shrinks
  - Also wired into `_build_codex_prompt` — each Codex implementation worker now loads `plan-summary.md` + `spec-acceptance.md` instead of full files

- [x] **#3 — Stop re-loading spec.md at tasks and diff stages** ✅ DONE
  By the tasks stage, spec.md user stories and requirements are already distilled into plan.md. Re-loading the full spec adds ~5K tokens of redundant context per stage.
  - Extract acceptance criteria into a dedicated `spec-acceptance.md` (~10 lines) during planning
  - Tasks and diff stages load `spec-acceptance.md` instead of full `spec.md`

---

## Medium Impact

- [x] **#4 — Audit and trim skill files** ✅ DONE
  feature-implement is 993 lines. feature-plan is 697. These are loaded into context on every invocation. Much of the content is instructional scaffolding that's only relevant once.
  - Move edge-case instructions to a separate reference file (e.g. `feature-plan-reference.md`) loaded on demand, not on every invocation
  - The default skill file should contain only what's needed on every run; total content can stay — it just shouldn't all be in context by default
  - A blanket line-count target risks trimming content Codex actually needs on harder tasks
  - Done for all three skills: `feature-plan-reference.md`, `feature-tasks-reference.md`, `feature-implement-reference.md` created; Examples + Error Handling sections replaced with one-paragraph pointers in each SKILL.md

- [x] **#5 — Proactive diff size warning before implementation** ✅ DONE
  The diff stage has a hard cap of 150K chars. When a task set is large, it can hit that cap during review, forcing reruns. The pipeline should warn *before* implementation if the task set is likely to produce an oversized diff.
  - After tasks checkpoint, estimate diff size from number of tasks + files in scope
  - Warn and suggest splitting if estimated diff > 80K chars (the existing rerun-warning threshold)
  - Added to feature-implement SKILL.md Step 1: warns and pauses if task_count >= 20 OR file_scope >= 15 unique files

---

## Low Impact (free wins)

- [x] **#6 — Confirm Codex stderr logs never enter Claude context** ✅ VERIFIED
  Codex reviews produce 20–31KB stderr/stdout files per run. Confirmed: the runner writes these to disk only; they appear as file path references in failure notices but are never loaded as context. Skill files contain no references to them. No action needed.

- [x] **#7 — Skip task-breakdown reviews for small task sets** ✅ DONE
  Under ~15 tasks, coverage and dependency-order reviews (Gemini at tasks stage) rarely find actionable issues.
  - Add a threshold: if `task_count < 15`, skip the tasks-stage Gemini reviews
  - Still run Codex execution review (lighter, faster)
  - `SMALL_TASK_SET_THRESHOLD = 15` constant in `factory_review.py`; `required_reviews()` gains `small_task_set` param; `command_checkpoint` counts task lines from artifact (tasks stage) or `tasks.md` (closeout stage) and sets flag automatically
  - Same skip applied to the closeout stage (small features rarely surface actionable Gemini closeout findings)

---

## Additional fixes (identified during implementation review)

- [x] **#8 — Cap auto-context file injection** ✅ DONE
  `_extract_file_paths_from_artifact` had no size limit — specs referencing many files silently ballooned review context.
  - Added `_AUTO_CONTEXT_MAX_FILES = 10` constant; function stops collecting at 10 files
  - Call site also enforces the cap when appending to `context_paths` (covers manually-passed `--context` flags too)
  - Moved `_AUTO_CONTEXT_PATH_RE` and `_AUTO_CONTEXT_EXTENSIONS` to module level (were recompiled on every call)

- [x] **#9 — Clear stale dirty override on diff re-run** ✅ DONE
  `--allow-dirty-path` persisted in workflow state forever; subsequent diff checkpoints without the flag showed stale override in `status`.
  - When diff checkpoint runs without `--allow-dirty-path`, state key is now removed (`pop`) rather than written with `used: False` and old paths intact

- [x] **#10 — Fix `detect_actionable_findings` case-sensitivity** ✅ DONE
  Regex matched `high severity` but not `High Severity` or `HIGH SEVERITY`; reviews with mixed-case headings were never auto-accepted.
  - Function now lowercases the full text once upfront; all heading detection and regex matches operate on the lowercase version
  - Removed unnecessary `import re` inside function body; added `import re` at module level in `factory_review.py`
