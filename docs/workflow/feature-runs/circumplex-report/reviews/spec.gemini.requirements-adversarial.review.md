---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/circumplex-report/spec.md"
artifact_sha256: "11602da87282c82e5a067e5e917e8bea71343b48f1206e89623dbe24e29abb7f"
repo_root: "."
git_head_sha: "2a61705a6965451e85ef5426ef3dffad0fabbbd7"
git_base_ref: "origin/claude/consistency-signature-dropdown"
git_base_sha: "2a61705a6965451e85ef5426ef3dffad0fabbbd7"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH (VALUE_LABELS example mismatch — spec listed labels that don't exist in the actual map): FR-018 and FR-021 updated to list the actual label entries (Self-Direction, Stimulation, Hedonism, Achievement, Power, Security, Conformity, Tradition, Benevolence, Universalism) and require reading from the map at render time. HIGH (dependency on temporary domainAnalysisData.ts file): FR-021 scope note added distinguishing stable exports (VALUE_LABELS et al.) from the temporary DOMAIN_ANALYSIS_MODELS static snapshot; spec depends only on stable exports. MEDIUM (filtering logic contradiction — totalHiddenModels implied server-side computation): FR-005 revised to explicitly compute totalHiddenModels client-side using existing llmModels query; field removed from server response shape in Key Entities. MEDIUM (sparse-data guardrail too weak): FR-011b tightened from '<3 determinate cells' to '<6 of 9 determinate cells OR any cell <20 trials' with rationale. Residual risks (resolver performance, URL state complexity) noted in spec Residual Risks section and deferred to plan phase."
raw_output_path: "docs/workflow/feature-runs/circumplex-report/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "Coverage full at spec length after round-3 addressed all findings."
---

# Review: spec requirements-adversarial

## Findings

### 1. HIGH: Inconsistent Value Labels
**Finding:** The spec mandates using a short-label set from an existing file but provides examples that contradict the file's contents, effectively inventing a new label set while forbidding it. `FR-021` requires using the `VALUE_LABELS` map from `cloud/apps/web/src/data/domainAnalysisData.ts` for tight spaces and explicitly states "This spec SHOULD NOT introduce a competing short-label set." However, the examples it provides (e.g., "Universalism (Nature)", "Power/Dominance") do not match the actual values in the `VALUE_LABELS` map (e.g., `'Universalism'`, `'Power'`). This creates a direct conflict where the implementation cannot satisfy the requirement without modifying a file the spec treats as a fixed dependency, thereby violating the spirit of the rule.

**Evidence:** [CODE-CONFIRMED] The file `domainAnalysisData.ts` contains `VALUE_LABELS` which maps `Universalism_Nature` to `'Universalism'` and `Power_Dominance` to `'Power'`. The spec's examples in `FR-021` are different.

### 2. HIGH: Dependency on Temporary Data Source
**Finding:** The spec builds a foundational requirement on a file that is explicitly marked as a temporary, static snapshot. `FR-002` and `FR-021` designate `cloud/apps/web/src/data/domainAnalysisData.ts` as the canonical source for the 10-value list and their labels. However, a comment at the top of this file states: `// Static snapshot... TODO: Replace with domain-scoped API-backed data.` By hard-coding a dependency on this file, the new feature becomes vulnerable to breakage when the `TODO` is eventually addressed. The spec does not account for this planned deprecation.

**Evidence:** [CODE-CONFIRMED] The header comment in `domainAnalysisData.ts` directly states its temporary nature and includes a `TODO` for its replacement.

### 3. MEDIUM: Ambiguous Filtering Logic
**Finding:** The spec is contradictory regarding which layer is responsible for filtering models and counting those hidden. `FR-005` states, "The client is the single source of truth for applying the eligibility filter". However, the `CircumplexAnalysisResult` entity in the `Key Entities` section includes a `totalHiddenModels` field, implying the resolver performs this calculation. For the resolver to calculate this count accurately, it would need to fetch and process data for all models, not just those requested by the client, which is inefficient. This indicates a confused and poorly defined boundary of responsibility between the client and server for eligibility logic.

**Evidence:** [UNVERIFIED] While the full backend schema isn't provided, the logical contradiction exists entirely within the `spec.md` file between `FR-005` and the definition of the `CircumplexAnalysisResult` entity.

### 4. MEDIUM: Statistically Weak Handling of Sparse Data
**Finding:** The spec's criteria for data inclusion are statistically weak and may lead to unstable, misleading results. `FR-011b` only excludes a value from correlation analysis if it has "fewer than 3 determinate pair cells." A 9-element vector with only 3 data points is insufficient for a stable Pearson correlation calculation. The spec lacks a more robust guardrail, such as requiring a minimum number of *valid pairs* for a value's profile to be included in the correlation matrix, or at least flagging the statistical uncertainty of results derived from such sparse data.

**Evidence:** [UNVERIFIED] This is a flaw in the statistical methodology described in the spec, not something refutable by the provided code context.

## Residual Risks

### 1. Unspecified Resolver Performance Risk
The spec, in `FR-001`, explicitly defers the critical implementation decision for how the `circumplexAnalysis` resolver will source its data. The choice between querying raw transcripts (potentially slow and expensive) and creating a new materialized aggregate view (a significant backend dependency) is a major architectural decision. Punting this to the "plan phase" introduces significant risk to the feature's performance and delivery timeline.

### 2. URL State Complexity
The requirement to preserve UI state in URL parameters (`US-2`, `FR-016`, `Edge Cases`) for features like selected models and methodology visibility can lead to excessively long and complex URLs. This creates a poor user experience for sharing links and introduces technical risk, as long URLs can be truncated by some clients or hit server limits.

## Token Stats

- total_input=30441
- total_output=987
- total_tokens=35081
- `gemini-2.5-pro`: input=30441, output=987, total=35081

## Resolution
- status: accepted
- note: HIGH (VALUE_LABELS example mismatch — spec listed labels that don't exist in the actual map): FR-018 and FR-021 updated to list the actual label entries (Self-Direction, Stimulation, Hedonism, Achievement, Power, Security, Conformity, Tradition, Benevolence, Universalism) and require reading from the map at render time. HIGH (dependency on temporary domainAnalysisData.ts file): FR-021 scope note added distinguishing stable exports (VALUE_LABELS et al.) from the temporary DOMAIN_ANALYSIS_MODELS static snapshot; spec depends only on stable exports. MEDIUM (filtering logic contradiction — totalHiddenModels implied server-side computation): FR-005 revised to explicitly compute totalHiddenModels client-side using existing llmModels query; field removed from server response shape in Key Entities. MEDIUM (sparse-data guardrail too weak): FR-011b tightened from '<3 determinate cells' to '<6 of 9 determinate cells OR any cell <20 trials' with rationale. Residual risks (resolver performance, URL state complexity) noted in spec Residual Risks section and deferred to plan phase.