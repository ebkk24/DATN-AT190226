#!/usr/bin/env python3
"""Chèn trang bìa chuẩn vào đầu DOCX do Pandoc sinh."""
import argparse
from copy import deepcopy
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_SECTION
from docx.shared import Pt,Cm
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ap=argparse.ArgumentParser();ap.add_argument('docx');a=ap.parse_args()
doc=Document(a.docx)
first=doc._body._body[0]
created=[]
def para(text='',size=14,bold=False,space_before=0,space_after=0,align=WD_ALIGN_PARAGRAPH.CENTER):
    p=doc.add_paragraph();p.alignment=align
    p.paragraph_format.space_before=Pt(space_before);p.paragraph_format.space_after=Pt(space_after)
    r=p.add_run(text);r.bold=bold;r.font.name='Times New Roman';r.font.size=Pt(size)
    r._element.rPr.rFonts.set(qn('w:eastAsia'),'Times New Roman')
    created.append(p._p);return p
para('BAN CƠ YẾU CHÍNH PHỦ',14,True)
para('HỌC VIỆN KỸ THUẬT MẬT MÃ',14,True)
para('¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯',14,False,0,30)
para('ĐỒ ÁN TỐT NGHIỆP',18,True,16,22)
para('NGHIÊN CỨU PHÁT TRIỂN HỆ THỐNG THÔNG TIN',17,True)
para('HỖ TRỢ QUẢN LÝ VĂN BẰNG CHỨNG CHỈ',17,True)
para('DỰA TRÊN NỀN TẢNG BLOCKCHAIN',17,True,0,20)
para('Ngành: An toàn thông tin',14,False)
para('Mã số: 7.48.02.02',14,False,0,18)
para('Sinh viên thực hiện: Phạm Đức Khải – MSSV: AT190226',14,False,0,8,WD_ALIGN_PARAGRAPH.LEFT).paragraph_format.left_indent=Cm(2.4)
para('Người hướng dẫn: TS. Trần Trung',14,False,0,0,WD_ALIGN_PARAGRAPH.LEFT).paragraph_format.left_indent=Cm(2.4)
para('Khoa CNTT – Trường Đại học Điện lực',14,False,0,38,WD_ALIGN_PARAGRAPH.LEFT).paragraph_format.left_indent=Cm(2.4)
p=para('Hà Nội, 2026',14,False)
p.add_run().add_break()
p.runs[-1]._element.getparent().remove(p.runs[-1]._element)
# page break at end of cover
r=p.add_run();br=OxmlElement('w:br');br.set(qn('w:type'),'page');r._r.append(br)
for el in reversed(created):
    doc._body._body.remove(el);doc._body._body.insert(0,el)
# Trang đầu không hiện header/footer; các trang sau dùng định dạng tham chiếu.
for sec in doc.sections:
    sec.different_first_page_header_footer=True
doc.save(a.docx)
