---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/native-body-scroll/spec.md"
artifact_sha256: "c3f28ca0cc81fd899d8e67bc9eebaf846d20cb5f095d8d57ec9c784738f9d68a"
repo_root: "."
git_head_sha: "f08458578d016a539c10d9e5a66642e94f706aa1"
git_base_ref: "origin/main"
git_base_sha: "abe39ae0d4893c5db5b2ece4889efdfd4cbc4d91"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH (brittle offset): deferred — same known coupling as before, already deferred. MEDIUM (flex-1 extra space): rejected — same behavior as original h-screen + flex-1 layout; short pages always had min-viewport-height main. MEDIUM (edge detection sub-pixel): rejected — scrollLeft+clientWidth vs scrollWidth comparison handles sub-pixels correctly; integer operations in all major browsers. LOW (scroll lock race): deferred — pre-existing, out of scope."
raw_output_path: "docs/workflow/feature-runs/native-body-scroll/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | Finding |
| :--- | :--- |
| **HIGH** | **Brittle Sticky Offset:** The spec hardcodes `top-14` for the `NavTabs` component. This assumes the `Header` is always a fixed height (56px). This assumption is fragile and likely to break. If header content wraps on smaller screens, or if accessibility settings increase font sizes, the header will grow taller and the nav bar will either overlap it or be partially obscured. This creates a direct visual bug under common conditions. |
| **MEDIUM** | **[UNVERIFIED] Unintended Layout Side-Effects:** The proposal keeps `flex-1` on the `<main>` element within a `min-h-screen flex flex-col` parent. The stated reason is to support `h-full` children. However, this forces `<main>` to *always* stretch to fill the available viewport height, even for pages not designed to be full-height. This may break the layout of shorter content pages by introducing unwanted vertical space, changing the intended visual composition. |
| **MEDIUM** | **[UNVERIFIED] New Complexity in `useHorizontalScrollOnWheel`:** The spec introduces new "edge detection" logic to the scroll hook. This is presented as a simplification but is actually a new feature. This new logic, intended to release scroll control at the horizontal edges, could introduce its own bugs. For example, it might fail with sub-pixel scroll offsets or rounding errors, preventing vertical scroll when the user expects it. The complexity of this check is unknown. |
| **LOW** | **Overly Simplistic Scroll-Lock Fix:** The spec simplifies the scroll lock for `ModelValueDetailDrawer` by only locking the `body`. However, it explicitly scopes out fixing concurrent scroll lock management (e.g., when a Modal and Drawer could be active). While this change is logical in isolation, it removes a redundant lock without addressing the underlying state management complexity. This leaves the system vulnerable to scroll lock race conditions where the body may be unlocked prematurely by one component while another still requires it to be locked. |

## Residual Risks

| Risk | Description |
| :--- | :--- |
| **Fragile Z-Index Stacking Context:** The solution relies on a specific `z-index` hierarchy (`z-10` for sticky elements, `z-50` for dropdowns). This works now but creates an implicit dependency that is not enforced. Future components (e.g., toast notifications, third-party widgets) could be introduced with intermediate `z-index` values, causing them to render incorrectly between the sticky nav and its dropdown menus. |
| **Incomplete Scroll Management:** The spec explicitly defers fixing "concurrent scroll lock management" across different components like `MobileNav`, `Modal`, and `Drawer`. By simplifying the lock for one component but not creating a robust, shared system for managing the scroll lock state, the risk of scroll-related bugs remains high. A user action that triggers two such components in sequence could easily leave the page in a permanently scroll-locked state. |

## Token Stats

- total_input=2825
- total_output=653
- total_tokens=16554
- `gemini-2.5-pro`: input=2825, output=653, total=16554

## Resolution
- status: accepted
- note: HIGH (brittle offset): deferred — same known coupling as before, already deferred. MEDIUM (flex-1 extra space): rejected — same behavior as original h-screen + flex-1 layout; short pages always had min-viewport-height main. MEDIUM (edge detection sub-pixel): rejected — scrollLeft+clientWidth vs scrollWidth comparison handles sub-pixels correctly; integer operations in all major browsers. LOW (scroll lock race): deferred — pre-existing, out of scope.
