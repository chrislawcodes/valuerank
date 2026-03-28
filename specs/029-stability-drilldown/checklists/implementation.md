# Implementation Quality Checklist

**Feature**: [tasks.md](../tasks.md)

## Code Quality (per constitution § TypeScript Standards)

- [ ] No `any` types — use `Extract<RepeatPatternMetrics, { status: 'available' }>` for metrics props
- [ ] Strict boolean checks — use `count > 0` not `count` (truthy) per constitution § Strict Boolean Checks
- [ ] All new function signatures explicitly typed
- [ ] No `console.log` — no logging needed for this pure UI change

## Component Architecture (per constitution § React Components)

- [ ] `PairedPatternMetricButton` stays within 400-line guideline (small focused component)
- [ ] New URL params read via existing `searchParams.get()` pattern — no new hook
- [ ] `REPEAT_PATTERN_LABELS` export does not duplicate the definition — single source of truth

## URL Design

- [ ] `primaryConditionIds` and `companionConditionIds` passed as separate params (not merged)
- [ ] Existing `conditionIds` param (single-run path) left untouched — backward compatible
- [ ] `repeatPattern=noisy` preserved in URL (back-compat); display label uses `REPEAT_PATTERN_LABELS`

## Router Context (per constitution § Frontend Component Testing)

- [ ] All new component tests wrapped in `<MemoryRouter>`
- [ ] `PairedPatternMetricButton` navigation tested with `MemoryRouter` + `useNavigate` mock or spy
