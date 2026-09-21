#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT/backend"
npm run build

for pair in "frontend-client:student" "frontend-admin:admin" "frontend-verify:verify"; do
  app="${pair%%:*}"
  target="${pair##*:}"
  cd "$ROOT/$app"
  npm run build
  rm -rf "$ROOT/deploy/www/$target"
  mkdir -p "$ROOT/deploy/www/$target"
  cp -a dist/. "$ROOT/deploy/www/$target/"
done

# Dừng API trong cửa sổ migration để phiên bản cũ không ghi bản ghi audit
# thiếu hash giữa lúc migration thêm ràng buộc NOT NULL.
cd "$ROOT/backend"
backend_was_active=0
if systemctl --user is-active --quiet datn-blockcerts-backend.service; then
  backend_was_active=1
  systemctl --user stop datn-blockcerts-backend.service
fi
if ! npm run migration:run; then
  if [ "$backend_was_active" -eq 1 ]; then
    systemctl --user start datn-blockcerts-backend.service
  fi
  exit 1
fi

mkdir -p "/home/khai/DATN_work/datn-blockcerts/deploy/runtime/client_body" "/home/khai/DATN_work/datn-blockcerts/deploy/runtime/proxy_temp"
systemctl --user daemon-reload
systemctl --user restart datn-blockcerts-backend.service
ready=0
for _ in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:4000/health >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  journalctl --user -u datn-blockcerts-backend.service -n 50 --no-pager
  echo "Backend không đạt readiness trong 120 giây" >&2
  exit 1
fi
systemctl --user restart datn-blockcerts-nginx.service
nginx_ready=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8088/health >/dev/null 2>&1; then
    nginx_ready=1
    break
  fi
  sleep 1
done
if [ "$nginx_ready" -ne 1 ]; then
  journalctl --user -u datn-blockcerts-nginx.service -n 50 --no-pager
  echo "Nginx không đạt readiness trong 30 giây" >&2
  exit 1
fi
"$ROOT/scripts/health-check-b12.sh"
echo "Đã triển khai: http://100.105.56.19:8088"
