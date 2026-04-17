---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/summarizer-fallback-removal/plan.md"
artifact_sha256: "f48bcbaa251a8ef5ad4489074e0e24a5dc868001dd09d7d805eacb4f52e4fab7"
repo_root: "."
git_head_sha: "6aa2af3410351431f88a8a4bc12fda6deeef7c8e"
git_base_ref: "origin/main"
git_base_sha: "6aa2af3410351431f88a8a4bc12fda6deeef7c8e"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM (refusal) deferred per spec scope. MEDIUM (monkeypatch) accepted — plan updated to note removing mock patches in Wave 1. MEDIUM (MCP token budget) accepted — Wave 4 tasks will add budget-aware handling."
raw_output_path: "docs/workflow/feature-runs/summarizer-fallback-removal/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "reviewed by runner with orchestrator reconciliation"
---

# Review: plan architecture-adversarial

## Findings

1. Medium [CODE-CONFIRMED]: The unresolvable count definition misses `decision_code = 'refusal'` transcripts. The summarizer can persist `refusal` as a non-scoring outcome, and downstream scoring treats refusals as non-scoring. If the banner is meant to flag transcripts needing adjudication, this definition undercounts them.

2. Medium [CODE-CONFIRMED]: Removing `classify_decision_with_llm` from `summarize.py` breaks the current monkeypatch contract. Tests patch `summarize.classify_decision_with_llm`; after the import is removed that patch target no longer exists, so those mocks will fail.

3. Medium [CODE-CONFIRMED]: The new MCP `unresolvable` payload may push `get_run_summary` past its 5KB budget. The tool today only truncates `insights` and `llmSummary`, while `RunSummary` is expanded in the formatter layer. Adding a per-model breakdown without budget-aware pruning risks truncating other summary fields.

## Residual Risks

- `parseClass='unparseable'` does not appear to exist in the Python worker codebase, so that class is not a concern for the unresolvable query.
- Legacy manual overrides without `decision_code_source` set could still be counted, but `IS DISTINCT FROM 'manual'` handles NULL correctly, so old rows without the column set will still be counted. Low risk.

## Resolution
- status: accepted
- note: MEDIUM (refusal) deferred per spec scope. MEDIUM (monkeypatch) accepted — plan updated to note removing mock patches in Wave 1. MEDIUM (MCP token budget) accepted — Wave 4 tasks will add budget-aware handling.
