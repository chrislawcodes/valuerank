# Quickstart: Coverage Matrix Pair Orientation

## Prerequisites

- [ ] Dev server running: API on `localhost:3031`, Web on `localhost:3030`
- [ ] Job-choice domain exists with at least one completed paired run
- [ ] Standard vignette domain exists with at least one completed run (regression check)

---

## Story 1 & 3: Job-choice cells populate and show correct counts

**Goal**: Verify cells are no longer empty and counts are not doubled.

**Steps**:
1. Navigate to a job-choice domain's Coverage tab (`http://localhost:3030`)
2. Find the value pair you know has completed runs (e.g. Achievement × Benevolence)
3. Look at both cells: (col=Achievement, row=Benevolence) AND (col=Benevolence, row=Achievement)

**Expected**:
- Both cells show a non-zero count (not "—" or 0)
- If you ran the pair N times A-first and M times B-first, the cells show N and M respectively — **not** N+M in both
- The cells are color-coded (red/yellow/green) based on their individual counts

**Verification via API**:
```bash
TOKEN=$(node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({sub:'cmixy5vz90000l8tv2t6ar0vc',email:'dev@valuerank.ai'},'dev-secret-key-for-local-development-only-32chars',{expiresIn:'1h'}))")

curl -s -X POST http://localhost:3031/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "query { domainValueCoverage(domainId: \"<YOUR_DOMAIN_ID>\") { cells { valueA valueB batchCount definitionId } } }"}' \
  | jq '.data.domainValueCoverage.cells | map(select(.batchCount > 0))'
```

Confirm: `Achievement::Benevolence` and `Benevolence::Achievement` appear as **separate entries** with individual counts, not the same count.

---

## Story 2: Correct definition linked per cell

**Goal**: Clicking a cell links to the correct orientation's run.

**Steps**:
1. On the same job-choice domain, click the cell at (col=Achievement, row=Benevolence)
2. In the popover, click "View Vignette Analysis"
3. Check which definition you landed on — it should be the one where Achievement was option A

**Expected**:
- The linked analysis is for the A_first definition (Achievement presented first)
- Clicking the mirror cell (col=Benevolence, row=Achievement) links to the B_first definition

---

## Regression: Standard vignette domain

**Goal**: Confirm standard (non-job-choice) domains are not broken.

**Steps**:
1. Navigate to a standard vignette domain's Coverage tab
2. Compare cell counts before and after the change (note them down before deploying)

**Expected**:
- Counts are unchanged from pre-fix
- Only one of the two mirror cells is populated (e.g. (col=A, row=B) shows data, (col=B, row=A) shows "—") — this is the new correct behavior
- No console errors

---

## Troubleshooting

**Issue**: Cells still show 0 after fix
**Check**: Run the API query above and look at the raw cells. If `batchCount` is 0 in the API response, the normalization may not be working — check that `resolvedContent.dimensions` names are being correctly converted to PascalCase.

**Issue**: Both mirror cells show the same count
**Check**: The frontend sort may still be active. Verify line 672 of `DomainCoverage.tsx` uses `` `${colVal}::${rowVal}` `` not `[rowVal, colVal].sort()`.

**Issue**: Standard domain shows empty cells where it used to show data
**Check**: The standard vignette definition's dimension order in `resolvedContent` — the first dimension becomes `valueA`. The cell at (col=valueA, row=valueB) will be populated; the mirror will not. This is expected. Verify the cell that IS populated matches the definition's natural dimension order.
