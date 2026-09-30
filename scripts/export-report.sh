#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PANDOC_BIN="${PANDOC_BIN:-pandoc}"
SOFFICE_BIN="${SOFFICE_BIN:-libreoffice}"
MD="$ROOT/Bao_cao_DATN_hoan_chinh.md"
DOCX="$ROOT/Bao_cao_DATN_hoan_chinh.docx"
PDF="$ROOT/Bao_cao_DATN_hoan_chinh.pdf"
CHECKSUM="$ROOT/SHA256SUMS_BAO_CAO"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v "$PANDOC_BIN" >/dev/null || { echo "Thiếu pandoc" >&2; exit 1; }
command -v "$SOFFICE_BIN" >/dev/null || { echo "Thiếu libreoffice" >&2; exit 1; }
[[ -f "$DOCX" ]] || { echo "Thiếu DOCX tham chiếu: $DOCX" >&2; exit 1; }

cp "$DOCX" "$TMP/reference.docx"
"$PANDOC_BIN" "$MD" \
  --from=gfm+tex_math_dollars \
  --to=docx \
  --reference-doc="$TMP/reference.docx" \
  --resource-path="$ROOT" \
  --standalone \
  --output="$TMP/Bao_cao_DATN_hoan_chinh.docx"

mkdir -p "$TMP/pdf"
"$SOFFICE_BIN" --headless --convert-to pdf --outdir "$TMP/pdf" \
  "$TMP/Bao_cao_DATN_hoan_chinh.docx" >/dev/null

mv "$TMP/Bao_cao_DATN_hoan_chinh.docx" "$DOCX"
mv "$TMP/pdf/Bao_cao_DATN_hoan_chinh.pdf" "$PDF"
(
  cd "$ROOT"
  sha256sum Bao_cao_DATN_hoan_chinh.md Bao_cao_DATN_hoan_chinh.docx Bao_cao_DATN_hoan_chinh.pdf \
    report-assets/ch3-06-thoi-gian-batch.png \
    report-assets/ch3-07-thong-luong-hieu-qua.png \
    report-assets/ch3-08-tai-nguyen.png > SHA256SUMS_BAO_CAO
  sha256sum -c SHA256SUMS_BAO_CAO
)
