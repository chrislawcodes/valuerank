---
reviewer: "codex"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/ff-quality-of-life/reviews/implementation.diff.patch"
artifact_sha256: "8f508990fcb6c42631c682d6146f1c97f5e7e10062e0a9f633947a53c249713d"
repo_root: "."
git_head_sha: "99bcf13cdfece2270f4ec1d6ffe4df099b7e1ec4"
git_base_ref: "origin/main"
git_base_sha: "29476d513f705290496288c4e580ba6890bc87ad"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM #1 (silent success on regex miss): FIXED — subn() now checks n_replaced == 1, raises on unexpected frontmatter format. MEDIUM #2 (None-to-concrete budget change): verified safe — no downstream logic treats None as unlimited; defaults are explicit raises. LOW (--fast mutex): FIXED — --fast now in the mutex list."
raw_output_path: "docs/workflow/feature-runs/ff-quality-of-life/reviews/diff.codex.regression-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

- Medium: `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_checkpoint.py` can report a successful `--validation-only` reseal even when a review file was not actually updated. The code only looks for `artifact_sha256:` with one very specific quoted regex, then does an unanchored `sub()` and never checks that a replacement happened. If the frontmatter is missing, unquoted, or formatted slightly differently, the file can stay stale while the command still appends the success annotation and exits `0`.
- Medium [UNVERIFIED]: `docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py` now hardcodes defaults for `--max-artifact-chars`, `--max-context-chars`, and `--max-total-chars`. That changes parsed args from `None` to concrete values on every checkpoint run. If downstream logic used `None` to mean “use adaptive limits” or “leave uncapped,” this patch removes that path and can change budgeting behavior globally.
- Low: `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_checkpoint.py` does not reject `--validation-only` together with `--fast`, even though `--fast` is advertised as a reviewer-dispatching mode. The early return makes `--fast` silently ignored instead of failing fast, which can hide operator mistakes.

## Residual Risks

- The validation-only flow still allows partial state if a write fails after some review files have already been resealed. That is documented in the code comments, but it means a rerun is required to converge.
- The new prompt rule in `docs/workflow/operations/codex-skills/feature-factory/judge-prompts/restatement.md` depends on prior-round reasoning text being available verbatim. If that text is not preserved in a later round, severity-drop can no longer be used as a proceed basis, which may slow or block progression.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM #1 (silent success on regex miss): FIXED — subn() now checks n_replaced == 1, raises on unexpected frontmatter format. MEDIUM #2 (None-to-concrete budget change): verified safe — no downstream logic treats None as unlimited; defaults are explicit raises. LOW (--fast mutex): FIXED — --fast now in the mutex list.
