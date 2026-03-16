# Snapshot Boundary

Generated: 2026-03-15

This note defines the target snapshot boundary required for auditable `Findings`.

## Problem

FK references alone are not sufficient for reproducibility when setup text can change later.

The product needs to support questions like:

1. what exact prompt inputs did this run use?
2. did the instrument change between replications?
3. can we reproduce this finding later?

## Decision

The effective snapshot boundary must include resolved launch-time inputs, not just references to mutable current records.

## Target Snapshot Contents

At minimum, the effective snapshot should capture:

1. vignette version identity
2. preamble version or resolved preamble text
3. context version or resolved context text
4. value statement versions or resolved value statement text
5. level preset words in effect
6. model and provider configuration relevant to execution
7. evaluator or judge configuration relevant to downstream findings
8. temperature and other execution-relevant parameters

## Interim Product Rule

Until this boundary exists:

1. do not imply that cross-run findings are fully auditable
2. keep the explicit non-auditable findings state available
3. treat snapshot completeness as a prerequisite for full findings claims
