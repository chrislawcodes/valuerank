#!/usr/bin/env bash
set -euo pipefail

# Usage:
# 1) Ensure ADMIN_EXPORT_TOKEN is set in cloud/.env (or environment)
# 2) Ensure local DB container name matches LOCAL_DB_CONTAINER
# 3) Run from cloud/: ./scripts/sync-prod-db.sh

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ -z "${ADMIN_EXPORT_TOKEN:-}" ]; then
  echo "Error: ADMIN_EXPORT_TOKEN is not set"
  exit 1
fi

API_URL="${PROD_DB_EXPORT_URL:-https://api.valuerank.org/admin/db-export}"
LOCAL_DB_CONTAINER="${LOCAL_DB_CONTAINER:-valuerank-postgres}"
LOCAL_DB_USER="${LOCAL_DB_USER:-valuerank}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-valuerank}"
DUMP_FILE="${DUMP_FILE:-production_dump.sql}"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "${TEMP_DIR}" "${DUMP_FILE}"' EXIT

HEADER_FILE="${TEMP_DIR}/curl-headers.txt"
printf 'header = "Authorization: Bearer %s"\n' "${ADMIN_EXPORT_TOKEN}" > "${HEADER_FILE}"
chmod 600 "${HEADER_FILE}"

echo "Downloading production database dump from ${API_URL}..."
HTTP_STATUS=$(curl -sS -o "${DUMP_FILE}" -w "%{http_code}" \
  -K "${HEADER_FILE}" \
  "${API_URL}")

if [ "${HTTP_STATUS}" != "200" ]; then
  echo "Download failed with HTTP ${HTTP_STATUS}"
  [ -f "${DUMP_FILE}" ] && head -n 20 "${DUMP_FILE}" || true
  exit 1
fi

if [ ! -s "${DUMP_FILE}" ]; then
  echo "Downloaded dump is empty"
  exit 1
fi

TABLE_COUNT=$(docker exec "${LOCAL_DB_CONTAINER}" psql -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}" -At -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema');" \
  2>/dev/null || echo "")

if [ -n "${TABLE_COUNT}" ] && [ "${TABLE_COUNT}" -gt 0 ] 2>/dev/null; then
  BACKUP_FILE="backup-${LOCAL_DB_NAME}-$(date +%Y%m%d-%H%M%S).sql"
  echo "Creating backup of current local DB: ${BACKUP_FILE}"
  docker exec "${LOCAL_DB_CONTAINER}" pg_dump -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}" > "${BACKUP_FILE}"
  echo "Backup saved to ${BACKUP_FILE}"
else
  echo "No existing local data found; skipping backup"
fi

echo "Resetting local database ${LOCAL_DB_NAME} in ${LOCAL_DB_CONTAINER}..."
docker exec "${LOCAL_DB_CONTAINER}" psql -U "${LOCAL_DB_USER}" -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${LOCAL_DB_NAME}' AND pid <> pg_backend_pid();" \
  >/dev/null 2>&1 || true
docker exec "${LOCAL_DB_CONTAINER}" dropdb -U "${LOCAL_DB_USER}" --if-exists "${LOCAL_DB_NAME}"
docker exec "${LOCAL_DB_CONTAINER}" createdb -U "${LOCAL_DB_USER}" "${LOCAL_DB_NAME}"

echo "Restoring dump to local database..."
docker exec -i "${LOCAL_DB_CONTAINER}" psql -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}" < "${DUMP_FILE}" >/dev/null

RUNS=$(docker exec "${LOCAL_DB_CONTAINER}" psql -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}" -t -c "SELECT count(*) FROM runs;" | tr -d ' ')
TRANSCRIPTS=$(docker exec "${LOCAL_DB_CONTAINER}" psql -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}" -t -c "SELECT count(*) FROM transcripts;" | tr -d ' ')

echo "Restore complete:"
echo "  Runs: ${RUNS}"
echo "  Transcripts: ${TRANSCRIPTS}"

echo "Done."
