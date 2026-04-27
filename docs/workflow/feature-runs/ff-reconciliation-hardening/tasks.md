# Tasks — FF Reconciliation Hardening

Single implementation pass with four reviewable slices. Each slice ends with `[CHECKPOINT]`; run the listed tests directly and check exit codes without piping.

## Slice 1 — Severity Detection And Auto-Reconcile `[CHECKPOINT]`

Estimated diff: 120-180 lines.

- [ ] T01: In `factory_review_specs.py`, update `_AUTO_ACCEPT_NOTE` to `No HIGH/MEDIUM/LOW/CRITICAL findings detected — auto-accepted`.
- [ ] T02: Replace the severity token with explicit case-insensitive `critical|high|medium|low` support while keeping strict finding grammar. Do not add P0/SEV aliases. Supported finding starts are bullet/numbered-list severity prefixes, bold severity prefixes, table severity cells, level-2-or-deeper severity headings, and explicit `Severity:` fields.
- [ ] T03: Add a scan-target helper that extracts `## Findings` sections when present. Accept extra spaces after hashes, such as `##  Findings`. If one Findings section exists, scan it until the next level-2 heading or EOF. If duplicate Findings sections exist, scan from the first Findings heading to EOF so a harmless first section cannot hide a later actionable section.
- [ ] T04: Add preprocessing that removes fenced code blocks, indented code blocks, blockquotes, HTML comments, inline code spans, markdown link text/title syntax, and image alt/title syntax. This is line/state-based content removal, not broad Markdown formatting stripping: preserve bold markers and markdown table rows.
- [ ] T05: Ensure `HIGHLY`, `medium-term`, `Low-level`, `high availability`, and `low risk` do not match.
- [ ] T06: Ensure markdown table severity cells like `| **CRITICAL** |` still match.
- [ ] T07: In `run_factory.py::command_auto_reconcile`, when an actionable finding is detected, force the review back to `open` through `UPDATE_REVIEW` with a short note regardless of its prior `resolution_status`.
- [ ] T08: Add tests in `scripts/tests/` for CRITICAL bullet, CRITICAL heading, LOW finding, table severity cell, ignored code/quote/comment/inline-code/link/image-alt examples, ordinary prose false positives, auto-accept note, and accepted-to-open transition.
- [ ] T08a: Add integration-style auto-reconcile tests: write accepted reviews with CRITICAL, HIGH, MEDIUM, and LOW findings in `## Findings`, run the auto-reconcile command path, assert each review frontmatter is reopened, and assert each review remains in `needs-review`.

Verification:

- `python3 -m unittest discover docs/workflow/operations/codex-skills/feature-factory/scripts/tests`

## Slice 2 — Canonical Reconciliation Verification `[CHECKPOINT]`

Estimated diff: 80-140 lines.

- [ ] T09: In `review-lens/scripts/verify_reconciliation.py`, import PyYAML when available and keep a fallback path when unavailable. The fallback path is byte-style/manual parsing only; it does not claim canonical YAML semantics and must print the required warning.
- [ ] T10: Add canonical note normalization: normalize Unicode to NFC, normalize CRLF/CR to LF, strip, and collapse Python Unicode regex `\s+` runs to one ASCII space. Keep case sensitivity.
- [ ] T11: Treat malformed YAML, non-mapping YAML, missing `resolution_note`, and non-string `resolution_note` as mismatches that do not crash verification.
- [ ] T12: Print the required fallback warning once when PyYAML is unavailable.
- [ ] T13: Add review-lens unittest coverage for escaped quotes, trailing whitespace, case mismatch, tabs, CRLF, multiple spaces, NBSP, NFC-equivalent characters, malformed YAML, missing note, non-mapping YAML, non-string note, and fallback warning.

Verification:

- `python3 -m unittest discover docs/workflow/operations/codex-skills/review-lens`

## Slice 3 — Checkpoint Flags And Narrowed Plan Hash `[CHECKPOINT]`

Estimated diff: 180-260 lines.

- [ ] T14: In `factory_state.py`, add `last_successful_checkpoint_flags` to default workflow state and load-time defaults. Malformed existing values become `{}`.
- [ ] T15: Add `compute_narrowed_artifact_sha(path: Path) -> str` with this complete contract:
  - non-plan artifacts use the full-file hash
  - plan artifacts remove exactly one valid top-level Review Reconciliation section
  - heading `## Review Reconciliation` allows extra spaces after hashes and trailing spaces after the heading text
  - missing, typo, casing-change, extra-word, duplicate, or fenced headings fall back to the full-file hash
  - duplicate means any second valid top-level Review Reconciliation heading anywhere in the plan; this prevents decoy-section spoofing
- [ ] T16: Update review freshness to use narrowed plan hashes. Add legacy compatibility: old plan reviews with empty/missing `narrowed_artifact_sha256` and matching full `artifact_sha256` stay healthy until resealed.
- [ ] T17: In `factory_cmd_checkpoint.py`, persist replay-safe flags after successful checkpoints using the current CLI shape. Persist the current `no_auto_context` boolean, `schema_version: 1`, `stage`, and `artifact_path`. Slice 4 will update this helper to persist the resolved stage-default value after `--auto-context` exists.
- [ ] T18: In the repair path, reuse persisted flags only when schema version, stage, artifact path, allowlist keys, and scalar values are valid. Explicit repair args win.
- [ ] T19: Ensure `use_existing_artifact`, `auto_context`, unknown keys, non-scalar values, and injected unsafe state are ignored.
- [ ] T20: Print `[repair] re-using flags from last successful checkpoint: ...` when persisted flags are applied.
- [ ] T21: Add tests for state defaults, stage-keyed flag persistence, schema mismatch, artifact path mismatch, malformed state, explicit override, excluded flags, injected unsafe keys, narrowed hash changes, reconciliation-only edits, heading spacing, missing/typo/casing/extra-word/duplicate/fenced headings, decoy-section spoofing, and legacy full-hash compatibility.

Verification:

- `python3 -m unittest discover docs/workflow/operations/codex-skills/feature-factory/scripts/tests`

## Slice 4 — Auto-Context Defaults And Docs `[CHECKPOINT]`

Estimated diff: 60-120 lines.

- [ ] T22: Add checkpoint `--auto-context`.
- [ ] T23: Fail clearly if `--auto-context` and `--no-auto-context` are both supplied.
- [ ] T24: Resolve defaults:
  - spec/tasks default auto-context on
  - plan/diff default auto-context off
  - `--auto-context` forces on
  - `--no-auto-context` forces off
- [ ] T25: Use the resolved value for artifact path extraction.
- [ ] T25a: Update the Slice 3 checkpoint-flag helper so persisted `no_auto_context` records the resolved stage-default value, not only the raw CLI flag.
- [ ] T26: Update checkpoint help text and `docs/workflow/operations/codex-skills/feature-factory/SKILL.md`.
- [ ] T27: Add tests for effective defaults on all four stages and the conflicting-flags error.

Verification:

- `python3 -m unittest discover docs/workflow/operations/codex-skills/feature-factory/scripts/tests`

## Final Verification

- [ ] T28: Run `python3 -m unittest discover docs/workflow/operations/codex-skills/feature-factory/scripts/tests`.
- [ ] T29: Run `python3 -m unittest discover docs/workflow/operations/codex-skills/review-lens`.
- [ ] T30: Run `python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py checkpoint --help` and inspect that `--auto-context` and `--no-auto-context` help are clear.
- [ ] T31: Run one focused end-to-end smoke through `auto-reconcile`: a clean prose review auto-accepts, CRITICAL/HIGH/MEDIUM/LOW reviews reopen or stay open, and plan reconciliation receives the expected terminal entry only for the clean review.
- [ ] T32: Run one focused narrowed-hash smoke: a change only inside the canonical `## Review Reconciliation` section keeps the narrowed hash stable, while a change outside that section changes the narrowed hash.

## Parallel Analysis

Potential parallel paths exist if split by write scope:

- `[P: docs/workflow/operations/codex-skills/review-lens/scripts/verify_reconciliation.py]` Slice 2 can be implemented independently from runner slices.
- `[P: docs/workflow/operations/codex-skills/feature-factory/scripts/factory_review_specs.py, docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py]` Slice 1 is separate from narrowed hash and flag persistence.

Because I am the current single orchestrator and implementer, I will execute sequentially unless a later implementation step gets blocked.
