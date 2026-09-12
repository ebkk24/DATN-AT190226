#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a
source "$ROOT/.env"
set +a

systemctl --user is-active --quiet datn-blockcerts-backend.service
systemctl --user is-active --quiet datn-blockcerts-nginx.service
for c in datn-postgres datn-redis datn-bitcoin-core; do
  test "$(docker inspect -f '{{.State.Health.Status}}' "$c")" = healthy
done
curl -fsS http://127.0.0.1:8088/health >/dev/null
curl -fsS "$PUBLIC_BASE_URL/api/blockcerts/issuers/kma/profile.json" >/dev/null
curl -fsS "$PUBLIC_BASE_URL/student/" >/dev/null
curl -fsS "$PUBLIC_BASE_URL/admin/" >/dev/null
curl -fsS "$PUBLIC_BASE_URL/verify/" >/dev/null
echo "HEALTH_OK"
