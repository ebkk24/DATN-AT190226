#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
assert_scope

mode="${1:---quick}"
case "$mode" in
  --quick|--full|--dry-run) ;;
  *) fail "Cách dùng: demo-reset.sh [--quick|--full|--dry-run]" ;;
esac

check_container_scope() {
  local name project
  for name in datn-repro-postgres datn-repro-redis datn-repro-bitcoin-core; do
    docker inspect "$name" >/dev/null 2>&1 || fail "Không tìm thấy container $name"
    project="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$name")"
    [[ "$project" == "datn-blockcerts-repro" ]] || fail "$name không thuộc namespace datn-blockcerts-repro"
  done
}

wait_container_healthy() {
  local name status
  for name in datn-repro-postgres datn-repro-redis datn-repro-bitcoin-core; do
    status=""
    for _ in {1..90}; do
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || true)"
      [[ "$status" == "healthy" || "$status" == "running" ]] && break
      sleep 1
    done
    [[ "$status" == "healthy" || "$status" == "running" ]] || fail "$name chưa sẵn sàng: $status"
  done
}

if [[ "$mode" == "--full" ]]; then
  "$REPRO/scripts/stop.sh" --purge
  "$REPRO/scripts/prepare.sh" --reset
  "$REPRO/scripts/start.sh"
  node "$REPRO/scripts/prepare-accounts.mjs"
  "$REPRO/scripts/health.sh"
  echo "DEMO_READY mode=full health=PASS accounts=READY data=CLEAN"
  exit 0
fi

load_env
require_cmd docker
require_cmd curl
check_container_scope

expected_tables=$'audit_logs\nissuance_batches\nissuance_outbox\nissued_certificates\ntypeorm_migrations\nusers\nverification_logs'
actual_tables="$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" datn-repro-postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  "select tablename from pg_tables where schemaname='public' order by tablename")"
[[ "$actual_tables" == "$expected_tables" ]] || {
  printf 'Danh sách bảng thực tế:\n%s\n' "$actual_tables" >&2
  fail "Schema đã thay đổi; từ chối dọn dữ liệu ngoài allowlist"
}

if [[ "$mode" == "--dry-run" ]]; then
  echo "DEMO_RESET_DRY_RUN scope=PASS containers=PASS schema=PASS mode=quick"
  exit 0
fi

"$REPRO/scripts/stop.sh" --app-only >/dev/null
dc up -d postgres redis bitcoin-core >/dev/null
wait_container_healthy

# Chỉ xóa dữ liệu nghiệp vụ trong PostgreSQL của stack repro; giữ bảng migration.
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" datn-repro-postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  'TRUNCATE TABLE verification_logs, audit_logs, issuance_outbox, issued_certificates, issuance_batches, users RESTART IDENTITY CASCADE;' \
  >/dev/null

# Chỉ xóa DB Redis của container repro.
docker exec datn-repro-redis redis-cli --no-auth-warning -a "$REDIS_PASSWORD" FLUSHDB >/dev/null

# Chỉ xóa tệp sinh ra trong bản sao runtime; tuyệt đối không đụng repository chính.
for path in \
  "$PROJECT/backend/.batch-work" \
  "$PROJECT/backend/.verify-tmp" \
  "$PROJECT/blockcerts/cert-tools/unsigned_certificates" \
  "$PROJECT/blockcerts/cert-issuer/signed_certificates" \
  "$PROJECT/blockcerts/cert-issuer/blockchain_certificates" \
  "$PROJECT/blockcerts/cert-issuer/work"; do
  case "$path" in "$PROJECT"/*) ;; *) fail "Đường dẫn dọn dẹp vượt ngoài runtime: $path" ;; esac
  rm -rf -- "$path"
  mkdir -p -- "$path"
done
rm -f -- "$PRIVATE/accounts.json" "$PRIVATE/web-demo.json"

"$REPRO/scripts/start.sh" >/dev/null
node "$REPRO/scripts/prepare-accounts.mjs" >/dev/null
health="$($REPRO/scripts/health.sh)"
printf '%s\n' "$health"
echo "DEMO_READY mode=quick health=PASS accounts=READY data=CLEAN"
