# Plan

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Fixed after judge-cap advance: added word boundaries, heading spacing, replay-safe flag principle, extra ignored Markdown contexts, and YAML recovery constraints.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Fixed after judge-cap advance: added word boundaries, heading spacing, replay-safe flag principle, extra ignored Markdown contexts, and YAML recovery constraints.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: Fixed after judge-cap advance: added word boundaries, heading spacing, replay-safe flag principle, extra ignored Markdown contexts, and YAML recovery constraints.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Fixed: added near-miss heading tests, nested Markdown severity tests, unsafe injected state checks, whitespace normalization tests, and legacy hash compatibility.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Fixed: added near-miss heading tests, nested Markdown severity tests, unsafe injected state checks, whitespace normalization tests, and legacy hash compatibility.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Fixed: actionable findings force open from any prior status, link/image markdown is handled, Findings heading is case-insensitive with spacing, and notes normalize NFC.
- review: reviews/tasks.codex.dependency-order-adversarial.review.md | status: accepted | note: Fixed: actionable findings force open from any prior status, link/image markdown is handled, Findings heading is case-insensitive with spacing, and notes normalize NFC.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: Fixed: actionable findings force open from any prior status, link/image markdown is handled, Findings heading is case-insensitive with spacing, and notes normalize NFC.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: Fixed: auto-context extraction now uses the resolved auto-context default directly, with tests for spec/tasks enabled and plan/diff disabled by default. Rejected: plan-only Review Reconciliation hashing is an explicit spec requirement; non-plan artifacts use full hashes.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: deferred | note: Codex quota exhausted — re-run after quota refresh. See https://chatgpt.com/codex/settings/usage
- review: reviews/diff.codex.regression-adversarial.review.md | status: deferred | note: Codex quota exhausted — re-run after quota refresh. See https://chatgpt.com/codex/settings/usage

## Summary

Implement the hardening as one focused runner-tooling change set. The code already has several PR #765 reliability helpers, so this plan extends existing modules instead of introducing a new reconciliation subsystem.

## Architecture

| Fix | Primary files | Approach |
|---|---|---|
| CRITICAL/LOW severity and safer auto-accept | `factory_review_specs.py`, `run_factory.py`, tests | Expand the severity detector to the explicit CRITICAL/HIGH/MEDIUM/LOW set, strip non-finding Markdown contexts before matching, and keep auto-reconcile open until a clean scan succeeds. |
| Canonical reconciliation note compare | `review-lens/scripts/verify_reconciliation.py`, review-lens tests | Parse YAML frontmatter with PyYAML when available, normalize note strings, and degrade to byte-style parsing with a warning if PyYAML is missing. |
| Checkpoint flag persistence and repair reuse | `factory_state.py`, `factory_cmd_checkpoint.py`, `factory_cmd_status.py`, tests | Add `last_successful_checkpoint_flags` top-level state, persist replay-safe effective flags plus a schema version on successful checkpoint, and merge valid entries into repair checkpoint args. |
| Content-aware plan staleness | `factory_state.py`, `factory_review.py`, checkpoint/judge call sites, tests | Add `compute_narrowed_artifact_sha` and route review freshness through it for plan artifacts while preserving existing full artifact hashes where needed for audit. |
| Plan/diff no-auto-context default | `run_factory.py`, `factory_cmd_checkpoint.py`, `SKILL.md`, tests | Add `--auto-context`, resolve effective context behavior by stage, and update auto-context extraction to use the resolved boolean. |

## Current Code Notes

- `factory_review_specs.py` already centralizes severity detection via `_ACTIONABLE_FINDING_RE` and `_AUTO_ACCEPT_NOTE`.
- `run_factory.py::command_auto_reconcile` currently skips non-open reviews and only calls `UPDATE_REVIEW` on clean scans.
- `factory_state.py` already owns state defaults, state load migration, and `normalized_artifact_hash`.
- `factory_cmd_checkpoint.py::command_checkpoint` already has a single success path after `REPAIR` returns 0, which is the right place to persist checkpoint flags.
- `factory_cmd_status.py::command_repair` calls `repair_checkpoint_args` from `factory_repair.py`; flag reuse belongs in that repair-args construction path.
- `verify_reconciliation.py` currently has a small manual frontmatter parser and byte-style note comparison.

## Implementation Waves

### Wave 1 — Severity Detection And Auto-Reconcile

1. In `factory_review_specs.py`, replace `_SEV` with an explicit CRITICAL/HIGH/MEDIUM/LOW set.
2. Add a small scan-target helper that extracts only the `## Findings` section when present. It must stop before `## Residual Risks`, `## Resolution`, or any later level-2 heading so synthesized resolution notes cannot self-trigger.
3. Add a preprocessing helper that removes fenced code blocks, indented code blocks, blockquotes, HTML comments, and inline code spans before regex matching. Do not strip markdown table rows; the original prompt requires table severity cells such as `| **CRITICAL** |` to remain actionable.
4. Ensure regex alternatives use a strict finding grammar, not generic keyword search. Supported starts are bullet/numbered-list severity prefixes, bold severity prefixes, table severity cells, level-2-or-deeper severity headings, and explicit `Severity:` fields. Ordinary prose like `high availability` or `low risk` must not match.
5. Update `_AUTO_ACCEPT_NOTE` to `No HIGH/MEDIUM/LOW/CRITICAL findings detected — auto-accepted`.
6. In `run_factory.py::command_auto_reconcile`, if `detect_actionable_findings` is true, call `UPDATE_REVIEW` with `open` and a clear note or leave it open if already open. This closes the stale accepted review path. Add a test that proves `UPDATE_REVIEW` supports accepted-to-open transitions.

Verification:

- Add tests for CRITICAL bullet and heading markers.
- Add tests that LOW markers now stay open.
- Add tests that code, quote, comment, and inline-code examples do not count.
- Add a table-actionable test: markdown table severity cells must count.
- Add a test that a previously accepted review is reopened when a new actionable marker appears.
- Add tests that `_AUTO_ACCEPT_NOTE` in frontmatter or `## Resolution` does not self-trigger.
- Add tests that ordinary prose such as `high availability`, `low risk`, and `medium-term` does not match.

### Wave 2 — Canonical Reconciliation Verification

1. In `verify_reconciliation.py`, attempt to import `yaml`.
2. Add `_canonical_note(value)` that returns `None` for non-strings and otherwise normalizes CRLF/CR to LF, strips, and collapses `\s+` to one ASCII space.
3. Update `parse_frontmatter` to use `yaml.safe_load` when available and return parsed values.
4. If PyYAML is unavailable, keep the current manual parser and print the required warning to stderr once. The fallback is intentionally less canonical; the warning is part of the operator contract.
5. Treat malformed YAML, non-mapping YAML, missing `resolution_note`, and non-string `resolution_note` as mismatches instead of crashes.

Verification:

- Add review-lens unittest coverage for escaped quotes, trailing whitespace, case mismatch, malformed YAML, missing note, non-mapping YAML, and non-string note.
- Run `python3 -m unittest discover docs/workflow/operations/codex-skills/review-lens`.

### Wave 3 — State Defaults, Flag Capture, And Repair Reuse

1. In `factory_state._default_workflow_state`, add `last_successful_checkpoint_flags: {}`.
2. In `load_workflow_state`, set the field to `{}` when missing or malformed.
3. In `factory_cmd_checkpoint.py`, add helpers to compute effective checkpoint flags after `--auto-context` and `--no-auto-context` are resolved.
4. Persist the replay-safe flag dict for `args.stage` only after a successful checkpoint result. Each entry includes `schema_version: 1`, `stage`, and `artifact_path` so repair does not replay flags across unrelated artifacts.
5. In the repair path, merge persisted stage flags with explicit repair args only when `schema_version == 1`, `stage` matches, `artifact_path` matches the current stage artifact, every key is on the allowlist, and every value is a replay-safe scalar. Explicit args win. Malformed or injected saved entries are ignored.
6. Print the reuse log line when any persisted flag is applied.
7. Never persist `use_existing_artifact`, unknown flags, or non-scalar values.

Verification:

- Add tests for load default, stage-keyed persistence, schema version mismatch, artifact path mismatch, malformed saved state, persisted flag reuse, explicit override, injected unsafe saved keys, and excluded `use_existing_artifact`.

### Wave 4 — Narrowed Plan Hash

1. Add `compute_narrowed_artifact_sha(path: Path) -> str` in `factory_state.py`.
2. Implement exact plan behavior:
   - one valid top-level Review Reconciliation section is removed
   - heading `## Review Reconciliation` allows extra spaces after hashes and trailing spaces
   - missing, duplicated, or fenced headings fall back to full-file hash
   - non-plan artifacts use the full-file hash
3. Update `normalized_artifact_hash` or its callers so review freshness checks use narrowed hashes for plan stage.
4. Add a legacy compatibility check for existing plan review files: if `narrowed_artifact_sha256` is missing or empty, treat `artifact_sha256` as the legacy full-file hash and allow one healthy pass when it equals the current full hash. New or resealed plan reviews must write the narrowed hash.
5. Ensure validation-only reseal and judge staleness checks use the same helper.

Verification:

- Add tests where only reconciliation content changes, other plan content changes, trailing whitespace changes, heading spacing changes, missing heading, typo heading, casing change, extra-word heading, duplicate heading, and fenced heading.

### Wave 5 — Auto-Context Defaults And Docs

1. Add `--auto-context` to checkpoint parser.
2. Fail clearly if `--auto-context` and `--no-auto-context` are both passed.
3. Resolve effective auto-context:
   - spec/tasks default true
   - plan/diff default false
   - `--auto-context` forces true
   - `--no-auto-context` forces false
4. Use the effective value in auto-context extraction.
5. Update checkpoint help text and `SKILL.md`.

Verification:

- Add parser/effective-default tests for all four stages and conflict behavior.

## Test Commands

- `python3 -m unittest discover docs/workflow/operations/codex-skills/feature-factory/scripts/tests`
- `python3 -m unittest discover docs/workflow/operations/codex-skills/review-lens`

## Residual Risks

### R1 — Markdown Stripping Is Conservative

The severity preprocessor may ignore a real finding if a reviewer puts it inside a blockquote or another ignored non-finding Markdown form.

**verification:** add explicit tests for blockquote examples, nested blockquote/table cases, and table severity cells; confirm ordinary bullet, numbered, heading, table, and paragraph-prefix findings still match.

### R2 — Persisted Flags Could Miss A Future Replay-Safe Option

The allowlist avoids dangerous flags but may omit a future useful flag.

**verification:** compare the persisted allowlist with `checkpoint --help` before merge and add a test proving `use_existing_artifact` is excluded.

### R3 — PyYAML Availability Differs By Environment

Local tests may run with PyYAML while another environment uses the fallback parser.

**verification:** add a test that patches the module's YAML binding to `None` and asserts the fallback warning plus byte-style behavior.

### R3a — Whitespace Normalization Can Hide Rare Differences

Canonical note comparison intentionally treats mixed whitespace runs as equivalent.

**verification:** add tests for tabs, CRLF, multiple spaces, and non-breaking spaces so the behavior is explicit rather than accidental.

### R4 — Review Reconciliation Is Treated As Metadata

Plan freshness ignores the whole `## Review Reconciliation` section. That section must remain workflow metadata, not the place for semantic implementation decisions.

**verification:** document this in the narrowed-hash helper docstring and keep architecture decisions in normal plan sections outside `## Review Reconciliation`.

### R5 — Reopen Depends On UPDATE_REVIEW Behavior

The plan relies on `update_review_resolution.py` supporting accepted-to-open transitions.

**verification:** add a test that writes an accepted review, invokes the same update path with `open`, and asserts frontmatter changes to `open`.

### R5a — Existing Plan Review Hashes Need Compatibility

Plan reviews created before narrowed hashes may store only the full artifact hash.

**verification:** add a test where an old review has only `artifact_sha256` matching the full plan hash and no narrowed hash; freshness should pass until a new narrowed-hash review is written.

### R6 — P0-Style Severity Markers Stay Out Of Scope

Current Feature Factory severity detection does not support `P0`, `SEV`, or repo-specific severity aliases. This feature keeps the canonical CRITICAL/HIGH/MEDIUM/LOW grammar instead of adding aliases.

**verification:** inspect existing `factory_review_specs.py` tests before merge and confirm no currently supported P0/SEV fixture is removed.

### R7 — Heading Formatting Drift Can Still Stale Plan Reviews

The canonical heading tolerates spacing drift but not casing changes or section renames.

**verification:** add tests for spacing drift and document that casing or renames fall back to the full hash.

### R8 — Post-Judge Spec Edits Were Needed

The spec judge panel failed due schema recursion, so final spec precision edits were made after judge-cap advance.

**verification:** status must show spec allowed by judge advance or healthy enough for plan checkpoint; if the runner blocks on post-judge edits, rerun the supported judge cap path rather than editing state by hand.
