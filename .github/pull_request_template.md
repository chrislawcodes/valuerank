## Summary
- 

## File structure
- [ ] No new file uses a `-helpers` / `-utils` / `-misc` / `-types-detail` suffix
- [ ] New files have ≥3 callers OR a clearly nameable single responsibility
- [ ] No file was split purely to satisfy `max-lines` (split by responsibility, not line count)

## Validation
- [ ] `npm run lint --workspace @valuerank/shared`
- [ ] `npm run lint --workspace @valuerank/db`
- [ ] `npm run lint --workspace @valuerank/api`
- [ ] `npm run test --workspace @valuerank/api`
- [ ] `npm run build --workspace @valuerank/api`

### If web touched
- [ ] `npm run lint --workspace @valuerank/web`
- [ ] `npm run test --workspace @valuerank/web`
- [ ] `npm run build --workspace @valuerank/web`

## Notes
- Commit validated: 
- Skipped checks and reason: 
