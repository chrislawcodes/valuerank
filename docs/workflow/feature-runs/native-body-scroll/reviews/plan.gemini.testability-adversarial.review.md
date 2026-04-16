---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/native-body-scroll/plan.md"
artifact_sha256: "1e68d19888b3818780fe6bac52687a9a625bc106c31196eb0884153d60fdd267"
repo_root: "."
git_head_sha: "f08458578d016a539c10d9e5a66642e94f706aa1"
git_base_ref: "origin/main"
git_base_sha: "abe39ae0d4893c5db5b2ece4889efdfd4cbc4d91"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH (no test plan): deferred — no visual test infra exists; tasks.md has manual smoke test covering key scenarios. MEDIUM (drawer z-index): rejected — drawer already z-50, above z-10 sticky. MEDIUM (layout stretching non-h-full): rejected — same behavior as original h-screen+flex-1. LOW (sticky disabled by overflow): rejected — no overflow on any ancestor. LOW (cross-browser): deferred — internal tool, modern browser support."
raw_output_path: "docs/workflow/feature-runs/native-body-scroll/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding |
| :--- | :--- |
| **HIGH** | **No Verification or Test Plan** |
| | The plan omits any strategy for testing or verification. A fundamental layout change from a contained-scroll to a body-scroll model affects every page. The manual checks mentioned for `h-full` pages are insufficient. **Omitted Cases:** Lack of a test plan means visual regressions on other pages, mobile/responsive views, and different browsers are likely to be missed. **Testing Gaps:** Specific test cases are needed for: <br> 1. Visual regression tests (e.g., screenshot diffs) for key pages. <br> 2. Unit tests for the simplified `useHorizontalScrollOnWheel` hook, especially its edge-case logic for preventing scroll swallowing. <br> 3. Interaction tests for the `ModelValueDetailDrawer` to confirm it appears correctly over all other UI elements and that scroll locking behaves as expected. |
| **MEDIUM** | **Potential `z-index` Conflict with Drawer** |
| | The plan assigns `z-10` to both `Header.tsx` and `NavTabs.tsx`. However, it does not specify the `z-index` for `ModelValueDetailDrawer.tsx`. For the drawer to appear correctly on top of the newly sticky header and nav, it must have a `z-index` greater than 10. **Hidden Flaw:** This oversight creates a high probability of a visual bug where the drawer opens *underneath* the header or navigation, making it partially unusable. |
| **MEDIUM** | **[UNVERIFIED] Risk of Unintended Layout Stretching on Non-`h-full` Pages** |
| | The plan verifies that pages using `h-full` will continue to work correctly with `<main class="flex-1">`. However, it makes a **Weak Assumption** by not considering the impact on pages that *do not* use `h-full`. Previously, content would be contained within a fixed-height, scrolling `<main>`. Now, `<main>` can grow with its content, which could cause unintended vertical stretching or layout breaks on pages that were implicitly relying on the old constrained behavior. |
| **LOW** | **[UNVERIFIED] Fragility of `sticky` Positioning** |
| | The plan relies on `position: sticky` for the header and nav. This CSS property can be disabled if any ancestor element has an `overflow` property set to `hidden`, `scroll`, `clip`, or `auto`. The plan assumes the immediate parent structure is safe. **Hidden Flaw:** It's possible a higher-level wrapper component in the application's component tree has a conflicting `overflow` property, which would break the sticky behavior entirely. This is a common and difficult-to-debug CSS issue. |
| **LOW** | **[UNVERIFIED] Cross-Browser Compatibility Not Addressed** |
| | The plan does not mention testing on multiple browsers (e.g., Chrome, Firefox, Safari). While `position: sticky` is widely supported, its implementation can have subtle differences and historical bugs, particularly within flexbox or grid layouts. This introduces a risk of browser-specific layout failures. |

## Residual Risks

| Risk | Mitigation / Comment |
| :--- | :--- |
| **Layout Regressions on Untested Pages** | The plan only mitigates the risk for three specific pages. Without a broader testing strategy, there remains a significant risk of visual or functional regressions on other pages, especially those with complex internal layouts or on different viewport sizes. |
| **Scrollbar Layout Shift (CLS)** | The plan correctly identifies that locking the body scroll will cause a layout shift when the `ModelValueDetailDrawer` opens. It accepts this as a known issue. While acceptable for an internal tool, this confirms a non-zero negative impact on user experience. |
| **Brittle Sticky Navigation Offset** | The plan correctly identifies that `NavTabs` `sticky top-14` is coupled to the `Header` height. This remains a maintenance risk; any future change to the header height will require a corresponding change in `NavTabs.tsx`. |

## Token Stats

- total_input=1194
- total_output=890
- total_tokens=17256
- `gemini-2.5-pro`: input=1194, output=890, total=17256

## Resolution
- status: accepted
- note: HIGH (no test plan): deferred — no visual test infra exists; tasks.md has manual smoke test covering key scenarios. MEDIUM (drawer z-index): rejected — drawer already z-50, above z-10 sticky. MEDIUM (layout stretching non-h-full): rejected — same behavior as original h-screen+flex-1. LOW (sticky disabled by overflow): rejected — no overflow on any ancestor. LOW (cross-browser): deferred — internal tool, modern browser support.
