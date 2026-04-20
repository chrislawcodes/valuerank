---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/circumplex-report/spec.md"
artifact_sha256: "11602da87282c82e5a067e5e917e8bea71343b48f1206e89623dbe24e29abb7f"
repo_root: "."
git_head_sha: "2a61705a6965451e85ef5426ef3dffad0fabbbd7"
git_base_ref: "origin/claude/consistency-signature-dropdown"
git_base_sha: "2a61705a6965451e85ef5426ef3dffad0fabbbd7"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM (providerName missing from CircumplexResult entity): added to Key Entities. MEDIUM (per-pair coverage not handled): FR-011b added — per-pair trial counts returned by resolver, UI flags cells with trials<20, values with insufficient determinate pair coverage (<6 of 9 cells, or any cell <20 trials) excluded from correlation/MDS and surfaced in excludedValues. LOW (stable sort order): FR-011a specifies alphabetical by modelLabel ascending. LOW (VALUE_LABELS example drift): FR-018 and FR-021 now reference the shared map authoritatively with the exact label strings. LOW (error state undefined): FR-018a added requiring reuse of ErrorMessage and Loading components with distinct 'no data for signature' vs 'query failed' states. Round-3 Codex runner call failed due to external Codex API rate limits; round-2 Codex run completed and its findings are the basis of these accepted resolutions."
raw_output_path: ""
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "Coverage reconciled across completed round-1 and round-2 review rounds."
---

# Review: spec edge-cases-adversarial

## Findings

**Round-2 findings (all addressed in current spec):**

1. **MEDIUM**: FR-018 requires showing model provider, but CircumplexResult did not include providerName.
   - Resolution: providerName added to Key Entities, sourced from LlmModel.providerName.

2. **MEDIUM**: Eligibility was per-value only; pair-level missing data not handled.
   - Resolution: FR-011b requires per-pair flagging (trials<20), value exclusion when <6 determinate cells or any cell <20 trials, excludedValues in payload.

3. **LOW**: FR-011a specified "first eligible model" but no stable sort order.
   - Resolution: FR-011a now specifies alphabetical-by-modelLabel ascending.

4. **LOW**: VALUE_LABELS example drift — examples in spec didn't match map entries.
   - Resolution: FR-018 and FR-021 now name actual map entries and require reading labels at render time.

5. **LOW**: Error state not defined.
   - Resolution: FR-018a added requiring ErrorMessage and Loading component reuse with distinct 'no data' vs 'query failed' states.

## Residual Risks

- Circumplex statistic still exploratory, not validated psychometrics. (Acknowledged in spec Residual Risks; methodology section to frame as directional.)
- Eligible-but-sparse models may still produce noisy results. (Acknowledged; low-threshold default of 5 is a product-owner choice.)

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM (providerName missing from CircumplexResult entity): added to Key Entities. MEDIUM (per-pair coverage not handled): FR-011b added — per-pair trial counts returned by resolver, UI flags cells with trials<20, values with insufficient determinate pair coverage (<6 of 9 cells, or any cell <20 trials) excluded from correlation/MDS and surfaced in excludedValues. LOW (stable sort order): FR-011a specifies alphabetical by modelLabel ascending. LOW (VALUE_LABELS example drift): FR-018 and FR-021 now reference the shared map authoritatively with the exact label strings. LOW (error state undefined): FR-018a added requiring reuse of ErrorMessage and Loading components with distinct 'no data for signature' vs 'query failed' states. Round-3 Codex runner call failed due to external Codex API rate limits; round-2 Codex run completed and its findings are the basis of these accepted resolutions.
