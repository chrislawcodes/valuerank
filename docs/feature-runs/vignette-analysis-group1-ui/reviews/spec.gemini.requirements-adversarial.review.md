---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/vignette-analysis-group1-ui/spec.md"
artifact_sha256: "ae3b480012162fa284f1fbfb541a27451a6ae1491ee190de0f6df1e3e0fc6cec"
repo_root: "."
git_head_sha: "b3095605580880e5884d3d66c6b47cfaa3c8d9e8"
git_base_ref: "origin/main"
git_base_sha: "445c9ab175a57ca54a0094c51078af66a1f61bd0"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The spec now clearly states the surface scope, canonical wording examples, and non-goals for the group 1 presentation-only transcript surfaces."
raw_output_path: "docs/feature-runs/vignette-analysis-group1-ui/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

1.  **Critical Ambiguity in Mixed-Data Handling:** The spec requires that "Mixed or legacy-only data stays in legacy display mode." This is the most significant flaw. It fails to define the boundary of a "surface" (is it a page, a tab, a component?) and the precise trigger for this fallback. For example, if a report contains 99 V2-backed transcripts and 1 legacy transcript, must the *entire page* revert to legacy mode? This "all-or-nothing" approach could create a confusing user experience where the intended new UI is almost never seen. The logic to detect if a dataset is "fully V2-backed" is not defined and appears to be a missing prerequisite.

2.  **Undefined "Score-First" Language:** The spec repeatedly tasks the implementer with removing "score-first language" but provides no concrete examples of what this is or what it should be replaced with. This subjectivity makes the scope of work impossible to measure and creates a high risk that the implementer's interpretation will not match the product owner's intent. The acceptance criteria are untestable without a clear definition or a list of specific text changes.

3.  **Incomplete Definition of "Canonical Decision Wording":** The user-facing behavior lists `Strongly favors X`, `Somewhat favors X`, or `Neutral` as examples, but this is not an exhaustive list. It omits negative cases (e.g., `Strongly disfavors X`), ambivalent cases (e.g., `Favors both`), or cases where no decision could be made. This forces the developer to invent categories, leading to inconsistency.

4.  **Assumptions About Data Contracts:** The spec assumes a boolean flag exists to trigger the "deterministic/fallback" badge but never names the field. It also assumes a clear, reliable field exists to differentiate "V2-backed" transcripts from legacy ones. While likely true, the spec is brittle because it doesn't reference the specific data model properties these UI behaviors depend on.

5.  **Potentially Incomplete Scope of "Clutter":** The spec mandates removing `token columns`, `scenario columns`, or `normalization badges` from transcript tables. This list may not be exhaustive. Other non-essential columns could exist, and by only listing these, the spec fails to establish a clear principle for what constitutes "clutter," risking that other unnecessary columns are left behind.

## Residual Risks

1.  **Risk of Unintended Legacy UI Breakage:** The requirement to keep "existing legacy-only behavior stays intact" is a passive goal that is difficult to verify. Without a comprehensive suite of tests specifically for legacy-only views, changes made to shared components (`TranscriptList`, `TranscriptRow`, etc.) to support the new V2 view could easily introduce regressions in the legacy presentation that go undetected.

2.  **Poor User Experience from "All-or-Nothing" Fallback:** Even if the mixed-data rule is clarified, the decision to fall back to a legacy view for an entire surface is a residual risk. Users will be frustrated if a single legacy item in a large dataset prevents them from using the improved V2 analysis view. The spec does not consider alternative designs, such as rendering rows differently within the same table or clearly badging the legacy rows while keeping the rest of the UI in V2 mode.

3.  **"Copy Cleanup" Scope Creep:** The vaguely defined task to perform "copy and label cleanup" remains a risk even if a few examples of "score-first" language are provided. An implementer may interpret this as a license for broader copyedits, leading to unrequested changes, or they may interpret it too narrowly, leaving inconsistent text behind. This task should be defined by an explicit list of all text to be changed.

## Token Stats

- total_input=1596
- total_output=799
- total_tokens=15603
- `gemini-2.5-pro`: input=1596, output=799, total=15603

## Resolution
- status: accepted
- note: The spec now clearly states the surface scope, canonical wording examples, and non-goals for the group 1 presentation-only transcript surfaces.
