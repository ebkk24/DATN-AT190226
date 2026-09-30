#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
assert_scope; load_env
BENCH=0
case "${1:-}" in
  "") ;;
  --benchmark) BENCH=1 ;;
  *) fail "Cách dùng: run-tests.sh [--benchmark]" ;;
esac

run_id="$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 4)"
printf '%s\n' "$run_id" >"$RUNTIME/current-run-id"
mkdir -p "$HISTORY" "$EVIDENCE"
"$REPRO/scripts/stop.sh" --app-only >/dev/null 2>&1 || true
if [[ -d "$RESULTS" || -d "$LOGS" ]]; then
  previous="$HISTORY/${run_id}-previous"
  mkdir -p "$previous"
  [[ -d "$RESULTS" ]] && mv "$RESULTS" "$previous/results"
  [[ -d "$LOGS" ]] && mv "$LOGS" "$previous/logs"
fi
mkdir -p "$RESULTS" "$LOGS"
python3 "$REPRO/scripts/source-manifest.py" "$RESULTS/source-manifest.json" | tee "$LOGS/source-manifest.log"
"$REPRO/scripts/start.sh" | tee "$LOGS/start-initial.log"
"$REPRO/scripts/health.sh" | tee "$LOGS/health-initial.log"

echo "[1/6] Kiểm thử backend: nghiệp vụ, RBAC, isolation và phục hồi"
(cd "$REPO/backend" && npm test -- --runInBand --json --outputFile="$RESULTS/backend-jest.json") 2>&1 | tee "$LOGS/backend-tests.log"
echo "[2/6] Kiểm thử dịch vụ xác minh: 10 ca SSRF và 6 ca ngữ nghĩa trạng thái"
(cd "$REPO/apps/verifier-service" && npm test) 2>&1 | tee "$LOGS/verifier-tests.log"
echo "[3/6] Tạo tài khoản tạm trong DB kiểm thử (tệp bí mật mode 600)"
node "$REPRO/scripts/prepare-accounts.mjs" | tee "$LOGS/prepare-accounts.log"
echo "[4/6] E2E chức năng: RBAC, cách ly Holder, phát hành, xác minh, sửa đổi và thu hồi"
node "$REPRO/scripts/functional-e2e.mjs" | tee "$LOGS/functional-e2e.log"
echo "[5/6] E2E phục hồi sau lỗi ngay sau khi broadcast anchor"
"$REPRO/scripts/start.sh" --fault-after-broadcast | tee "$LOGS/start-fault.log"
restore_normal() { "$REPRO/scripts/start.sh" >"$LOGS/start-normal.log" 2>&1 || true; }
trap restore_normal EXIT
node "$REPRO/scripts/recovery-e2e.mjs" | tee "$LOGS/recovery-e2e.log"
restore_normal; trap - EXIT
"$REPRO/scripts/health.sh" | tee "$LOGS/health-after-recovery.log"
if (( BENCH )); then
  echo "[6/6] Benchmark tùy chọn: 10/100/500 chứng thư, mỗi cỡ lặp 3 lần"
  for size in 10 100 500; do
    for repeat in 1 2 3; do
      node "$REPRO/scripts/benchmark.mjs" --size="$size" --repeat="$repeat" | tee "$LOGS/benchmark-${size}-${repeat}.log"
    done
  done
  node "$REPRO/scripts/audit-benchmark-artifacts.mjs" | tee "$LOGS/benchmark-artifact-audit.log"
else
  echo "[6/6] Bỏ qua benchmark; dùng --benchmark để chạy 10/100/500 × 3"
fi
"$REPRO/scripts/health.sh" | tee "$LOGS/health-final.log"
python3 - "$RESULTS" "$BENCH" "$run_id" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); bench=int(sys.argv[2]); run_id=sys.argv[3]
f=json.loads((p/'functional-e2e.json').read_text()); r=json.loads((p/'recovery.json').read_text()); source=json.loads((p/'source-manifest.json').read_text()); jest=json.loads((p/'backend-jest.json').read_text())
assert f['passed'] and r['passed']
summary={'schema':'datn-run-summary-v1','runId':run_id,'default':'PASS','functional':f['passed'],'recovery':r['passed'],'backend_suites':jest['numTotalTestSuites'],'backend_tests':jest['numTotalTests'],'ssrf_tests':10,'verification_status_tests':6,'verifier_tests':16,'benchmark':'SKIPPED','sourceTreeSha256':source['treeSha256'],'sourceCommit':source['commit'],'sourceDirty':source['gitDirty']}
if bench:
 b=json.loads((p/'benchmark.json').read_text()); audit=json.loads((p/'benchmark-artifact-audit.json').read_text()); good=[x for x in b['runs'] if x.get('passed')]; assert len(good)==9 and b.get('complete') and audit.get('passed') and audit.get('fullVerifierValid')==1830; summary['benchmark']='PASS'; summary['benchmark_runs']=9; summary['benchmark_certificates']=1830; summary['full_verifier_valid']=1830
(p/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print('TEST_PASS default=PASS benchmark='+summary['benchmark'])
PY
python3 "$REPRO/scripts/freeze-evidence.py" | tee "$LOGS/freeze-evidence.log"
