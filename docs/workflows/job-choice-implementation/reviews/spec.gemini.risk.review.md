---
reviewer: "gemini"
lens: "risk"
stage: "spec"
artifact_path: "/Users/chrislaw/valuerank/docs/workflows/job-choice-implementation/spec.md"
artifact_sha256: "c8c5eb353c701e9cb58ad89381ce04268df4b5a6f9da38be5d54bd41f853b996"
repo_root: "/Users/chrislaw/valuerank"
git_head_sha: "35da80309f01f3cfe549e3aa0ac0f8cfd6ac6a25"
git_base_ref: "origin/main"
git_base_sha: "3aa0478c59137277c911bea998522cfd86ec9934"
resolution_status: "open"
resolution_note: ""
raw_output_path: "/Users/chrislaw/valuerank/docs/workflows/job-choice-implementation/reviews/spec.gemini.risk.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec risk

## Findings

1.  **Parser Accuracy and Rollout Gate:** The spec establishes a 95% fallback parser agreement target and states that ambiguous or unparseable transcripts exceeding 3% will block rollout. This indicates a critical dependency on parser reliability and a defined gate for progress.
2.  **Data Integrity via Parser Handling:** The spec explicitly aims to prevent "parser failures silently corrupt[ing] downstream analysis," highlighting data integrity as a key concern.
3.  **Tooling Semantic Coupling:** The current assumptions and order-effect tooling are "tightly coupled to legacy semantics," presenting a significant risk for compatibility with the new `Job Choice` methodology.
4.  **Impact on Reuse Functionality:** There is a stated risk that "same-signature reuse will be damaged if pilot launches use a test-only run type."
5.  **Abstraction of Value Statements:** The removal of job titles, while preserving descriptions, carries a risk that "some value statements may become too abstract."
6.  **Clarity of UI and Launch Options:** The need to label remaining legacy pages as `Old V1` and to provide clearer distinctions for `Start Paired Batch` versus `Start Ad Hoc Batch` launches indicates potential for user confusion if not handled precisely.

## Residual Risks

1.  **Misleading Metrics due to Data Dropout:** A primary residual risk is that parser-derived scores may appear cleaner than adjudicated scores because ambiguous transcripts are dropped out. This could lead to a misleading perception of accuracy if not carefully managed and interpreted.
2.  **Compromised Tooling for New Methodology:** Despite the identification of tooling coupling, the "tightly coupled" nature to legacy semantics presents a significant residual risk that existing tools may not function correctly or may require substantial rework for the new `Job Choice` methodology, potentially delaying or complicating implementation.
3.  **Damage to Same-Signature Reuse:** The risk that "same-signature reuse will be damaged" if pilot launches use a test-only run type remains a residual concern, potentially impacting core reuse efficiency and requiring careful management of pilot launch configurations.
4.  **Degradation of Value Statement Nuance:** The removal of job titles, even with preserved descriptions, carries a residual risk of making value statements too abstract, thereby weakening their concrete meaning and potentially impacting the nuance and accuracy of downstream analysis.
5.  **Undetected Data Corruption:** The risk of parser failures silently corrupting downstream analysis persists as a residual concern if robust error handling, validation, and monitoring are not meticulously implemented and maintained.
6.  **User Confusion During Staged Migration:** If pages retaining the current system are not clearly labeled `Old V1` or if launch distinctions are not immediately intuitive, users may experience confusion during the staged migration process.

## Token Stats

- total_input=12648
- total_output=573
- total_tokens=16849
- `gemini-2.5-flash-lite`: input=12648, output=573, total=16849

## Resolution
- status: open
- note: