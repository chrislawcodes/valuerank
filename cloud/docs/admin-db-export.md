# Admin DB Export Runbook

This runbook covers `GET /admin/db-export` and `scripts/sync-prod-db.sh`.

## Purpose
- Pull a production SQL dump for local debugging and recovery validation.

## Security Model
- Endpoint is disabled unless `ADMIN_EXPORT_TOKEN` is configured.
- Token must be passed as `Authorization: Bearer <token>`.
- Token comparison uses constant-time comparison.
- Optional IP allowlist: `ADMIN_EXPORT_IP_ALLOWLIST`.
- Endpoint rate limiting: `ADMIN_EXPORT_RATE_LIMIT_MAX` per hour per IP.
- Export timeout: `ADMIN_EXPORT_TIMEOUT_MS`.
- All attempts/success/failures are logged.

## Why `DIRECT_URL`
- `pg_dump` works best with direct Postgres connections.
- `DATABASE_URL` may point at poolers (for example PgBouncer) that are not ideal for dump tooling.
- The endpoint uses `DIRECT_URL` when present and falls back to `DATABASE_URL`.

## Token Generation & Rotation
- Generate with `openssl rand -hex 32`.
- Store in secret manager (never commit to git).
- Rotate on a regular cadence and immediately after suspected exposure.

## Compromise Response
1. Rotate `ADMIN_EXPORT_TOKEN` immediately.
2. Check API logs for `Admin export` events and source IPs.
3. Revoke any leaked local dump files.
4. If needed, temporarily unset `ADMIN_EXPORT_TOKEN` to disable the endpoint.

## Data Handling Notes
- Dumps can contain sensitive production data.
- Keep dumps local-only and short-lived.
- Do not upload dumps to shared storage unless encrypted and approved.
