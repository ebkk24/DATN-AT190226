from pathlib import Path
import cert_schema

root = Path(cert_schema.__file__).resolve().parent / "3.0"
prefix = "https://w3id.org/blockcerts/schema/3.0/"
replacement = root.as_uri() + "/"
changed = 0
for path in sorted(root.glob("*.json")):
    text = path.read_text(encoding="utf-8")
    updated = text.replace(prefix, replacement)
    if updated != text:
        path.write_text(updated, encoding="utf-8")
        changed += 1
if changed == 0:
    raise SystemExit("Không tìm thấy tham chiếu schema Blockcerts cần đóng gói cục bộ")
if any(prefix in path.read_text(encoding="utf-8") for path in root.glob("*.json")):
    raise SystemExit("Vẫn còn tham chiếu schema 3.0 phụ thuộc mạng")
print(f"Đã chuyển tham chiếu schema Blockcerts sang file cục bộ: {changed} tệp")
