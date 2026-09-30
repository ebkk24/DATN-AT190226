#!/usr/bin/env python3
"""Đồng bộ PUBLIC_BASE_URL vào các cấu hình Blockcerts không chứa bí mật."""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
parser.add_argument("public_base_url")
ns = parser.parse_args()
check_only = ns.check
base = ns.public_base_url.rstrip("/")
parts = urlsplit(base)
if (
    parts.scheme not in {"http", "https"}
    or not parts.netloc
    or parts.username
    or parts.password
    or parts.path not in {"", "/"}
    or parts.query
    or parts.fragment
):
    raise SystemExit(
        "PUBLIC_BASE_URL phải là origin HTTP(S), không chứa credential, path, query hoặc fragment"
    )
root = ns.root.resolve()
profile_url = f"{base}/api/blockcerts/issuers/kma/profile.json"
revocation_url = f"{base}/api/blockcerts/issuers/kma/revocation-list.json"

def load_json(rel: str):
    path = root / rel
    return path, json.loads(path.read_text(encoding="utf-8"))

def save_json(path: Path, data):
    if not check_only:
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

path, data = load_json("blockcerts/cert-tools/certificate_templates/diploma-v3.json")
data["issuer"] = profile_url
save_json(path, data)
path, data = load_json("blockcerts/issuer/profile.json")
data["id"] = profile_url
data["revocationList"] = revocation_url
save_json(path, data)
path, data = load_json("blockcerts/issuer/revocation-list.json")
data["id"] = revocation_url
data["issuer"] = profile_url
save_json(path, data)
for rel, key in [
    ("blockcerts/cert-tools/config/conf.ini", "issuer_id"),
    ("blockcerts/cert-issuer/config/conf.ini", "verification_method"),
    ("blockcerts/cert-issuer/config/real-preflight.ini", "verification_method"),
    ("blockcerts/cert-issuer/config/mock-preflight.ini", "verification_method"),
]:
    path = root / rel
    text = path.read_text(encoding="utf-8")
    text, count = re.subn(
        rf"(?m)^{re.escape(key)}\s*=.*$", f"{key} = {profile_url}", text
    )
    if count != 1:
        raise SystemExit(f"Không tìm thấy đúng một khóa {key} trong {rel}")
    if not check_only:
        path.write_text(text, encoding="utf-8")
print(
    f"PUBLIC_BASE_URL hợp lệ: {base}"
    if check_only
    else f"Đã đồng bộ PUBLIC_BASE_URL={base}"
)
