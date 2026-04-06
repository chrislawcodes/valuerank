# Hostile Code Review: `feature-factory` Rename Migration Failures

I have analyzed the repository for surviving references to the old `feature-workflow` system. The execution of the rename migration was incomplete. While the developer drafted a plan (`docs/plans/feature-factory-rename-plan.md`), they failed to execute the internal content updates, leaving behind massive amounts of broken references and stale documentation.

Here is the exhaustive punch list of surviving references that must be fixed.

## 🚨 BROKEN REFERENCES (Will Cause Runtime Errors)
These references exist in live code, configuration, or tests. If the directories/files are renamed as planned without updating these strings, the system will hard-crash.

1. **`cloud/scripts/job-choice-bridge-report.ts`**
   - **Line 25**: `let outputDir = path.resolve('/Users/chrislaw/valuerank/docs/workflows/job-choice-implementation/bridge-report');`
   - **Severity**: Hard crash. The TypeScript worker will fail to resolve the output directory when building the bridge report.

2. **`docs/workflows/workflow-runner-hardening/scope.json`**
   - **Lines 36, 128**: `"docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py"`
   - **Severity**: Workflow validation failure. The runner relies on `scope.json` to enforce execution boundaries. Changing the runner's path without updating this file will break scope locking.

3. **`docs/workflows/workflow-runner-hardening/reviews/implementation.diff.patch.json`**
   - **Lines 4, 15**: `"docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py"`
   - **Severity**: Broken diff resolution. Patch tools will fail to apply or track the diff against the renamed file.

4. **`docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py`** (The Runner itself)
   - **Line 17**: `from workflow_state import (` (Imports the old state module)
   - **Line 19**: `WORKFLOWS_ROOT` (Imports old constant)
   - **Line 20**: `WORKFLOW_STATE` (Imports old constant)
   - **Line 305**: `f"docs/workflows/{safe_slug}"` (Hardcoded directory creation path)
   - **Lines 1821-1823**: `f"- spec: docs/workflows/{args.slug}/spec.md"` (Context paths fed back to the LLM)
   - **Severity**: Critical hard crashes across the entire command lifecycle.

5. **`docs/operations/codex-skills/feature-workflow/scripts/workflow_state.py`** (The State module)
   - **Line 19**: `WORKFLOWS_ROOT: Path = REPO_ROOT / "docs" / "workflows"`
   - **Line 25**: `WORKFLOW_STATE = "workflow.json"`
   - **Severity**: Critical. Points the entire system to look for state files in the old, non-existent directories.

6. **`docs/operations/codex-skills/feature-workflow/tests/test_run_feature_workflow_repair.py`**
   - **Lines 47, 50, 65, 67, 68... (60+ occurrences)**: Hardcoded `"docs/workflows/..."` and `"workflow.json"` in path mocks and assertions.
   - **Severity**: Total test suite failure.


## ⚠️ STALE DOCUMENTATION (Will Cause Confusion)
These are non-executable files that contain outdated mental models and instructions. While they won't crash the server, they will break the LLMs' ability to operate the skill.

1. **`docs/operations/codex-skills/feature-workflow/SKILL.md`**
   - **Lines 12, 14, 56, 264, 268, 273**: Instructs agents to use `docs/workflows/`, `workflow.json`, and the old `.py` script path. This will cause agents to confidently hallucinate wrong files.

2. **`docs/operations/codex-skills/feature-workflow/CODEX-ORCHESTRATOR.md`**
   - **Lines 13, 36, 43, 45, 47, 52, 77, 116, 122, 127**: Examples and guidelines explicitly naming `run_feature_workflow.py` and old directories.

3. **`docs/plans/feature-workflow-plan.md`**
   - **Lines 4, 34, 37, 47**: Internal references to old file paths.

4. **16 Shipped Workflow Directories (900+ occurrences)**
   - All historical tracking files (e.g. `aggregate-service-split`, `run-form-split`) under `docs/workflows/` currently exist and comprise over 900 string matches of the old names.
   - **Resolution**: Provide `git rm -r` on these 16 obsolete directories as planned, which will organically prune these 900+ stale hits.
