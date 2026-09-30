#!/usr/bin/env python3
"""Tạo fingerprint xác định cho đúng cây mã nguồn dùng trong thực nghiệm."""
from __future__ import annotations
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[3]
args = [a for a in sys.argv[1:] if a != "--require-clean"]
require_clean = "--require-clean" in sys.argv[1:]
out = Path(args[0]) if args else root / "experiments/repro/runtime/results/source-manifest.json"
include_roots = [
    ".env.example", ".gitignore", "compose.yaml", "README.md",
    "adapters", "apps/verifier-service", "backend/package.json", "backend/package-lock.json",
    "backend/tsconfig.json", "backend/tsconfig.build.json", "backend/src",
    "blockcerts/cert-tools/certificate_templates", "blockcerts/cert-tools/config",
    "blockcerts/cert-issuer/config", "blockcerts/issuer",
    "deploy", "experiments/repro/config", "experiments/repro/scripts",
    "frontend-admin/package.json", "frontend-admin/package-lock.json", "frontend-admin/src",
    "frontend-client/package.json", "frontend-client/package-lock.json", "frontend-client/src",
    "frontend-verify/package.json", "frontend-verify/package-lock.json", "frontend-verify/src",
    "scripts", "services", "tests",
]
exclude_parts = {"node_modules", "dist", "runtime", "__pycache__", ".git"}
exclude_suffixes = {".pyc", ".log", ".pdf", ".docx"}
files: list[Path] = []
for rel in include_roots:
    p = root / rel
    if p.is_file():
        files.append(p)
    elif p.is_dir():
        for q in p.rglob("*"):
            if q.is_file() and not (set(q.relative_to(root).parts) & exclude_parts) and q.suffix.lower() not in exclude_suffixes:
                files.append(q)
files = sorted(set(files), key=lambda p: p.relative_to(root).as_posix())
required_paths = [
    "experiments/repro/scripts/benchmark.mjs",
    "experiments/repro/scripts/run-tests.sh",
    "experiments/repro/scripts/audit-benchmark-artifacts.mjs",
    "experiments/repro/scripts/full-verifier-batch.cjs",
    "experiments/repro/scripts/source-manifest.py",
]
indexed_paths = {p.relative_to(root).as_posix() for p in files}
missing_required = [path for path in required_paths if path not in indexed_paths]
if missing_required:
    raise SystemExit("Thiếu file bắt buộc trong fingerprint: " + ", ".join(missing_required))
entries = []
canonical = bytearray()
for p in files:
    rel = p.relative_to(root).as_posix()
    digest = hashlib.sha256(p.read_bytes()).hexdigest()
    entries.append({"path": rel, "sha256": digest, "bytes": p.stat().st_size})
    canonical.extend(f"{digest}  {rel}\n".encode())

def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=root, text=True, capture_output=True, check=True).stdout.strip()
status = git("status", "--porcelain", "--untracked-files=all", "--", *include_roots)
manifest = {
    "schema": "datn-source-manifest-v2",
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "commit": git("rev-parse", "HEAD"),
    "gitDirty": bool(status),
    "gitStatus": status.splitlines(),
    "requiredFingerprintPaths": required_paths,
    "fileCount": len(entries),
    "treeSha256": hashlib.sha256(canonical).hexdigest(),
    "files": entries,
}
if require_clean and status:
    print(status, file=sys.stderr)
    raise SystemExit("Cây nguồn thực nghiệm chưa sạch; từ chối tạo bằng chứng")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({k: manifest[k] for k in ("commit", "gitDirty", "fileCount", "treeSha256")}, ensure_ascii=False))
