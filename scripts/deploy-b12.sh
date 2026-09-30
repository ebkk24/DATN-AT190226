#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "$ROOT/.env" ]] || { echo "Thiếu $ROOT/.env" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a
: "${PUBLIC_BASE_URL:?Thiếu PUBLIC_BASE_URL trong .env}"
: "${DATN_ROOT:?Thiếu DATN_ROOT trong .env}"
[[ "$(realpath -m "$DATN_ROOT")" == "$ROOT" ]] || { echo "DATN_ROOT không trỏ đến repository hiện tại" >&2; exit 1; }

"$ROOT/scripts/configure-public-base.py" "$PUBLIC_BASE_URL"
"$ROOT/scripts/install-user-services.sh"

backend_was_active=0
if systemctl --user is-active --quiet datn-blockcerts-backend.service; then
  backend_was_active=1
  systemctl --user stop datn-blockcerts-backend.service
fi
deployment_ok=0
restore_on_exit() {
  code=$?
  if (( ! deployment_ok && backend_was_active )); then
    systemctl --user start datn-blockcerts-backend.service || true
  fi
  return "$code"
}
trap restore_on_exit EXIT

cd "$ROOT"
docker compose config --quiet
docker compose up -d postgres redis bitcoin-core
[[ -s "$ROOT/storage/credentials/pk_issuer.txt" ]] || { echo "Thiếu WIF phát hành; xem docs/installation/05-phat-hanh-regtest.md" >&2; exit 1; }
[[ "$(stat -c '%a' "$ROOT/storage/credentials/pk_issuer.txt")" == 600 ]] || { echo "WIF phải có mode 600" >&2; exit 1; }
docker compose --profile tools build cert-tools cert-issuer verifier-service

cd "$ROOT/backend"
npm ci --silent
npm run build
for pair in "frontend-client:student" "frontend-admin:admin" "frontend-verify:verify"; do
  app="${pair%%:*}"
  target="${pair##*:}"
  cd "$ROOT/$app"
  npm ci --silent
  npm run build
  rm -rf "$ROOT/deploy/www/$target"
  mkdir -p "$ROOT/deploy/www/$target"
  cp -a dist/. "$ROOT/deploy/www/$target/"
done

cd "$ROOT/backend"
npm run migration:run
npm run privacy:redact-verification-logs
mkdir -p "$ROOT/deploy/runtime/client_body" "$ROOT/deploy/runtime/proxy_temp" "$ROOT/deploy/logs"
nginx -t -p "$ROOT/deploy/" -c nginx/nginx.conf

systemctl --user restart datn-blockcerts-backend.service
ready=0
for _ in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:4000/health >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if (( ! ready )); then
  journalctl --user -u datn-blockcerts-backend.service -n 50 --no-pager
  echo "Backend không đạt readiness trong 120 giây" >&2
  exit 1
fi
systemctl --user restart datn-blockcerts-nginx.service
nginx_ready=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8088/health >/dev/null 2>&1; then nginx_ready=1; break; fi
  sleep 1
done
if (( ! nginx_ready )); then
  journalctl --user -u datn-blockcerts-nginx.service -n 50 --no-pager
  echo "Nginx không đạt readiness trong 30 giây" >&2
  exit 1
fi
"$ROOT/scripts/health-check-b12.sh"
deployment_ok=1
echo "Đã triển khai: $PUBLIC_BASE_URL"
