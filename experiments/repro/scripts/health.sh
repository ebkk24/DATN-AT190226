#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
assert_scope; load_env
for c in datn-repro-postgres datn-repro-redis datn-repro-bitcoin-core; do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' "$c")" == healthy ]] || fail "$c không healthy"
done
[[ -f "$PIDS/backend.pid" ]] && kill -0 "$(cat "$PIDS/backend.pid")"
[[ -f "$PIDS/nginx.pid" ]] && kill -0 "$(cat "$PIDS/nginx.pid")"
for path in health admin/ student/ verify/ api/blockcerts/issuers/kma/profile.json; do curl -fsS "$PUBLIC_BASE_URL/$path" >/dev/null; done
migrations="$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" datn-repro-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc 'select count(*) from typeorm_migrations')"
[[ "$migrations" == 9 ]] || fail "Số migration là $migrations, mong đợi 9"
printf 'HEALTH_PASS containers=3 migrations=%s api=200 admin=200 student=200 verify=200\n' "$migrations"
