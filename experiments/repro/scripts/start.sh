#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
assert_scope; load_env
FAULT=0; [[ "${1:-}" == "--fault-after-broadcast" ]] && FAULT=1
"$REPRO/scripts/stop.sh" --app-only >/dev/null 2>&1 || true
dc up -d postgres redis bitcoin-core
mkdir -p "$LOGS" "$PIDS" "$RUNTIME/nginx/client_body" "$RUNTIME/nginx/proxy_temp"
set -a; source "$ENV_FILE"; set +a
export DATN_ENV_FILE="$ENV_FILE" DATN_ROOT="$PROJECT"
if (( FAULT )); then export DATN_FAIL_AFTER_BROADCAST=1; else unset DATN_FAIL_AFTER_BROADCAST || true; fi
(
  cd "$REPO/backend"
  nohup node dist/src/main.js >"$LOGS/backend.log" 2>&1 & echo $! >"$PIDS/backend.pid"
)
wait_http "http://127.0.0.1:$REPRO_API_PORT/health" 90
nginx -c "$RUNTIME/nginx.conf" -p "$RUNTIME/nginx" 2>>"$LOGS/nginx-startup.log"
wait_http "$PUBLIC_BASE_URL/health" 30
printf 'START_PASS api=%s web=%s fault_after_broadcast=%s\n' "$REPRO_API_PORT" "$REPRO_WEB_PORT" "$FAULT"
