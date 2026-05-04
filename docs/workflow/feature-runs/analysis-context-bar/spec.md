# Spec

## Feature: Shared Analysis Context Bar

### Goal

Centralize the shared analysis context controls into one sticky bar that is visible on the model/domain analysis pages.

The bar should hold the controls that are reused across these reports:

- domain
- signature
- model set

The bar should reduce duplicate UI, keep shared context visible while the user moves between related pages, and preserve page-specific controls where they belong.

### Background

Today, the model/domain analysis family spreads the same context controls across multiple pages. Each page owns its own version of the domain, signature, and model controls, with slightly different defaulting and URL sync behavior.

That creates three problems:

1. The user has to re-learn where the controls live on every page.
2. Shared state is repeated in several places, which makes drift likely.
3. Related reports do not feel like one workflow, even though they depend on the same analysis context.

This feature does **not** mean making the global app header a control panel for every page. It means adding a shared analysis context bar for the analysis family only.

Note on terminology: this spec keeps the existing URL parameter name `signature` for compatibility. In this feature, `signature` means the trial-signature selector used by these reports, not a vignette or value-term from the canonical glossary.

---

## Supported Pages

The first version of this feature applies to the pages that already rely on these shared controls:

- `cloud/apps/web/src/pages/DomainAnalysis.tsx`
- `cloud/apps/web/src/pages/DomainValueShiftHeatmap.tsx`
- `cloud/apps/web/src/pages/PressureSensitivity.tsx`
- `cloud/apps/web/src/pages/ModelsConfidence.tsx`

If a page does not use at least one of the shared controls, it stays out of scope.

---

## User Stories

### US-1 - Keep the shared context visible while moving through related reports

**As a** user exploring model/domain analysis,
**I want** the domain, signature, and model set to stay visible in one place,
**so that** I can compare reports without losing my bearings.

**Acceptance criteria:**
- The shared context bar appears on every supported page.
- The bar stays in a stable location above the report content.
- The selected context remains visible while switching between supported pages.

### US-2 - Make the shared controls behave the same way everywhere

**As a** user,
**I want** the shared controls to resolve defaults and URL state consistently,
**so that** the same link always opens the same analysis context.

**Acceptance criteria:**
- Each control has one source of truth.
- Back/forward navigation restores the same context.
- Direct links with domain, signature, and model state still work.
- Page-specific defaults do not overwrite an explicit URL selection.
- Changing a shared control on the same page does not create a new browser history entry.
- Page-to-page navigation may create a new entry, but the shared context should survive the transition when the destination page supports it.

### US-3 - Keep page-specific controls separate

**As a** user,
**I want** report-specific controls to stay near the report they affect,
**so that** I do not confuse global context with local view settings.

**Acceptance criteria:**
- Controls that only affect one report stay on that page.
- The context bar does not absorb local toggles, explanations, or actions.
- The page still reads clearly if the context bar is collapsed on mobile.

---

## Requirements

### R-0 - Define page support and control visibility explicitly

The shared bar must be route-aware.

Supported pages and visible controls:

| Page | Domain | Signature | Model set | Page-local controls that stay on the page |
|---|---|---|---|---|
| `DomainAnalysis` | Visible | Visible | Visible | Scope toggle, refresh, export, and page-specific analysis sections |
| `DomainValueShiftHeatmap` | Hidden | Visible | Visible | Display mode and table-specific controls |
| `PressureSensitivity` | Visible | Visible | Visible | Any report-specific explainer or detail sections |
| `ModelsConfidence` | Visible | Visible | Visible | Any report-specific copy or drill-in behavior |

If a page does not support a control, the bar must hide that control rather than inventing a placeholder state.

### R-1 - Add a shared analysis context bar

Implement a shared context bar for the supported analysis pages.

The bar must show:

- domain selection
- signature selection
- model set selection

The bar must live above the main report content and below the app-wide navigation header.

The bar must stay compact. On desktop, the controls may appear in one row or wrap into a tight second row only when necessary. On mobile, the bar must collapse into a summary row with an expand action that opens the full control set in a drawer or sheet.

### R-2 - Use one state model for the shared controls

The shared controls must use one common state path rather than each page owning separate versions of the same selection.

Requirements:

- URL state is the source of truth for shareable context.
- Explicit URL selections win over all defaults.
- Page defaults may initialize missing context, but they must not overwrite explicit selections.
- The initialization order must be deterministic: URL params first, then page-aware defaults, then global fallback defaults only if the page needs a value to render.
- If a control is unavailable on a page, the bar must hide or disable that control instead of inventing a fake value.
- Shared context initialization must be one-time and idempotent. If the page resolves a missing default and writes it to the URL, it must do so with `replace` so the browser history does not grow for a simple load.
- User-driven control changes on the current page must also use `replace` unless a different explicit action is taken.

### R-3 - Preserve page-level behavior

Supported pages must keep their existing report behavior.

Requirements:

- page-specific filters remain on the page
- page-specific helper text stays next to the content it explains
- page-specific loading and error states remain intact
- the shared bar must not change the underlying analysis results

### R-4 - Keep the URL semantics stable

The feature must not break deep links.

Requirements:

- a copied URL must still restore the same page and shared context
- switching pages must preserve the shared context when possible
- query params unrelated to the shared context must survive page transitions if the target page already uses them

### R-5 - Make the UI responsive

The shared bar must work on desktop and mobile.

Requirements:

- the bar must not cause horizontal overflow on small screens
- the controls must collapse into a compact summary plus drawer or sheet on mobile instead of stacking three full-width selectors in the viewport
- the bar must remain readable without taking over the page
- the mobile interaction must not hide the report content behind a permanently open filter panel

### R-6 - Add tests for the shared context behavior

The feature needs coverage for the behavior that can regress easily.

Minimum test coverage:

- the shared bar renders on supported pages
- a change in one control updates the URL correctly
- an explicit URL selection wins over page defaults
- page-specific controls still render where expected
- mobile layout does not break the page structure
- changing a shared control does not add a new history entry
- the mobile collapsed state can be opened and closed without obscuring the report indefinitely

---

## Non-Goals

- Do not make the global app header the permanent home for these controls on unrelated pages.
- Do not move report-specific toggles, legends, or help text into the shared bar.
- Do not change analysis calculations, query contracts, or backend behavior.
- Do not redesign unrelated navigation.
- Do not force every page in the app to use the same context model.

---

## Acceptance Criteria

1. Supported analysis pages show a shared context bar in a consistent location.
2. The shared bar contains the domain, signature, and model-set controls.
3. Explicit URL state continues to work and survives page transitions.
4. Page defaults do not overwrite user-selected context.
5. Page-specific controls remain on their respective pages.
6. Mobile layout stays usable and does not overflow.
7. The page content and analysis results remain unchanged apart from the control placement.

---

## Senior TL Critique (Gemini Lens)

This section is intentionally adversarial. It is written from the perspective of a strict senior TL reviewing the spec for hidden risks.

| Concern | Why a senior TL would push back | What needs to be nailed down |
|---|---|---|
| Scope is still a little fuzzy | “Model/domain analysis family” is a product idea, not an implementation contract. Different pages already use the same words in different ways. | Name the exact supported routes and say which controls appear on each one. |
| State ownership could get messy | A shared bar sounds simple until each page has its own defaulting and URL sync rules. Then you get two sources of truth in disguise. | Define one precedence order for URL state, page defaults, and fallback defaults. |
| The bar could become too wide | Three controls plus labels, loading states, and reset actions can turn the top of the page into a crowded toolbar. | Decide what must be visible at all times and what may collapse into a menu. |
| Shared controls may hide page meaning | Domain, signature, and model set are not equally relevant on every page. A universal bar can make local report logic feel disconnected. | Specify which controls are truly shared and which remain local to the report. |
| Deep-link behavior is under-specified | The user will expect copied links to reopen the same analysis view exactly. If the sync rules are even slightly off, this becomes a support problem. | Spell out the expected query params and page-transition behavior. |
| Mobile risk is real | A sticky control strip can steal too much vertical space on a small screen. | Define the mobile collapse pattern before implementation starts. |
| Test surface is too thin right now | “It renders” is not enough. The bugs will come from URL sync, default resolution, and page switching. | Add explicit coverage for URL precedence, cross-page preservation, and responsive layout. |

### TL verdict

This is a good direction, but only if the shared bar stays narrow and route-aware.

If the implementation tries to make one universal control strip for every page in the app, I would expect regressions and layout bloat.

If it stays scoped to the analysis family, with clear URL rules and a tight mobile design, it is a good refactor.
