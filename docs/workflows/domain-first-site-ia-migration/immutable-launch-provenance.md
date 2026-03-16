# Immutable Launch Provenance

Generated: 2026-03-15

This note defines the historical-truth contract for `Domains > Runs` and `Domain Evaluation Summary`.

## Problem

Today:

1. `Run` rows are keyed to `definitionId`
2. `Definition.domainId` is mutable
3. definitions can be reassigned across domains

Without immutable launch provenance, any historical domain-grouped view can be silently reparented by later definition moves.

## Decision

Historical domain-grouped execution history must not be reconstructed from the current `Definition.domainId` alone.

Instead, each domain-wide launch needs immutable provenance that records at least:

1. launch identifier
2. domain identifier at launch time
3. domain name at launch time
4. included definition identifiers
5. launch scope or category
6. launch timestamp

## Minimum Contract Before Grouped Domain History Is Canonical

Before `Domains > Runs` becomes the primary execution history:

1. every grouped history item must resolve through immutable launch provenance
2. the UI must be able to tell whether a run was part of a specific domain evaluation cohort
3. history grouping must remain stable even if definitions are later moved to a different domain

## Acceptable Interim Behavior

Until immutable launch provenance exists:

1. do not present grouped domain history as authoritative historical truth
2. label domain-grouped views as present-day operational grouping only
3. preserve individual run detail as the source of truth for old records
