# Data-Critical Waves (migrations, backfills, rollout scripts)

**The build passing does not mean the data script works on production.**

Before writing a spec for any wave containing migration, backfill, or rollout scripts:

1. **Confirm actual production values** — do not assume dev/test enum values match prod (e.g. `flipped_order` not `flipped`)
2. **Confirm actual production string formats** — do not assume delimiters, prefixes, or suffixes (e.g. `1 -` not `1 =`)
3. **Require `--dry-run` mode** — must be reviewed before live prod execution
4. **Require production-shaped fixtures** — test data must match real prod format, not idealized schema

## Post-Deploy Verification Checklist

The plan file must include this checklist. Before marking a feature live, confirm:

- Deployed commit is on prod
- Migration and backfill applied (check row counts)
- UI and API behave correctly end-to-end
- No error spikes for 10 minutes post-deploy

"Code deployed" ≠ "feature live." Both the code rollout AND the data rollout must be verified.
