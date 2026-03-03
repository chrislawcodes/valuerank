# Feature Plan: `vnew` Virtual Signature for Domain Analysis

## Problem

When a single vignette is edited (bumping its version), its signature diverges from other vignettes in the domain (e.g., `v3t0` vs `v2t0`). The current signature filter forces users to either:
- View only `v3t0` (missing unchanged vignettes), or
- View only `v2t0` (missing the updated vignette), or
- Re-run all vignettes at the new version (unnecessary cost)

Users want to compare the **latest version** of each vignette at a given temperature without re-running unchanged vignettes.

## Solution

Add a **virtual `vnew` signature** that dynamically resolves to "latest version per vignette lineage at temperature T." This becomes the default selection in the signature dropdown.

### Signature format
| Signature | Meaning |
|-----------|---------|
| `vnewt0` | Latest version of each vignette, temperature 0 |
| `vnewtd` | Latest version of each vignette, provider default |
| `v2t0` | Exact version 2, temperature 0 (historical) |

### UX behavior

The signature dropdown changes from:
```
[ All signatures ▼ ]    →    [ vnewt0          ▼ ]
  v2t0                          vnewt0 (default)
  v3t0                          vnewtd
                                ────────────────
                                v2t0
                                v3t0
```

- `vnew` options appear at the top, above a separator
- `vnewt0` is selected by default (or the most common temperature)
- Exact signatures remain below as **exact run-signature filters within the latest-definition universe**
- URL param: `?signature=vnewt0` (shareable but time-dependent)

> [!IMPORTANT]
> **Architectural invariant:** Analysis never changes the definition universe (latest-per-lineage); signature only changes which runs are eligible for each latest definition.

### Display labels

The dropdown shows human-readable labels, using `vnewt0` as the internal URL/API token:

| Internal token | Display label |
|---------------|---------------|
| `vnewt0` | Latest @ t=0 |
| `vnewtd` | Latest @ default |
| `v2t0` | v2 @ t=0 |

### Info displays

When a `vnew` signature is active:
- Subtitle: *"Analyzing latest version of each vignette at temperature 0. 10 of 12 vignettes covered."*
- Missing-vignette warnings are driven by the `missingDefinitionIds` field from the resolver (not computed client-side)

---

## Proposed Changes

### Backend (API)

#### [MODIFY] [domain.ts](file:///Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/domain.ts)

**All three analysis resolvers** (`domainAnalysis`, `domainAnalysisValueDetail`, `domainAnalysisConditionTranscripts`):
- When `signature` starts with `vnew`: parse temperature, resolve latest run per lineage at that temperature
- When exact signature (e.g., `v2t0`): existing filter behavior unchanged
- Return **structured coverage metadata** alongside results:
  - `targetedDefinitions: number` — total latest-per-lineage definitions in scope
  - `coveredDefinitions: number` — definitions with matching runs
  - `missingDefinitionIds: string[]` — definitions with no matching run at the selected signature

This lets the UI render accurate warnings consistently across main analysis and value detail pages.

**New helper** `resolveSignatureRuns(latestDefinitions, sourceRunIds, signature)` **(implement early)**:
- Shared across all three resolvers — extract before adding `vnew` to avoid resolver drift
- Returns `{ filteredSourceRunIds, filteredSourceRunDefinitionById, missingDefinitionIds }`

**New query field `domainAvailableSignatures(domainId)`:**
- Computes available signatures using the **same latest-per-lineage definition scope** as the analysis resolvers — ensuring every signature in the dropdown can produce results
- Returns both `vnew` options (one per distinct temperature) and exact signatures
- Used by the frontend to populate the dropdown

---

#### [NEW] [vnew-signature.ts](file:///Users/chrislaw/valuerank/cloud/apps/api/src/utils/vnew-signature.ts)

- `isVnewSignature(signature: string): boolean`
- `parseVnewTemperature(signature: string): number | null` — extracts temperature from `vnewt0`, `vnewtd`, etc.
- `formatVnewSignature(temperature: number | null): string` — produces `vnewt0`, `vnewtd`, etc.

---

### Frontend (Web)

#### [MODIFY] [DomainAnalysis.tsx](file:///Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainAnalysis.tsx)

- Replace the definitions-based signature computation with a call to `domainAvailableSignatures`
- Default the dropdown to the first `vnew` option (likely `vnewt0`)
- Remove the `useDefinitions` call that fetches up to 1000 definitions just for the dropdown
- Add subtitle showing resolution info and any missing-vignette warnings

#### [MODIFY] [DomainAnalysisValueDetail.tsx](file:///Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainAnalysisValueDetail.tsx)

- Pass `signature` through from URL params (already done in PR #273)
- No additional changes needed — backend handles resolution

#### [MODIFY] [domainAnalysis.ts](file:///Users/chrislaw/valuerank/cloud/apps/web/src/api/operations/domainAnalysis.ts)

- Add `domainAvailableSignatures` query operation and types

---

## Considerations

### Key semantic distinction
`vnewt0` and exact signatures (e.g., `v2t0`) both operate on the **same latest-definitions-only universe**. Neither is a "true historical" mode. The difference is purely which *runs* qualify:
- `vnewt0`: latest run at temperature 0 for each latest definition, regardless of version tag
- `v2t0`: only runs tagged exactly v2t0 for each latest definition (some definitions may have no matching runs and will be excluded)

### Non-reproducibility over time
`vnewt0` resolves dynamically. Sharing a URL with `?signature=vnewt0` may show different data to different people if vignettes were edited between views. Exact signatures (`v2t0`) remain available for pinned comparisons.

### Missing runs
If a vignette's latest version has no run at the selected temperature, it's silently excluded. The warning message mitigates this, but users should understand that `vnew` shows a *best-effort* view.

### Performance
- `vnew` resolution queries runs by `(definitionId, status, deletedAt, createdAt)` — ensure a composite index exists on these columns
- Resolve all latest-per-lineage runs in a single batch query (not per-definition) to avoid N+1
- The `resolveSignatureRuns` helper should accept all definition IDs at once and return a Map

### Backward compatibility
- Exact signatures continue to work identically
- The `vnew` prefix is reserved and won't collide with version numbers (versions are always integers)
- **GraphQL rejects unknown arguments with an error**, not silently. The frontend already handles this via the `useLegacyQuery` fallback: if the API returns `Unknown argument "signature"`, the query retries without it. This pattern (already in place for `scoreMethod`) covers rolling deployments where the web ships before the API.

---

## Verification Plan

### Automated Tests
- Unit test for `vnew-signature.ts`: parse/format round-trips, edge cases (`vnewtd`, `vnewt0`, `vnewt0.7`)
- Unit test for `resolveVnewSignatureRuns`: verifies latest-per-lineage selection at a given temperature
- Existing API tests (run from `cloud/`):
  ```bash
  DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
  JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
  npx turbo run test
  ```

### Manual Verification
1. Create a domain with 3+ vignettes, all at v1
2. Run domain trials at temperature 0 → all have signature `v1t0`
3. Edit one vignette → bumps to v2
4. Run trials for **only** the edited vignette at temperature 0
5. Open Domain Analysis → signature dropdown should show `vnewt0` as default
6. Verify analysis includes the v2 run for the edited vignette and v1 runs for the others
7. Switch to `v1t0` → verify it shows only v1 runs (excluding the edited vignette's v2 run)
