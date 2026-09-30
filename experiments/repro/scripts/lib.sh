#!/usr/bin/env bash
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REPRO="$REPO/experiments/repro"
RUNTIME="$REPRO/runtime"
PROJECT="$RUNTIME/project"
ENV_FILE="$RUNTIME/.env"
LOGS="$RUNTIME/logs"
PIDS="$RUNTIME/pids"
RESULTS="$RUNTIME/results"
PRIVATE="$RUNTIME/private"
EVIDENCE="$RUNTIME/evidence"
HISTORY="$RUNTIME/history"

fail() { echo "LỖI: $*" >&2; exit 1; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || fail "Thiếu lệnh: $1"; }
assert_scope() {
  case "$RUNTIME" in "$REPO/experiments/repro/runtime") ;; *) fail "Phạm vi runtime không hợp lệ: $RUNTIME";; esac
  [[ "$PROJECT" != "$REPO" ]] || fail "Không được dùng repository chính làm stack kiểm thử"
}
load_env() {
  [[ -f "$ENV_FILE" ]] || fail "Chưa có $ENV_FILE; chạy prepare.sh trước"
  set -a; source "$ENV_FILE"; set +a
  export DATN_ENV_FILE="$ENV_FILE" DATN_ROOT="$PROJECT"
}
dc() { (cd "$PROJECT" && docker compose "$@"); }
wait_http() {
  local url="$1" attempts="${2:-90}"
  for ((i=1;i<=attempts;i++)); do curl -fsS "$url" >/dev/null 2>&1 && return 0; sleep 1; done
  fail "Không nhận được phản hồi từ $url"
}
redact() {
  sed -E 's#(POSTGRES_PASSWORD|REDIS_PASSWORD|BITCOIN_RPC_PASSWORD|BITCOIN_RPC_USER|JWT_SECRET)=.*#\1=[REDACTED]#; s#(password|token|privateKey|wif)\"?[[:space:]]*:[[:space:]]*\"[^\"]+\"#\1":"[REDACTED]"#Ig'
}
