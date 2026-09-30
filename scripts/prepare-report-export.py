#!/usr/bin/env python3
"""Chuẩn bị Markdown và DOCX tham chiếu để Pandoc xuất báo cáo ổn định."""
import argparse,re
from pathlib import Path
from docx import Document
from docx.enum.style import WD_STYLE_TYPE

ap=argparse.ArgumentParser()
ap.add_argument('markdown',type=Path);ap.add_argument('reference',type=Path)
ap.add_argument('output_markdown',type=Path);ap.add_argument('output_reference',type=Path)
a=ap.parse_args()
text=a.markdown.read_text()
text,n=re.subn(r'^<div align="center">.*?</div>\s*(?:\\newpage\s*)?', '', text, count=1, flags=re.S)
a.output_markdown.write_text(text.lstrip())
doc=Document(a.reference)
for name in ('Heading 1','Heading 2','Heading 3','Heading 4'):
    style=doc.styles[name]
    ppr=style.element.pPr
    if ppr is not None and ppr.numPr is not None:
        ppr.remove(ppr.numPr)
doc.save(a.output_reference)
