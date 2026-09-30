#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
assert_scope
mode="${1:---app-only}"
if [[ -f "$PIDS/nginx.pid" ]]; then nginx -s quit -c "$RUNTIME/nginx.conf" -p "$RUNTIME/nginx" >/dev/null 2>>"$LOGS/nginx-startup.log" || true; fi
if [[ -f "$PIDS/backend.pid" ]]; then
  pid="$(cat "$PIDS/backend.pid")"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then kill "$pid"; for _ in {1..30}; do kill -0 "$pid" 2>/dev/null || break; sleep .2; done; fi
  rm -f "$PIDS/backend.pid"
fi
if [[ "$mode" == "--down" || "$mode" == "--purge" ]]; then
  [[ -f "$PROJECT/compose.yaml" && -f "$PROJECT/.env" ]] && (cd "$PROJECT" && docker compose down --remove-orphans)
fi
if [[ "$mode" == "--purge" ]]; then
  [[ -f "$PROJECT/compose.yaml" && -f "$PROJECT/.env" ]] && (cd "$PROJECT" && docker compose down -v --remove-orphans) || true
  rm -rf "$RUNTIME"
fi
echo "STOP_PASS mode=$mode"
