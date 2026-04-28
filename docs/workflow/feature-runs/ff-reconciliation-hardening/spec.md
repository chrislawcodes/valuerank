# FF Reconciliation Hardening — Spec

**Feature branch**: `claude/ff-reconciliation-hardening`
**Slug**: `ff-reconciliation-hardening`
**Created**: 2026-04-27
**Status**: Draft spec, discovery complete

## Summary

This feature hardens the Feature Factory reconciliation path after PR #765 exposed a plan-stage lockout pattern. The runner let severe review findings look closed, compared reconciliation notes too literally, forgot checkpoint flags during repair, and added noisy auto-context to plan and diff review stages.

The fix is deliberately narrow. It changes only Feature Factory workflow tooling under `docs/workflow/operations/codex-skills/` and this run's workflow artifacts. It does not change product behavior under `cloud/`.

## Prior Art

- PR #744 broadened severity parsing after review findings escaped earlier auto-reconcile checks.
- PR #751 added 3-way reconcile behavior and made review resolution state more durable.
- PR #765 shipped token reliability work and produced the real feedback batch that motivated this follow-up.

## Problem

Operators need Feature Factory gates to fail loudly when reviews contain real findings. A no-action auto-accept must mean the runner actually checked the review body and found no actionable severity markers.

Four problems break that trust today:

1. Auto-reconcile can auto-accept reviews with `CRITICAL` findings because `CRITICAL` is not included in the severity regex set.
2. Auto-reconcile writes accepted boilerplate before body parsing, so a parsing miss leaves the file looking intentionally accepted.
3. Reconciliation verification compares plan notes to YAML frontmatter byte-for-byte, so escaped quotes and whitespace differences create false mismatch loops.
4. Repair reruns stale checkpoints without the flags that made the previous checkpoint succeed, and plan-only reconciliation edits can stale every plan review.
5. Plan and diff checkpoints default to auto-context even though those artifacts are already the source of truth and extra context often causes token or character overflow.

## Goals

- Make `CRITICAL` a first-class actionable severity everywhere auto-reconcile detects findings.
- Make review frontmatter start open and only become accepted after severity parsing succeeds.
- Compare reconciliation notes by parsed YAML string value with canonical whitespace.
- Persist successful checkpoint flags per stage and let repair reuse them unless explicitly overridden.
- Hash `plan.md` for review staleness after removing exactly one valid top-level section named Review Reconciliation.
- Default plan and diff checkpoints to no auto-context, while leaving spec and tasks behavior unchanged.
- Cover the changes with focused unit tests.

## Non-Goals

- No production ValueRank app behavior changes.
- No database schema, migration, seed, backfill, deployment, or credential changes.
- No rewrite of the full Feature Factory runner or review-lens architecture.
- No change to reviewer model selection or adversarial review policy.
- No repair of unrelated dirty worktrees or prior feature-run artifacts.
- No terminology migration outside workflow-runner docs.

## User Stories

### US1 — Severe Findings Stay Open

**As** a Feature Factory operator,
**I need** reviews with `CRITICAL` findings to stay open,
**So that** I do not skip the most important reviewer feedback.

Acceptance:

1. **Given** a review contains `- **CRITICAL**: unsafe auto-accept`, **when** auto-reconcile scans it, **then** the review remains open and appears in `needs-review`.
2. **Given** a review contains `## CRITICAL: unsafe auto-accept`, **when** auto-reconcile scans it, **then** the review remains open and appears in `needs-review`.
3. **Given** a review contains no HIGH, MEDIUM, LOW, or CRITICAL markers outside normal finding syntax, **when** auto-reconcile scans it, **then** it is accepted with the note `No HIGH/MEDIUM/LOW/CRITICAL findings detected — auto-accepted`.
4. **Given** a review contains a severity example inside a fenced code block, indented code block, blockquote, inline code span, or HTML comment, **when** auto-reconcile scans it, **then** that example does not count as an actionable finding.
5. **Given** a review contains a markdown table row with a first severity cell like `| **CRITICAL** |`, **when** auto-reconcile scans it, **then** that row counts as an actionable finding.

### US2 — Auto-Accept Is Earned After Parsing

**As** a Feature Factory operator,
**I need** generated review frontmatter to remain open by default,
**So that** a parser miss or interrupted scan cannot leave a review falsely accepted.

Acceptance:

1. **Given** a review file is initialized before parsing, **then** its `resolution_status` is `open`.
2. **Given** body parsing confirms no severity markers, **then** auto-reconcile changes `resolution_status` to `accepted`.
3. **Given** body parsing finds any severity marker, **then** auto-reconcile forces `resolution_status` to `open`, even if a prior run had marked the same file `accepted`.

### US3 — Reconciliation Notes Compare Semantically

**As** an operator reconciling review findings,
**I need** plan notes and review frontmatter notes to compare as parsed strings,
**So that** YAML escaping does not cause false mismatch loops.

Acceptance:

1. **Given** frontmatter has `resolution_note: "fixed \\\"flapping\\\" note"` and the plan says `fixed "flapping" note`, **when** reconciliation verification runs, **then** the notes match.
2. **Given** one note has extra internal or trailing whitespace, **when** verification runs, **then** the notes match after whitespace collapse.
3. **Given** notes differ only by letter case, **when** verification runs, **then** the notes do not match.
4. **Given** PyYAML is not importable, **when** verification runs, **then** it falls back to current byte comparison and prints a warning.
5. **Given** frontmatter is malformed, missing `resolution_note`, parses to a non-mapping YAML value, or parses `resolution_note` as a non-string value such as `true`, `3`, or `null`, **when** verification runs, **then** it reports a verification mismatch instead of crashing.

### US4 — Repair Reuses Successful Checkpoint Flags

**As** an operator repairing stale reviews,
**I need** repair to reuse the flags from the last successful checkpoint for that stage,
**So that** a review that needed `--no-auto-context` or larger character limits does not fail again during repair.

Acceptance:

1. **Given** a plan checkpoint succeeds with `--no-auto-context --max-artifact-chars 200000`, **when** repair regenerates plan reviews with no explicit override, **then** it passes those same flags to the regeneration call.
2. **Given** the operator passes explicit repair flags, **when** repair regenerates reviews, **then** the explicit flags override persisted flags.
3. **Given** no successful flags exist for a stage, **when** repair runs, **then** existing defaults apply.
4. **Given** the state file is loaded from an older run, **when** the runner reads it, **then** `last_successful_checkpoint_flags` exists as an empty top-level dict without changing existing schemas.
5. **Given** a tasks checkpoint succeeds after a plan checkpoint, **when** state is read, **then** the field is keyed by stage and both `plan` and `tasks` entries remain separate.

### US5 — Reconciliation-Only Plan Edits Do Not Stale Reviews

**As** an operator updating the plan reconciliation section,
**I need** those edits not to mark every plan review stale,
**So that** closing findings does not force a full new review round.

Acceptance:

1. **Given** only `## Review Reconciliation` changes in `plan.md`, **when** review health is checked, **then** plan reviews remain healthy.
2. **Given** any other plan section changes, **when** review health is checked, **then** plan reviews become stale.
3. **Given** only trailing whitespace inside the reconciliation section changes, **when** the narrowed hash is computed, **then** it stays stable.
4. **Given** `## Review Reconciliation` is missing, duplicated, or appears inside a fenced code block, **when** the narrowed hash is computed, **then** the helper uses the full file hash and treats later edits as normal plan edits.

### US6 — Plan And Diff Avoid Auto-Context By Default

**As** a Feature Factory operator,
**I need** plan and diff checkpoints to skip automatic context by default,
**So that** the artifact remains the main review source and character limits are less likely to fail.

Acceptance:

1. **Given** `checkpoint --stage plan` runs without context flags, **then** auto-context is disabled.
2. **Given** `checkpoint --stage diff` runs without context flags, **then** auto-context is disabled.
3. **Given** `checkpoint --stage spec` or `checkpoint --stage tasks` runs without context flags, **then** auto-context remains enabled.
4. **Given** an operator passes `--auto-context`, **then** auto-context is enabled even for plan or diff.
5. **Given** an operator passes `--no-auto-context`, **then** auto-context is disabled for any stage.

## Functional Requirements

### FR-001 — Include CRITICAL In Severity Regexes

The actionable-severity regex set in `factory_review_specs.py` must include `CRITICAL` anywhere it currently includes HIGH, MEDIUM, or LOW. Matching is case-insensitive and must use word or delimiter boundaries so words like `HIGHLY`, `medium-term`, and `Low-level` do not count as severity markers. Heading matching must require a colon or end-of-line after the severity. Severity examples inside fenced code blocks, indented code blocks, blockquotes, inline code spans, and HTML comments must be ignored. Markdown table rows with a first severity cell such as `| **CRITICAL** |` must be treated as actionable findings.

### FR-002 — Open First, Accept After Scan

Any generated or auto-reconcile-prepared review frontmatter must default to `resolution_status: "open"`. Auto-reconcile may set `accepted` only after `detect_actionable_findings` returns false for the body. If a rescan finds severity markers in a review that was previously accepted, auto-reconcile must set it back to `open`.

### FR-003 — Explicit Auto-Accept Note

The auto-accept note must say exactly: `No HIGH/MEDIUM/LOW/CRITICAL findings detected — auto-accepted`.

### FR-004 — Canonical Reconciliation Note Compare

`verify_reconciliation.py` must parse review YAML frontmatter with `yaml.safe_load` when PyYAML is available. If YAML parsing fails, returns a non-mapping value, omits `resolution_note`, or returns a non-string `resolution_note`, verification must report a mismatch for that review and continue checking other reviews. It must compare parsed string `resolution_note` values against plan reconciliation notes after:

- stripping leading and trailing whitespace
- normalizing CRLF/CR newlines to LF, then collapsing internal Unicode whitespace runs matched by Python `\s+` to a single ASCII space
- preserving case sensitivity

The comparison does not normalize zero-width or other invisible format characters; those remain meaningful differences and should surface as mismatches.

### FR-005 — YAML Fallback Warning

If PyYAML cannot be imported, verification must use current byte-style behavior and print a warning to stderr: `yaml not available; falling back to byte comparison; YAML escaping mismatches may surface as note mismatches`.

### FR-006 — Persist Last Successful Checkpoint Flags

Workflow state must gain a top-level `last_successful_checkpoint_flags: {}` field keyed by stage:

```json
{
  "spec": {"no_auto_context": true},
  "plan": {"max_artifact_chars": 200000}
}
```

On load, if the field is missing, null, or not an object, the runner treats it as `{}`. On every successful checkpoint, the runner stores the stage's effective flags in that stage's slot, including only scalar, replay-safe flags:

- `no_auto_context`
- `max_artifact_chars`
- `max_context_chars`
- `max_total_chars`
- `gemini_timeout_seconds`
- `gemini_retries`
- `repair_timeout_seconds`
- `allow_large_diff_rerun`
- `keep_intermediates`

Do not persist `auto_context` as a separate stored flag; persist the effective `no_auto_context` boolean after resolving defaults and overrides. Do not persist unknown flags automatically. Do not persist non-serializable values. Do not persist `use_existing_artifact`, because replaying that flag during repair can preserve a stale artifact instead of regenerating reviews.

### FR-007 — Repair Reuses Flags

When repair regenerates a stage checkpoint, it must merge persisted flags for that same stage with explicit repair arguments. Explicit repair arguments win. If the saved stage entry is missing, null, not an object, or contains non-scalar values, repair ignores the malformed entry and uses normal defaults plus explicit flags. Repair must print a log line naming the reused flags, for example: `[repair] re-using flags from last successful checkpoint: --no-auto-context --max-artifact-chars 200000`.

### FR-008 — Plan Narrowed Artifact Hash

`factory_state.compute_narrowed_artifact_sha(path: Path) -> str` must hash plan content with exactly one top-level Review Reconciliation section removed. The canonical heading is `## Review Reconciliation`; extra spaces after the hashes are allowed, and trailing spaces after the heading text are ignored. The removed section starts at that heading and ends at the next top-level `## ` heading or end of file. If the heading is missing, duplicated, or appears inside a fenced code block, the narrowed hash must equal the full-file hash. For all non-plan artifacts, narrowed hash equals the full-file hash. The helper must normalize away trailing whitespace in the removed reconciliation block.

### FR-009 — Use Narrowed Hash For Review Freshness

Review freshness checks must compare against the narrowed artifact hash where applicable. Plan review files may still store the full artifact hash for audit, but stale/healthy decisions must use the narrowed hash.

### FR-010 — Plan/Diff Auto-Context Defaults

`checkpoint --stage plan` and `checkpoint --stage diff` must default to no auto-context. `checkpoint --stage spec` and `checkpoint --stage tasks` must keep auto-context enabled by default.

### FR-011 — Auto-Context Override

Checkpoint CLI must add `--auto-context`. It forces auto-context on and is mutually clear in behavior with `--no-auto-context`; if both are supplied, the command must fail with a clear parser or validation error.

### FR-012 — Documentation Update

`docs/workflow/operations/codex-skills/feature-factory/SKILL.md` must mention that plan and diff default to no auto-context and that `--auto-context` can override it.

## Implementation Scope

Expected files:

- `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_review_specs.py`
- `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_state.py`
- `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_checkpoint.py`
- `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_status.py`
- `docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py`
- `docs/workflow/operations/codex-skills/review-lens/scripts/verify_reconciliation.py`
- focused tests under `docs/workflow/operations/codex-skills/feature-factory/scripts/tests/`
- focused review-lens tests if an existing test location is present; otherwise add a small unittest file next to the script
- `docs/workflow/operations/codex-skills/feature-factory/SKILL.md`

## Test Plan

- Run `python3 -m unittest discover docs/workflow/operations/codex-skills/feature-factory/scripts/tests`.
- Run `python3 -m unittest discover docs/workflow/operations/codex-skills/review-lens`.
- Add tests for CRITICAL bullet and heading detection.
- Add tests that severity examples inside fenced code blocks, indented code blocks, blockquotes, inline code spans, and HTML comments are ignored.
- Add a test that markdown table severity cells are actionable.
- Add tests for pure prose auto-accept with the new note.
- Add tests for canonical reconciliation-note compare: escaped quotes, trailing whitespace, case mismatch, malformed YAML, missing note, non-mapping YAML, and non-string `resolution_note`.
- Add tests for state default loading and checkpoint flag persistence.
- Add tests for repair flag reuse, explicit override, malformed saved stage entries, and exclusion of `use_existing_artifact`.
- Add tests for narrowed plan hash behavior, including missing, duplicated, spaced, and fenced reconciliation headings.
- Add tests for plan/diff auto-context defaults and `--auto-context` override.

## Residual Risks

### R1 — Severity Formats Can Still Evolve

Reviewers may invent a new severity format that no regex catches.

**verification:** add regression fixtures for every severity format observed in PR #765 plus the CRITICAL bullet and heading cases from this spec; rerun the Feature Factory unittest suite before merge.

### R2 — Repair Flag Merge May Miss A Rare Flag

The persisted flag list may omit a less common checkpoint option.

**verification:** unit-test the flags named in FR-006 and manually inspect `checkpoint --help` before merge for any flag that affects reviewer payload size or context selection.

### R3 — Narrowed Plan Hash Is Section-Heading Dependent

If the reconciliation heading is renamed, plan reconciliation edits could stale reviews again.

**verification:** add tests for the exact `## Review Reconciliation` heading and document the heading contract in the helper docstring.

### R4 — PyYAML Fallback Is Less Capable

If PyYAML is unavailable, escaped quotes can still mismatch.

**verification:** run the new canonical-note tests in the local environment; if PyYAML is absent, confirm the stderr fallback warning appears and document the limitation in test output.

## Open Decisions

None. The prompt defines the branch, slug, scope, acceptance criteria, and delivery path.
