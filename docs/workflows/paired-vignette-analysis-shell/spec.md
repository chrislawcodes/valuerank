# Spec

## Goal

Create a shared analysis experience that can inspect either a single vignette or a paired vignette set through the same UI shell.

The user should be able to switch modes from a top-level toggle:

- `Single vignette`
- `Paired vignettes`

In single mode, the page should behave like the current vignette analysis experience for one definition.
In paired mode, it should pool the matched pair for the main summary while still preserving per-version provenance for drilldown and sanity checks.

## User Problem

Right now, the analysis tools are split across multiple pages and mental models:

- one page focuses on analysis summaries
- another page focuses on paired vignette readback
- the paired view is tied to legacy validation language that does not match the user’s actual goal

The user wants one analysis surface that can answer:

1. What does the model do on this vignette?
2. What does the model do when the vignette is viewed as a matched pair?

## Scope

The feature should cover:

1. a shared analysis shell with a top-level mode toggle
2. a single-vignette mode that reuses the existing analysis tabs and charts
3. a paired-vignette mode that pools the matched pair for the main summary
4. drilldown views that still show the underlying versioned evidence
5. route and label updates so the experience is framed as vignette analysis, not validation
6. tests that prove the toggle changes scope without breaking the existing analysis views

## Scope Model

The page needs one explicit analysis scope at a time:

- `mode=single` means one vignette definition drives the analysis
- `mode=paired` means one matched vignette pair drives the analysis

Paired mode must define pooling as:

- the main summary is computed from the combined evidence across both versions
- version identity is still preserved for drilldown, provenance labels, and sanity checks
- the pooled view should not silently mix version-specific rows without a way to inspect the source version

The selected scope should be representable in the URL so the view can be shared and reloaded.

## Core Product Requirements

### Mode toggle

- The toggle must be visible near the top of the analysis surface.
- The toggle must change the analysis scope, not just the labels.
- The selected mode should be reflected in the URL, with enough state to restore the same vignette or pair on reload.

### Single vignette mode

- Show the current one-vignette analysis experience.
- Keep existing summary charts, decision squares, and transcript drilldown behavior.
- Do not require paired data to render.

### Paired vignette mode

- Treat the matched vignette versions as one analysis question.
- Pool the evidence for summary metrics and visualization defaults.
- Preserve the per-version provenance so users can still inspect the A-first and B-first answers.
- Make it obvious which evidence came from which version.
- When a chart cannot cleanly show pooled and versioned data together, prefer the pooled summary plus a hover or drilldown path for version-specific detail rather than duplicating the full chart twice.

### Shared behavior

- Reuse the same charts and tables where possible.
- Keep transcript drilldown available in both modes.
- Keep the UI language focused on vignette analysis instead of validation or order-effect measurement.

## Non-Goals

- Building a new statistical method for order-effect detection
- Redesigning the underlying vignette creation flow
- Replacing the current analysis data model for all historical runs
- Removing the ability to inspect the two versions separately

## Risks To Manage

- A pooled view can hide important asymmetry if the version provenance is too faint
- A toggle that only changes labels will confuse users
- Overloading the page with both single and paired logic can make the shell hard to understand
- Existing analysis components may assume a single vignette scope and need adapters
