#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
RESET=0; BENCH=0
for arg in "$@"; do case "$arg" in --reset) RESET=1;; --benchmark) BENCH=1;; *) echo "LỖI: cờ không hợp lệ $arg" >&2; exit 2;; esac; done
if (( RESET )); then "$HERE/prepare.sh" --reset; else "$HERE/prepare.sh"; fi
"$HERE/start.sh"
"$HERE/health.sh"
if (( BENCH )); then "$HERE/run-tests.sh" --benchmark; else "$HERE/run-tests.sh"; fi
