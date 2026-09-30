#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PANDOC_BIN="${PANDOC_BIN:-pandoc}"
SOFFICE_BIN="${SOFFICE_BIN:-libreoffice}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
UNO_PYTHON="${UNO_PYTHON:-/usr/bin/python3}"
MD="$ROOT/Bao_cao_DATN_hoan_chinh.md"
DOCX="$ROOT/Bao_cao_DATN_hoan_chinh.docx"
PDF="$ROOT/Bao_cao_DATN_hoan_chinh.pdf"
CHECKSUM="$ROOT/SHA256SUMS_BAO_CAO"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v "$PANDOC_BIN" >/dev/null || { echo "Thiếu pandoc" >&2; exit 1; }
command -v "$SOFFICE_BIN" >/dev/null || { echo "Thiếu libreoffice" >&2; exit 1; }
[[ -f "$DOCX" ]] || { echo "Thiếu DOCX tham chiếu: $DOCX" >&2; exit 1; }

"$PYTHON_BIN" "$ROOT/scripts/prepare-report-export.py" "$MD" "$DOCX" \
  "$TMP/report.md" "$TMP/reference.docx"
"$PANDOC_BIN" "$TMP/report.md" \
  --from=gfm+tex_math_dollars \
  --to=docx \
  --reference-doc="$TMP/reference.docx" \
  --resource-path="$ROOT" \
  --standalone \
  --toc --toc-depth=3 --metadata toc-title="MỤC LỤC" \
  --output="$TMP/Bao_cao_DATN_hoan_chinh.docx"
"$PYTHON_BIN" "$ROOT/scripts/finalize-report-docx.py" \
  "$TMP/Bao_cao_DATN_hoan_chinh.docx"

"$UNO_PYTHON" "$ROOT/scripts/update-docx-indexes-and-export.py" \
  "$SOFFICE_BIN" "$TMP/Bao_cao_DATN_hoan_chinh.docx" \
  "$TMP/Bao_cao_DATN_hoan_chinh.pdf"

mv "$TMP/Bao_cao_DATN_hoan_chinh.docx" "$DOCX"
mv "$TMP/Bao_cao_DATN_hoan_chinh.pdf" "$PDF"
(
  cd "$ROOT"
  sha256sum Bao_cao_DATN_hoan_chinh.md Bao_cao_DATN_hoan_chinh.docx Bao_cao_DATN_hoan_chinh.pdf \
    report-assets/ch3-06-thoi-gian-batch.png \
    report-assets/ch3-07-thong-luong-hieu-qua.png \
    report-assets/ch3-08-tai-nguyen.png > SHA256SUMS_BAO_CAO
  sha256sum -c SHA256SUMS_BAO_CAO
)
