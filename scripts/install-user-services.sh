#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  TEMP_ROOT="$(mktemp -d)"
  UNIT_DIR="$TEMP_ROOT/systemd-user"
  trap 'rm -rf "$TEMP_ROOT"' EXIT
elif [[ $# -gt 0 ]]; then
  echo "Cách dùng: $0 [--dry-run]" >&2
  exit 2
else
  UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
fi
NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"
NGINX_BIN="$(command -v nginx || true)"

for item in "node:$NODE_BIN" "npm:$NPM_BIN" "nginx:$NGINX_BIN"; do
  if [[ -z "${item#*:}" ]]; then
    echo "Thiếu lệnh ${item%%:*} trong PATH" >&2
    exit 1
  fi
done
[[ -f "$ROOT/.env" ]] || { echo "Thiếu $ROOT/.env" >&2; exit 1; }
mkdir -p "$UNIT_DIR" "$ROOT/deploy/runtime/client_body" "$ROOT/deploy/runtime/proxy_temp" "$ROOT/deploy/logs"

escape_sed() { printf '%s' "$1" | sed -e 's/[\&|]/\\&/g'; }
root_esc="$(escape_sed "$ROOT")"
node_esc="$(escape_sed "$NODE_BIN")"
npm_esc="$(escape_sed "$NPM_BIN")"
nginx_esc="$(escape_sed "$NGINX_BIN")"
for unit in datn-blockcerts-backend datn-blockcerts-nginx; do
  sed -e "s|@DATN_ROOT@|$root_esc|g" \
      -e "s|@NODE@|$node_esc|g" \
      -e "s|@NPM@|$npm_esc|g" \
      -e "s|@NGINX@|$nginx_esc|g" \
      "$ROOT/deploy/systemd/$unit.service.in" > "$UNIT_DIR/$unit.service"
  chmod 0644 "$UNIT_DIR/$unit.service"
done

if (( DRY_RUN )); then
  command -v systemd-analyze >/dev/null || { echo "Thiếu systemd-analyze" >&2; exit 1; }
  systemd-analyze verify \
    "$UNIT_DIR/datn-blockcerts-backend.service" \
    "$UNIT_DIR/datn-blockcerts-nginx.service"
  echo "Đã kiểm tra hai unit sinh từ template; không cài đặt hoặc khởi động dịch vụ."
else
  systemctl --user daemon-reload
  systemctl --user enable \
    datn-blockcerts-backend.service \
    datn-blockcerts-nginx.service >/dev/null
  echo "Đã cài systemd user units vào $UNIT_DIR"
fi
