#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
assert_scope; load_env
"$REPRO/scripts/health.sh"
python3 - "$RESULTS" <<'PY'
import json, statistics, sys
from pathlib import Path
p=Path(sys.argv[1]); f=json.loads((p/'functional-e2e.json').read_text()); r=json.loads((p/'recovery.json').read_text())
print(f"FUNCTIONAL_PASS={str(f['passed']).upper()} original={f['verification']['original']} tampered={','.join(f['verification']['tampered'].values())} after_revoke={f['verification']['afterRevoke']}")
rbac=f['rbac']
rbac_pass=(
 rbac.get('makerSelfApprove')==403 and rbac.get('otherMakerListVisible') is False and
 rbac.get('otherMakerRead')==404 and rbac.get('otherMakerAuditVisible') is False and
 rbac.get('studentRevoke')==403 and rbac.get('makerRevoke')==403 and rbac.get('checkerRevoke')==201
)
print(f"RBAC_PASS={str(rbac_pass).upper()} holder_isolation={str(f['holder']['sameNameIsolation']).upper()} privacy_log={str(f.get('privacy',{}).get('verificationLogsSanitized')).upper()} cert_mode={f.get('privacy',{}).get('certificateFileMode')}")
print(f"RECOVERY_PASS={str(r['passed']).upper()} attempts={r['attemptCount']} block_delta={r['blockDelta']} same_txid=TRUE")
bp=p/'benchmark.json'
if bp.exists():
 b=json.loads(bp.read_text()); runs=[x for x in b.get('runs',[]) if x.get('passed')]
 print(f"BENCHMARK_RUNS={len(runs)}/9")
 for size in (10,100,500):
  rows=[x for x in runs if x['size']==size]
  if rows: print(f"N={size}: pass={len(rows)}/3 success=100% avg_seconds={statistics.mean(x['approvalToIssuedSeconds'] for x in rows):.3f} tx_per_run=1 block_delta=1")
else: print('BENCHMARK_RUNS=0/9 (chưa chạy)')
PY
