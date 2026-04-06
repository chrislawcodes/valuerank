# Domain Analysis CSV Export — Implementation Plan

## Feature summary

Add an Export CSV button to the Domain Analysis page that downloads all analyzable
transcripts for the currently selected domain + signature, across all models and
all latest-vignette runs that match that context.

---

## Pre-implementation decisions (locked)

| Decision | Resolution |
|----------|------------|
| Route URL | `GET /api/export/domains/:id/transcripts.csv?signature=<sig>` |
| Empty result | Return header-only CSV (no error). Consistent with run CSV route. |
| `decisionCode` filter | `{ in: ['1', '2', '3', '4', '5'] }` — confirmed from `domain.ts:1429` |
| File structure | Add new endpoint directly; split `export.ts` in a follow-up PR |
| Shared module | Minimal `resolveDomainSignatureRunIds(domainId, signature)` in `services/domain.ts` |
| Filename when signature absent | Use resolved signature from the helper return value; omit segment entirely if still null |

---

## Phase 1 — Minimal shared service

Create `apps/api/src/services/domain.ts` with a single exported function:

```typescript
export async function resolveDomainSignatureRunIds(
  domainId: string,
  signature: string | null,
): Promise<{
  domain: { id: string; name: string };
  filteredSourceRunIds: string[];
  resolvedSignature: string | null;
} | null>  // returns null if domain not found
```

Internally this function:
1. Looks up the domain (`db.domain.findUnique`) — returns `null` if not found
2. Queries `db.definition.findMany` where `{ domainId, deletedAt: null }`
3. Calls `hydrateDefinitionAncestors` + `selectLatestDefinitionPerLineage` to get latest definition IDs
4. Calls `resolveSignatureRuns(latestDefinitionIds, signature)` and returns
   `filteredSourceRunIds` + `selectedSignature`

**What moves vs. what stays:**
- `hydrateDefinitionAncestors`, `selectLatestDefinitionPerLineage`, `resolveSignatureRuns`,
  `runMatchesSignature`, `formatRunSignature`, `selectDefaultVnewSignature` move from
  `domain.ts` into this service file (they're private implementation details)
- `isVnewSignature` and `parseVnewTemperature` are **not moved** — they already live in
  `utils/vnew-signature.ts` and are imported by both files from there
- `domain.ts` imports `resolveDomainSignatureRunIds` from the new service and calls it
  instead of calling `resolveSignatureRuns` directly

> This keeps the extraction minimal and avoids touching vnew-signature.ts or any other
> utility. The only files that change are `domain.ts` (import swap) and the new
> `services/domain.ts`.

---

## Phase 2 — Backend endpoint

Add `GET /api/export/domains/:id/transcripts.csv?signature=<sig>` directly to
`apps/api/src/routes/export.ts`.

> Note: `export.ts` is at 580 lines, over the 400-line constitution limit. Adding
> this endpoint will make it worse. A follow-up PR should split the file into
> `routes/export/runs.ts`, `routes/export/definitions.ts`, `routes/export/domains.ts`.
> That refactor is intentionally out of scope here to keep diff surface small.

### Handler logic

```typescript
// 1. Auth check
if (!req.user) throw new AuthenticationError('Authentication required');

// 2. Resolve domain + run IDs via shared service
const resolved = await resolveDomainSignatureRunIds(domainId, signature ?? null);
if (!resolved) throw new NotFoundError('Domain', domainId);

const { domain, filteredSourceRunIds, resolvedSignature } = resolved;

// 3. Query analyzable transcripts
const transcripts = await db.transcript.findMany({
  where: {
    runId: { in: filteredSourceRunIds },
    deletedAt: null,
    decisionCode: { in: ['1', '2', '3', '4', '5'] },
  },
  include: {
    scenario: true,
    run: { select: { name: true } },
  },
  orderBy: [{ modelId: 'asc' }, { scenarioId: 'asc' }],
});
```

### Response

Stream using the same BOM → header → row-loop pattern as `/runs/:id/csv`.

**Filename construction:**
```typescript
const safeName = domain.name.replace(/[^a-z0-9-]/gi, '_').toLowerCase();
const safeSig = resolvedSignature
  ? resolvedSignature.replace(/[^a-z0-9-]/gi, '_').toLowerCase()
  : null;
const date = new Date().toISOString().slice(0, 10);
const filename = safeSig
  ? `domain-${safeName}-${safeSig}-transcripts-${date}.csv`
  : `domain-${safeName}-transcripts-${date}.csv`;
```

This avoids `--` artifacts when no signature is present.

```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="<filename>"
```

Empty result: write BOM + header only, then `res.end()`. No error thrown.

---

## Phase 3 — Frontend API helper

Add to `apps/web/src/api/export.ts`:

```typescript
export async function exportDomainTranscriptsAsCSV(
  domainId: string,
  signature?: string,
): Promise<void>
```

Pattern: identical to `exportRunAsCSV` — get token, build URL with optional
`?signature=<sig>` query param, fetch, parse `Content-Disposition` for filename
with fallback `domain-${domainId.slice(0, 8)}-transcripts.csv`, blob-link-click.

---

## Phase 4 — UI control

In `DomainAnalysis.tsx`, add an Export CSV button inside the Domain Selection
`<section>`, in the `flex` row that currently holds the two `<select>` elements
(line 205).

```tsx
<Button
  type="button"
  variant="secondary"
  size="sm"
  onClick={handleExport}
  disabled={selectedDomainId === '' || exportLoading}
>
  {exportLoading ? 'Exporting…' : 'Export CSV'}
</Button>
```

Local state: `exportLoading: boolean`, `exportError: string | null`.

`handleExport` calls `exportDomainTranscriptsAsCSV(selectedDomainId, selectedSignature || undefined)`.

On error: set `exportError` and display below the button as a small `<p>` with
`text-amber-700` styling (matches existing inline error style on the page). Clear
the error on the next successful export or when domainId/signature changes.

`DomainAnalysis.tsx` is currently 310 lines; this stays within the 400-line limit.

---

## Phase 5 — Tests

### `apps/api/tests/routes/export.test.ts` (extend existing file)

- Auth required (401 with no token)
- 404 on unknown domainId
- Returns 200 + `Content-Type: text/csv` + `Content-Disposition: attachment` on success
- Response body contains BOM + expected CSV header
- Signature filtering: transcripts from non-matching runs are excluded
- `decisionCode` filtering: rows with code `0` or `null` are excluded
- Empty domain (no runs): returns header-only CSV, not an error
- Filename omits signature segment when no signature resolves

### `apps/web/tests/api/export.test.ts` (extend existing file)

- `exportDomainTranscriptsAsCSV` constructs correct URL with and without signature
- Auth header is present
- Filename parsed from `Content-Disposition`; fallback used when header absent

### `DomainAnalysis` component test (extend or add)

- Export CSV button renders in Domain Selection section
- Button is disabled when `selectedDomainId` is empty
- Clicking button calls `exportDomainTranscriptsAsCSV` with correct args
- Loading state shown during export
- Error state shown when export throws

---

## Rollout and verification

Manual check on `/domains/analysis`:
1. Select domain + signature
2. Click Export CSV
3. Confirm downloaded rows belong only to that domain's latest-vignette runs and selected signature
4. Confirm `decisionCode` column values are all 1–5 (no nulls or 0s)
5. Confirm filename matches pattern; test with no-signature selection to verify no `--` artifact

Preflight (per `cloud/CLAUDE.md`) before PR:
```bash
npm run lint --workspace @valuerank/api
npm run test --workspace @valuerank/api
npm run build --workspace @valuerank/api
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/web
```

---

## Implementation order

1. Phase 1 (shared service) — prerequisite for Phase 2
2. Phase 2 (backend endpoint) — can be reviewed/merged independently
3. Phase 3 (frontend helper) + Phase 4 (UI) — sequential, after Phase 2 lands
4. Phase 5 (tests) — written alongside each phase, not deferred
5. Follow-up PR: split `export.ts` into sub-files once this feature is stable
