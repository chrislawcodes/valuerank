---
reviewer: "claude-opus-4-5"
lens: "implementation-risk-judge"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/ff-codex-reintegration/tasks.md"
artifact_sha256: "fe493f2233af69d766f32a89be1c05b4354710f37e00494c7fb528a99f04af8b"
repo_root: "."
git_head_sha: "80a77301dc580237a047b7093138f47ab77402ee"
git_base_ref: "origin/main"
git_base_sha: "80a77301dc580237a047b7093138f47ab77402ee"
generation_method: "judge-panel"
resolution_status: "open"
resolution_note: "Three load-bearing gaps would cause a competent implementer to stall or ship the wrong behavior. First, REPO_ROOT is used as a constant in every subprocess call and path construction across both new modules (factory_cmd_dispatch.py, fact..."
raw_output_path: "docs/workflow/feature-runs/ff-codex-reintegration/reviews/judge.implementation-risk.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks implementation-risk-judge

## Findings

Three load-bearing gaps would cause a competent implementer to stall or ship the wrong behavior. First, REPO_ROOT is used as a constant in every subprocess call and path construction across both new modules (factory_cmd_dispatch.py, factory_cmd_advance.py) but no artifact names which module defines it or how to import it. An implementer creating a new file from these artifacts alone cannot write a correct import line without grepping outside them. Second, @mutates_state is required by FR-006, FR-015, and three separate task items but is described only as coming from 'the existing decorator module' — the module is never named, so the import line is a guess. Third, the fallback order for _resolve_branch_base() directly contradicts between FR-019 ('origin/main → fork-point → main') and Plan Slice 1 prose ('origin/main → main → fork-point'). Tasks T02 agrees with FR-019 and explicitly explains the rationale for putting fork-point before local main, but an implementer who follows the Plan's Slice 1 description — which is the implementation guide — will code the wrong order. This is not aesthetic: choosing the wrong order defeats the stated purpose of Fix 5 on long-lived branches.

## Residual Risks

- tasks :: Slice 5 — T23 step 4 and step 7 - head_sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, ...) ... Popen([codex_path, "exec", "-m", args.model, "-s", "workspace-write", prompt_text], cwd=REPO_ROOT, ...)
- tasks :: Slice 4 — T18 - Decorate with `@mutates_state` from the existing decorator module.
- spec :: Functional requirements — FR-019 - `factory_deliver._resolve_branch_base()` MUST attempt branch-base resolution in this order: `git merge-base origin/main HEAD` → `git merge-base --fork-point origin/main HEAD` → `git merge-base main HEAD`.
- plan :: Slice 1 — Banner rename + branch-base fallback - rewrite `_resolve_branch_base()` to try in order: `git merge-base origin/main HEAD` → `git merge-base main HEAD` → `git merge-base --fork-point origin/main HEAD` → return `None`.

## Verdict (structured)

```json
{
  "confidence": 4,
  "evidence": [
    {
      "artifact": "tasks",
      "quote": "head_sha = subprocess.run([\"git\", \"rev-parse\", \"HEAD\"], cwd=REPO_ROOT, ...) ... Popen([codex_path, \"exec\", \"-m\", args.model, \"-s\", \"workspace-write\", prompt_text], cwd=REPO_ROOT, ...)",
      "section": "Slice 5 \u2014 T23 step 4 and step 7"
    },
    {
      "artifact": "tasks",
      "quote": "Decorate with `@mutates_state` from the existing decorator module.",
      "section": "Slice 4 \u2014 T18"
    },
    {
      "artifact": "spec",
      "quote": "`factory_deliver._resolve_branch_base()` MUST attempt branch-base resolution in this order: `git merge-base origin/main HEAD` \u2192 `git merge-base --fork-point origin/main HEAD` \u2192 `git merge-base main HEAD`.",
      "section": "Functional requirements \u2014 FR-019"
    },
    {
      "artifact": "plan",
      "quote": "rewrite `_resolve_branch_base()` to try in order: `git merge-base origin/main HEAD` \u2192 `git merge-base main HEAD` \u2192 `git merge-base --fork-point origin/main HEAD` \u2192 return `None`.",
      "section": "Slice 1 \u2014 Banner rename + branch-base fallback"
    }
  ],
  "judge": "implementation-risk",
  "model": "claude-opus-4-5",
  "reasoning": "Three load-bearing gaps would cause a competent implementer to stall or ship the wrong behavior. First, REPO_ROOT is used as a constant in every subprocess call and path construction across both new modules (factory_cmd_dispatch.py, factory_cmd_advance.py) but no artifact names which module defines it or how to import it. An implementer creating a new file from these artifacts alone cannot write a correct import line without grepping outside them. Second, @mutates_state is required by FR-006, FR-015, and three separate task items but is described only as coming from 'the existing decorator module' \u2014 the module is never named, so the import line is a guess. Third, the fallback order for _resolve_branch_base() directly contradicts between FR-019 ('origin/main \u2192 fork-point \u2192 main') and Plan Slice 1 prose ('origin/main \u2192 main \u2192 fork-point'). Tasks T02 agrees with FR-019 and explicitly explains the rationale for putting fork-point before local main, but an implementer who follows the Plan's Slice 1 description \u2014 which is the implementation guide \u2014 will code the wrong order. This is not aesthetic: choosing the wrong order defeats the stated purpose of Fix 5 on long-lived branches.",
  "timestamp": "2026-04-24T00:00:00Z",
  "unaddressed_high_finding_ids": [],
  "verdict": "block"
}
```

## Resolution
- status: open
- note: Three load-bearing gaps would cause a competent implementer to stall or ship the wrong behavior. First, REPO_ROOT is used as a constant in every subprocess call and path construction across both new modules (factory_cmd_dispatch.py, fact...
