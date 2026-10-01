#!/usr/bin/env python3
"""Đóng băng số trang mục lục/danh mục sau lượt dàn trang LibreOffice đầu tiên."""
import argparse,re,subprocess,tempfile
from pathlib import Path
from docx import Document

ap=argparse.ArgumentParser();ap.add_argument('docx',type=Path);ap.add_argument('pdf',type=Path);a=ap.parse_args()
with tempfile.TemporaryDirectory() as td:
    out=Path(td)/'pages.txt'
    subprocess.run(['pdftotext','-layout',str(a.pdf),str(out)],check=True)
    pages=out.read_text(errors='replace').split('\f')
if pages and not pages[-1].strip(): pages.pop()
def norm(s): return re.sub(r'\s+',' ',s).strip()
npages=[norm(x) for x in pages]
chapter='CHƯƠNG I. CƠ SỞ LÝ THUYẾT VỀ CÔNG NGHỆ BLOCKCHAIN'
body_page=next((i+1 for i,x in enumerate(npages) if i>=9 and chapter in x),None)
if body_page is None: raise SystemExit('Không xác định được trang bắt đầu Chương I')

def roman(n):
    vals=((1000,'m'),(900,'cm'),(500,'d'),(400,'cd'),(100,'c'),(90,'xc'),(50,'l'),(40,'xl'),(10,'x'),(9,'ix'),(5,'v'),(4,'iv'),(1,'i'))
    out=''
    for v,s in vals:
        while n>=v: out+=s;n-=v
    return out

def label(physical):
    return str(physical-body_page+1) if physical>=body_page else roman(physical-2)

def find_page(text):
    t=norm(text)
    # Hai đề mục đầu nằm trước Chương I; yêu cầu chúng xuất hiện ở đầu trang để tránh khớp mục lục.
    if t in ('LỜI CẢM ƠN','LỜI NÓI ĐẦU'):
        for i,x in enumerate(npages,1):
            if i>=7 and x.startswith(t): return i
        return None
    # Các đề mục, hình và bảng còn lại đều thuộc phần nội dung chính.
    for i,x in enumerate(npages,1):
        if i<body_page: continue
        if t in x: return i
    # Ghép tiền tố/hậu tố để chịu ngắt dòng và thay đổi nhỏ do công thức.
    words=t.split(); probes=[' '.join(words[:min(8,len(words))]),' '.join(words[-min(8,len(words)):])]
    for i,x in enumerate(npages,1):
        if i<body_page: continue
        if all(p in x for p in probes if p): return i
    return None

doc=Document(a.docx); changed=0; missing=[]
for p in doc.paragraphs:
    if p.style.name not in ('TOC 1','TOC 2','TOC 3','Mục lục hình','Mục lục bảng'): continue
    # Phần chữ đứng trước tab; python-docx hiển thị trường PAGEREF chưa tính là số 0.
    text=p.text.split('\t',1)[0].strip()
    if not text: continue
    physical=find_page(text)
    if physical is None:
        missing.append(text);continue
    p.text=text+'\t'+label(physical);changed+=1
if missing:
    raise SystemExit('Không tìm thấy trang cho:\n- '+'\n- '.join(missing))
doc.save(a.docx)
print(f'Đã đóng băng {changed} số trang; Chương I bắt đầu tại trang vật lý {body_page}.')
