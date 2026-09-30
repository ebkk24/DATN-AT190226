#!/usr/bin/env python3
"""Đóng băng kết quả một lượt chạy và lập checksum; không sao chép bí mật."""
from __future__ import annotations
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[3]
runtime = root / "experiments/repro/runtime"
run_id = (runtime / "current-run-id").read_text().strip()
if not run_id or "/" in run_id or ".." in run_id:
    raise SystemExit("run id không hợp lệ")
dest = runtime / "evidence" / run_id
if dest.exists():
    raise SystemExit(f"evidence đã tồn tại: {dest}")
(dest / "results").mkdir(parents=True)
(dest / "logs").mkdir()
for p in sorted((runtime / "results").rglob("*")):
    if p.is_file():
        target = dest / "results" / p.relative_to(runtime / "results")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, target)
allow_logs = {
    "backend-tests.log", "verifier-tests.log", "prepare-accounts.log",
    "functional-e2e.log", "recovery-e2e.log", "health-final.log",
}
for p in sorted((runtime / "logs").glob("benchmark-*.log")) + [runtime / "logs" / n for n in sorted(allow_logs)]:
    if p.is_file():
        shutil.copy2(p, dest / "logs" / p.name)
secret_markers = [b"JWT_SECRET=", b"POSTGRES_PASSWORD=", b"REDIS_PASSWORD=", b"BITCOIN_RPC_PASSWORD=", b"BEGIN PRIVATE KEY", b"current-accounts.json"]
entries=[]
for p in sorted(dest.rglob("*")):
    if not p.is_file():
        continue
    data=p.read_bytes()
    if any(marker in data for marker in secret_markers):
        raise SystemExit(f"Phát hiện marker bí mật trong {p}")
    entries.append({"path":p.relative_to(dest).as_posix(),"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()})
canonical="".join(f"{e['sha256']}  {e['path']}\n" for e in entries).encode()
manifest={"schema":"datn-evidence-manifest-v1","runId":run_id,"frozenAt":datetime.now(timezone.utc).isoformat(),"fileCount":len(entries),"contentSha256":hashlib.sha256(canonical).hexdigest(),"files":entries}
(dest/"MANIFEST.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
for p in dest.rglob("*"):
    if p.is_file(): p.chmod(0o444)
for p in sorted([x for x in dest.rglob("*") if x.is_dir()], reverse=True): p.chmod(0o555)
dest.chmod(0o555)
print(json.dumps({"runId":run_id,"path":str(dest),"fileCount":len(entries),"contentSha256":manifest["contentSha256"]},ensure_ascii=False))
