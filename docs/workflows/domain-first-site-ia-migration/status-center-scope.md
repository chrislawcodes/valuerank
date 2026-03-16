# Status Center Scope

Generated: 2026-03-15

This note defines the scope contract for the persistent global status center.

## Decision

The global status center is a cross-domain operational monitor for:

1. in-flight work
2. recently completed work
3. failed or stalled work

It is not the primary monitor for a single domain evaluation cohort.

## Required Behavior

1. The launch flow may open or highlight the status center as a secondary monitor.
2. The status center must make its scope explicit.
3. The status center must remain easy to reopen after launch.
4. The status center must not imply it shows the full authoritative picture for one domain evaluation unless that is actually true.

## Relationship To Other Surfaces

1. `Domain Evaluation Summary`
   - authoritative for one evaluation cohort
2. `Run Detail`
   - authoritative for one run
3. `Global Status Center`
   - authoritative for cross-domain operational visibility at its declared scope

## Multi-User Guidance

If the product later supports multiple users or overlapping launches:

1. the status center should distinguish between current-user context and broader system activity where possible
2. the UI must avoid showing global queue counts as if they belong only to the launch the user just started
