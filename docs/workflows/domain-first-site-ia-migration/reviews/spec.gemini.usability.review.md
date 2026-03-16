---
reviewer: gemini
lens: usability
stage: spec
artifact_path: docs/workflows/domain-first-site-ia-migration/spec.md
artifact_sha256: 8f9e66e3a64f5905cb826a659a7cb0e8b280453f072d3572c527c3ece77067d0
repo_root: .
git_head_sha: ad1056848eaf99799e005d2b73be7a3e1f9287f2
git_base_ref: origin/main
git_base_sha: ad1056848eaf99799e005d2b73be7a3e1f9287f2
generation_method: gemini-cli-direct
resolution_status: open
resolution_note: "User-requested usability review; findings not yet reconciled."
raw_output_path: ""
---

# Review: spec usability

## Findings

*   **Diagnostic Scope Ambiguity:** While the spec mandates scope-labeled entry points for diagnostics, the actual labels and their placement are critical. If they are not immediately obvious and distinct (e.g., "View diagnostics for this specific run" vs. "View diagnostic history for this vignette"), users may struggle to understand the data context. The "three generic `Diagnostics` entry points" must be avoided in practice.
*   **Unclear "Next Steps" on Overview/Home:** The `Home` and `Domain Overview` surfaces must provide "exact next actions" and "direct deep links." If these links are not precise or if "needs-attention items" are not clearly actionable, users returning after a break will be disoriented. The success of the "resume work" behavior hinges on this clarity.
*   **Configuration Override Visibility:** The distinction between `Setup` defaults and `Vignette` overrides is fundamental. While the spec states it will be explicit, the UI must visually make inheritance and override states instantly understandable at a glance to prevent configuration errors. Users must always be able to answer: "what is the domain default?", "which vignettes inherit it?", and "which vignettes override it?".
*   **"Findings" State Transition Clarity:** The "explicit non-auditable state" message for `Findings` is a good start. However, the transition to auditable state relies on users completing "production Domain Evaluation with auditable snapshots." If this transition isn't clearly signaled or if users attempt to act on non-auditable data due to subtle UI cues, it could lead to misinterpretation and unfounded claims.

## Residual Risks

*   **Legacy Habit Friction:** The deprecation of `Experiment` as a first-class model and reliance on compatibility paths may still create friction for long-term users accustomed to older workflows. The effectiveness of redirects and sunset rules for legacy routes will matter.
*   **Cost Estimate Confidence Impact:** The "confidence label" and "fallback warning" for cost estimates are good additions. However, if the confidence is consistently low or the warnings are ignored, users might make launch decisions based on unreliable cost data.
*   **Deep Link Robustness:** The spec relies heavily on deep links from recommendation cards, diagnostic shortcuts, and editors. Any broken links will directly affect usability and the "resume work" flow.
*   **"Run" vs. "Domain Evaluation" Understanding:** The terms are defined, but the UI still needs to consistently distinguish vignette-scoped `Run` records from domain-wide `Domain Evaluation` so users don’t lose track of scope and status.

## Resolution
- status: open
- note: User-requested usability review; findings not yet reconciled.
