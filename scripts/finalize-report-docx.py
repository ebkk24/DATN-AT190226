#!/usr/bin/env python3
"""Chuẩn hóa DOCX đồ án theo mẫu CDCS của Học viện Kỹ thuật mật mã."""
import argparse, copy, re
from pathlib import Path
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_ROW_HEIGHT_RULE, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
BODY_FONT='Times New Roman'


def set_font(run, name=BODY_FONT, size=14, bold=None, italic=None):
    run.font.name=name; run.font.size=Pt(size); run.font.color.rgb=RGBColor(0,0,0)
    run._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),name)
    if bold is not None: run.bold=bold
    if italic is not None: run.italic=italic


def set_run_fonts(paragraph, name=BODY_FONT, size=14, bold=None, italic=None):
    for run in paragraph.runs: set_font(run,name,size,bold,italic)


def shade_cell(cell, fill):
    tcPr=cell._tc.get_or_add_tcPr(); shd=tcPr.find(qn('w:shd'))
    if shd is None: shd=OxmlElement('w:shd'); tcPr.append(shd)
    shd.set(qn('w:fill'),fill)


def set_cell_margins(cell, top=80, start=90, bottom=80, end=90):
    tc=cell._tc; tcPr=tc.get_or_add_tcPr(); tcMar=tcPr.first_child_found_in('w:tcMar')
    if tcMar is None: tcMar=OxmlElement('w:tcMar'); tcPr.append(tcMar)
    for m,v in [('top',top),('start',start),('bottom',bottom),('end',end)]:
        node=tcMar.find(qn('w:'+m))
        if node is None: node=OxmlElement('w:'+m); tcMar.append(node)
        node.set(qn('w:w'),str(v)); node.set(qn('w:type'),'dxa')


def set_repeat_table_header(row):
    trPr=row._tr.get_or_add_trPr(); e=OxmlElement('w:tblHeader'); e.set(qn('w:val'),'true'); trPr.append(e)


def set_cant_split(row):
    trPr=row._tr.get_or_add_trPr(); e=OxmlElement('w:cantSplit'); trPr.append(e)


def paragraph_text(el):
    return ''.join((node.text or '') for node in el.iter(qn('w:t'))).strip()


def make_paragraph(text='', style=None, align=None, page_break_before=False):
    p=OxmlElement('w:p'); pPr=OxmlElement('w:pPr'); p.append(pPr)
    if style:
        ps=OxmlElement('w:pStyle'); ps.set(qn('w:val'),style); pPr.append(ps)
    if align:
        jc=OxmlElement('w:jc'); jc.set(qn('w:val'),align); pPr.append(jc)
    if page_break_before:
        pb=OxmlElement('w:pageBreakBefore'); pPr.append(pb)
    if text:
        r=OxmlElement('w:r'); rPr=OxmlElement('w:rPr'); r.append(rPr)
        rf=OxmlElement('w:rFonts'); rf.set(qn('w:ascii'),BODY_FONT); rf.set(qn('w:hAnsi'),BODY_FONT); rf.set(qn('w:eastAsia'),BODY_FONT); rPr.append(rf)
        sz=OxmlElement('w:sz'); sz.set(qn('w:val'),'28'); rPr.append(sz)
        t=OxmlElement('w:t'); t.text=text; r.append(t); p.append(r)
    return p


def make_page_break():
    p=make_paragraph(); r=OxmlElement('w:r'); br=OxmlElement('w:br'); br.set(qn('w:type'),'page'); r.append(br); p.append(r); return p


def add_bookmark(paragraph, name, ident):
    start=OxmlElement('w:bookmarkStart'); start.set(qn('w:id'),str(ident)); start.set(qn('w:name'),name)
    end=OxmlElement('w:bookmarkEnd'); end.set(qn('w:id'),str(ident))
    paragraph._p.insert(0,start); paragraph._p.append(end)


def add_pageref(p, bookmark):
    r=OxmlElement('w:r'); tab=OxmlElement('w:tab'); r.append(tab); p.append(r)
    begin=OxmlElement('w:fldChar'); begin.set(qn('w:fldCharType'),'begin'); begin.set(qn('w:dirty'),'true')
    instr=OxmlElement('w:instrText'); instr.set(qn('xml:space'),'preserve'); instr.text=f' PAGEREF {bookmark} \\h '
    sep=OxmlElement('w:fldChar'); sep.set(qn('w:fldCharType'),'separate')
    val=OxmlElement('w:t'); val.text='0'
    end=OxmlElement('w:fldChar'); end.set(qn('w:fldCharType'),'end')
    for node in (begin,instr,sep,val,end):
        rr=OxmlElement('w:r'); rr.append(node); p.append(rr)


def make_index_entry(text, bookmark, level=1):
    p=make_paragraph(text,style=f'TOC {min(level,3)}')
    pPr=p.find(qn('w:pPr'))
    tabs=OxmlElement('w:tabs'); tab=OxmlElement('w:tab'); tab.set(qn('w:val'),'right'); tab.set(qn('w:leader'),'dot'); tab.set(qn('w:pos'),'8787'); tabs.append(tab); pPr.append(tabs)
    ind=OxmlElement('w:ind'); ind.set(qn('w:left'),str((level-1)*360)); ind.set(qn('w:hanging'),'0'); ind.set(qn('w:right'),'0'); pPr.append(ind)
    add_pageref(p,bookmark)
    return p


def make_section_break(template_sectpr):
    p=make_paragraph(); pPr=p.find(qn('w:pPr')); sect=copy.deepcopy(template_sectpr)
    typ=sect.find(qn('w:type'))
    if typ is None: typ=OxmlElement('w:type'); sect.insert(0,typ)
    typ.set(qn('w:val'),'nextPage'); pPr.append(sect); return p


def set_page_num_type(section, fmt, start):
    sectPr=section._sectPr; node=sectPr.find(qn('w:pgNumType'))
    if node is None: node=OxmlElement('w:pgNumType'); sectPr.append(node)
    node.set(qn('w:fmt'),fmt); node.set(qn('w:start'),str(start))


def page_field(paragraph):
    paragraph.alignment=WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.first_line_indent=Cm(0)
    begin=OxmlElement('w:fldChar'); begin.set(qn('w:fldCharType'),'begin')
    instr=OxmlElement('w:instrText'); instr.set(qn('xml:space'),'preserve'); instr.text=' PAGE '
    sep=OxmlElement('w:fldChar'); sep.set(qn('w:fldCharType'),'separate')
    txt=OxmlElement('w:t'); txt.text='1'
    end=OxmlElement('w:fldChar'); end.set(qn('w:fldCharType'),'end')
    for node in (begin,instr,sep,txt,end):
        r=paragraph.add_run(); r._r.append(node); set_font(r,size=13)


def style_by_name(doc,name):
    return next((s for s in doc.styles if s.name == name), None)

def ensure_style(doc,name,base=None):
    existing=style_by_name(doc,name)
    if existing is not None: return existing
    st=doc.styles.add_style(name,WD_STYLE_TYPE.PARAGRAPH)
    if base:
        bs=style_by_name(doc,base)
        if bs is not None: st.base_style=bs
    return st


def configure_styles(doc):
    normal=style_by_name(doc,'Normal'); normal.font.name=BODY_FONT; normal.font.size=Pt(14)
    normal._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),BODY_FONT)
    pf=normal.paragraph_format; pf.alignment=WD_ALIGN_PARAGRAPH.JUSTIFY; pf.line_spacing=1.3; pf.space_before=Pt(0); pf.space_after=Pt(0); pf.first_line_indent=Cm(1.25); pf.widow_control=True
    for n in ('Body Text','First Paragraph'):
        st=style_by_name(doc,n)
        if st is None: continue
        st.font.name=BODY_FONT; st.font.size=Pt(14); st._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),BODY_FONT)
        st.paragraph_format.alignment=WD_ALIGN_PARAGRAPH.JUSTIFY; st.paragraph_format.line_spacing=1.3; st.paragraph_format.space_after=Pt(0); st.paragraph_format.first_line_indent=Cm(1.25)
    for name,size,bold,italic,before,after,first,center in [
        ('Title',16,True,False,0,12,0,True),('Heading 1',14,True,False,12,12,0,True),
        ('Heading 2',14,True,False,9,3,0,False),('Heading 3',14,True,True,6,3,0,False),
        ('Heading 4',14,True,False,6,3,0,False)]:
        st=style_by_name(doc,name)
        if st is None: st=doc.styles.add_style(name,WD_STYLE_TYPE.PARAGRAPH)
        st.font.name=BODY_FONT; st.font.size=Pt(size); st.font.bold=bold; st.font.italic=italic; st.font.color.rgb=RGBColor(0,0,0); st._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),BODY_FONT)
        f=st.paragraph_format; f.space_before=Pt(before); f.space_after=Pt(after); f.first_line_indent=Cm(first); f.keep_with_next=True; f.keep_together=True
        if center: f.alignment=WD_ALIGN_PARAGRAPH.CENTER
    style_by_name(doc,'Heading 1').paragraph_format.page_break_before=True
    for name in ('Caption','Tên hình vẽ','Tên bảng'):
        st=ensure_style(doc,name,'Caption'); st.font.name=BODY_FONT; st.font.size=Pt(14); st.font.italic=True; st.font.color.rgb=RGBColor(0,0,0); st._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),BODY_FONT)
        st.paragraph_format.alignment=WD_ALIGN_PARAGRAPH.CENTER; st.paragraph_format.first_line_indent=Cm(0); st.paragraph_format.space_before=Pt(3); st.paragraph_format.space_after=Pt(6); st.paragraph_format.keep_with_next=True
    for level in range(1,4):
        name=f'TOC {level}'; st=ensure_style(doc,name,'Normal'); st.font.name=BODY_FONT; st.font.size=Pt(14); st.font.bold=(level==1); st._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),BODY_FONT)
        st.paragraph_format.first_line_indent=Cm(0); st.paragraph_format.space_before=Pt(1); st.paragraph_format.space_after=Pt(1); st.paragraph_format.line_spacing=1.15
    for name in ('Code','Source Code'):
        st=style_by_name(doc,name)
        if st is None: continue
        st.font.name='Courier New'; st.font.size=Pt(9); st._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),'Courier New')
        st.paragraph_format.first_line_indent=Cm(0); st.paragraph_format.line_spacing=1.0; st.paragraph_format.space_after=Pt(0)



def rebuild_source_tables(doc):
    """Dựng lại bảng Pandoc bằng WordprocessingML thuần.

    Reference DOCX của mẫu có paragraph style id `Table`; Pandoc nhầm id này là
    table style. LibreOffice 7.3 vì vậy tách chữ trong ô thành các đoạn rời khi nhập
    DOCX. Dựng lại bảng và dùng table style `TableGrid` loại bỏ lỗi tương thích đó.
    """
    for old in list(doc.tables):
        data=[[cell.text for cell in row.cells] for row in old.rows]
        if not data: continue
        cols=max(len(row) for row in data)
        new=doc.add_table(rows=len(data),cols=cols)
        for i,row in enumerate(data):
            for j,value in enumerate(row):
                new.cell(i,j).text=value
        tblStyle=new._tbl.tblPr.find(qn('w:tblStyle'))
        if tblStyle is None:
            tblStyle=OxmlElement('w:tblStyle'); new._tbl.tblPr.insert(0,tblStyle)
        tblStyle.set(qn('w:val'),'TableGrid')
        old._tbl.addprevious(new._tbl)
        old._element.getparent().remove(old._element)


def create_cover_table(doc):
    table=doc.add_table(rows=1,cols=1); table.alignment=WD_TABLE_ALIGNMENT.CENTER; table.autofit=False
    table.columns[0].width=Cm(16.5)
    cell=table.cell(0,0); cell.width=Cm(16.5); cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.TOP
    tcPr=cell._tc.get_or_add_tcPr(); borders=OxmlElement('w:tcBorders')
    for edge in ('top','left','bottom','right','insideH','insideV'):
        el=OxmlElement('w:'+edge); el.set(qn('w:val'),'nil'); borders.append(el)
    tcPr.append(borders); set_cell_margins(cell,0,0,0,0)
    # Xóa đoạn mặc định rồi tạo bố cục bìa theo mẫu.
    p0=cell.paragraphs[0]; p0._element.getparent().remove(p0._element)
    def line(text='',size=14,bold=False,before=0,after=0,breaks=None):
        p=cell.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.first_line_indent=Cm(0); p.paragraph_format.space_before=Pt(before); p.paragraph_format.space_after=Pt(after); p.paragraph_format.line_spacing=1.15
        parts=breaks if breaks is not None else [text]
        for i,part in enumerate(parts):
            if i: p.add_run().add_break()
            r=p.add_run(part); set_font(r,BODY_FONT,size,bold=bold)
        return p
    line('BAN CƠ YẾU CHÍNH PHỦ',14,True)
    line('HỌC VIỆN KỸ THUẬT MẬT MÃ',14,True)
    line('¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯',14,False)
    line('ĐỒ ÁN TỐT NGHIỆP',16,True,before=38)
    line(size=18,bold=True,before=28,breaks=['NGHIÊN CỨU PHÁT TRIỂN HỆ THỐNG THÔNG TIN','HỖ TRỢ QUẢN LÝ VĂN BẰNG CHỨNG CHỈ','DỰA TRÊN NỀN TẢNG BLOCKCHAIN'])
    line('Ngành: An toàn thông tin',14,False,before=30)
    line('Mã số: 7.48.02.02',14,False,after=2)
    line('Sinh viên thực hiện: Phạm Đức Khải – MSSV: AT190226',14,False,before=28)
    line('Người hướng dẫn: TS. Trần Trung',14,False,before=20)
    line('Khoa CNTT – Trường Đại học Điện lực',14,False)
    line('Hà Nội, 2026',14,True,before=52)
    return table._tbl

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('docx'); args=ap.parse_args(); path=Path(args.docx)
    doc=Document(path); configure_styles(doc); rebuild_source_tables(doc)
    # Khổ A4 và lề theo mẫu CDCS.
    for sec in doc.sections:
        sec.page_width=Cm(21); sec.page_height=Cm(29.7); sec.top_margin=Cm(2); sec.bottom_margin=Cm(2); sec.left_margin=Cm(3); sec.right_margin=Cm(1.5); sec.header_distance=Cm(1); sec.footer_distance=Cm(1)
    # Định dạng đoạn, tiêu đề, chú thích và loại màu liên kết khỏi bản in.
    image_captions=[]; table_captions=[]; heading_entries=[]; bid=1
    for p in doc.paragraphs:
        t=' '.join(p.text.split())
        sty=p.style.name if p.style else ''
        if sty.startswith('Heading'):
            level=int(sty.split()[-1]) if sty.split()[-1].isdigit() else 1
            set_run_fonts(p,BODY_FONT,14,bold=True,italic=(level==3))
            if level==1: p.alignment=WD_ALIGN_PARAGRAPH.CENTER
            name=f'_h{bid}'; add_bookmark(p,name,bid); bid+=1
            heading_entries.append((t,name,min(level,3),p))
        elif t.startswith('Hình ') and re.match(r'^Hình\s+\d',t) and not t.endswith('.'):
            p.style=style_by_name(doc,'Tên hình vẽ'); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; set_run_fonts(p,BODY_FONT,14,italic=True)
            name=f'_fig{bid}'; add_bookmark(p,name,bid); bid+=1; image_captions.append((t,name))
        elif t.startswith('Bảng ') and re.match(r'^Bảng\s+\d',t) and not t.endswith('.'):
            p.style=style_by_name(doc,'Tên bảng'); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; set_run_fonts(p,BODY_FONT,14,italic=True)
            name=f'_tbl{bid}'; add_bookmark(p,name,bid); bid+=1; table_captions.append((t,name))
        elif sty in ('Code','Source Code') or t.startswith(('$ ','npm ','docker ','git ')):
            set_run_fonts(p,'Courier New',9); p.paragraph_format.first_line_indent=Cm(0)
        else:
            set_run_fonts(p,BODY_FONT,14)
            if t and sty not in ('TOC Heading','Title'):
                p.paragraph_format.alignment=WD_ALIGN_PARAGRAPH.JUSTIFY
    # Hình riêng một dòng, căn giữa và không thụt đầu dòng.
    for p in doc.paragraphs:
        if any(True for _ in p._p.iter(qn('w:drawing'))):
            p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.first_line_indent=Cm(0); p.paragraph_format.space_before=Pt(6); p.paragraph_format.space_after=Pt(0); p.paragraph_format.keep_with_next=True
    # Bảng dễ đọc, lặp hàng tiêu đề, không chia hàng qua trang.
    for table in doc.tables:
        text=' '.join(c.text for row in table.rows for c in row.cells)
        if 'BAN CƠ YẾU CHÍNH PHỦ' in text: continue
        table.alignment=WD_TABLE_ALIGNMENT.CENTER; table.autofit=False
        # Pandoc dùng style id "Table"; trong mẫu CDCS đây là style đoạn, không phải style bảng.
        # Chuyển sang TableGrid để Word và LibreOffice không tách nội dung ô thành đoạn rời.
        tblStyle=table._tbl.tblPr.find(qn('w:tblStyle'))
        if tblStyle is None:
            tblStyle=OxmlElement('w:tblStyle'); table._tbl.tblPr.insert(0,tblStyle)
        tblStyle.set(qn('w:val'),'TableGrid')
        if table.rows: set_repeat_table_header(table.rows[0])
        for ri,row in enumerate(table.rows):
            set_cant_split(row)
            for cell in row.cells:
                cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER; set_cell_margins(cell)
                if ri==0: shade_cell(cell,'D9E2F3')
                for p in cell.paragraphs:
                    p.paragraph_format.first_line_indent=Cm(0); p.paragraph_format.space_before=Pt(0); p.paragraph_format.space_after=Pt(0); p.paragraph_format.line_spacing=1.05
                    p.alignment=WD_ALIGN_PARAGRAPH.CENTER if ri==0 else WD_ALIGN_PARAGRAPH.LEFT
                    set_run_fonts(p,BODY_FONT,(10.5 if len(table.columns)<=4 else 9 if len(table.columns)<=6 else 8),bold=True if ri==0 else None)
    body=doc._element.body; children=list(body)
    final_sect=body.sectPr
    # Tạo bìa độc lập với nội dung tham chiếu; xóa mục lục động do Pandoc tạo.
    toc_sdt=None
    for ch in children:
        if ch.tag==qn('w:sdt') and 'MỤC LỤC' in paragraph_text(ch): toc_sdt=ch
    if toc_sdt is not None: body.remove(toc_sdt)
    cover=create_cover_table(doc)
    body.remove(cover)
    first_content=None
    for p in doc.paragraphs:
        if p.style and p.style.name=='Heading 1' and p.text.strip()=='LỜI CẢM ƠN': first_content=p._p; break
    if first_content is None: raise RuntimeError('Không tìm thấy phần LỜI CẢM ƠN')
    # Hai trang bìa theo yêu cầu mẫu.
    insert_at=0
    body.insert(insert_at,copy.deepcopy(cover)); insert_at+=1
    pb=make_paragraph(); r=OxmlElement('w:r'); br=OxmlElement('w:br'); br.set(qn('w:type'),'page'); r.append(br); pb.append(r); body.insert(insert_at,pb); insert_at+=1
    body.insert(insert_at,copy.deepcopy(cover)); insert_at+=1
    # Section break: bìa không đánh số, phần đầu dùng số La Mã.
    body.insert(insert_at,make_section_break(final_sect)); insert_at+=1
    # Mục lục tĩnh có trường PAGEREF để Word/LibreOffice cập nhật số trang chính xác.
    title=make_paragraph('MỤC LỤC',style='Title',align='center'); body.insert(insert_at,title); insert_at+=1
    for text,bm,level,_ in heading_entries:
        if text=='LỜI CẢM ƠN' or text=='LỜI NÓI ĐẦU' or text.startswith(('CHƯƠNG','KẾT LUẬN','TÀI LIỆU THAM KHẢO','PHỤ LỤC')) or level>1:
            body.insert(insert_at,make_index_entry(text,bm,level)); insert_at+=1
    # Danh mục ký hiệu và chữ viết tắt.
    abbr=[('API','Giao diện lập trình ứng dụng'),('BFT','Khả năng chịu lỗi Byzantine'),('CFT','Khả năng chịu lỗi dừng'),('DLT','Công nghệ sổ cái phân tán'),('E2E','Kiểm thử đầu cuối'),('HTTP','Giao thức truyền siêu văn bản'),('JWT','Mã thông báo Web JSON'),('MFA','Xác thực đa yếu tố'),('OP_RETURN','Trường dữ liệu trong giao dịch Bitcoin'),('PoS','Cơ chế đồng thuận bằng cổ phần'),('PoW','Cơ chế đồng thuận bằng công việc'),('RBAC','Kiểm soát truy cập dựa trên vai trò'),('RPC','Cơ chế gọi thủ tục từ xa'),('SSRF','Giả mạo yêu cầu phía máy chủ'),('TLS','Bảo mật tầng truyền tải'),('UUID','Định danh duy nhất toàn cục'),('WIF','Định dạng nhập khóa ví')]
    body.insert(insert_at,make_page_break()); insert_at+=1
    body.insert(insert_at,make_paragraph('DANH MỤC KÝ HIỆU VÀ CHỮ VIẾT TẮT',style='Title',align='center')); insert_at+=1
    for a,v in abbr:
        p=make_paragraph(); pPr=p.find(qn('w:pPr')); ind=OxmlElement('w:ind'); ind.set(qn('w:firstLine'),'0'); pPr.append(ind)
        for text,bold in [(a,True),(' — '+v,False)]:
            r=OxmlElement('w:r'); rp=OxmlElement('w:rPr'); r.append(rp)
            rf=OxmlElement('w:rFonts'); rf.set(qn('w:ascii'),BODY_FONT); rf.set(qn('w:hAnsi'),BODY_FONT); rf.set(qn('w:eastAsia'),BODY_FONT); rp.append(rf)
            sz=OxmlElement('w:sz'); sz.set(qn('w:val'),'28'); rp.append(sz)
            if bold: rp.append(OxmlElement('w:b'))
            tx=OxmlElement('w:t'); tx.text=text; r.append(tx); p.append(r)
        body.insert(insert_at,p); insert_at+=1
    # Danh mục hình và bảng với trường số trang.
    body.insert(insert_at,make_page_break()); insert_at+=1
    body.insert(insert_at,make_paragraph('DANH MỤC HÌNH VẼ',style='Title',align='center')); insert_at+=1
    for text,bm in image_captions: body.insert(insert_at,make_index_entry(text,bm,1)); insert_at+=1
    body.insert(insert_at,make_page_break()); insert_at+=1
    body.insert(insert_at,make_paragraph('DANH MỤC BẢNG',style='Title',align='center')); insert_at+=1
    for text,bm in table_captions: body.insert(insert_at,make_index_entry(text,bm,1)); insert_at+=1
    # Section break ngay trước Chương I: phần nội dung đánh số Ả Rập từ 1.
    chapter1=None
    for p in doc.paragraphs:
        if p.style and p.style.name=='Heading 1' and p.text.strip().startswith('CHƯƠNG I.'):
            chapter1=p._p; break
    if chapter1 is None: raise RuntimeError('Không tìm thấy CHƯƠNG I')
    chapter1.addprevious(make_section_break(final_sect))
    # Loại đoạn trống thừa ở đầu tài liệu giữa các phần do pipeline cũ tạo ra.
    doc.core_properties.title='Đồ án tốt nghiệp – Hệ thống quản lý văn bằng chứng chỉ dựa trên Blockchain'
    doc.core_properties.author='Phạm Đức Khải – AT190226'
    doc.core_properties.subject='Đồ án tốt nghiệp ngành An toàn thông tin'
    doc.settings.element.append(OxmlElement('w:updateFields')); doc.settings.element[-1].set(qn('w:val'),'true')
    doc.save(path)
    # Nạp lại để python-docx nhận đủ ba section và cấu hình đánh số/footer.
    doc=Document(path)
    if len(doc.sections)!=3: raise RuntimeError(f'Số section không đúng: {len(doc.sections)}')
    for sec in doc.sections:
        sec.page_width=Cm(21); sec.page_height=Cm(29.7); sec.top_margin=Cm(2); sec.bottom_margin=Cm(2); sec.left_margin=Cm(3); sec.right_margin=Cm(1.5); sec.header_distance=Cm(1); sec.footer_distance=Cm(1)
    # Bìa: không số trang.
    doc.sections[0].footer.is_linked_to_previous=False
    for p in doc.sections[0].footer.paragraphs: p._element.getparent().remove(p._element)
    # Phần đầu: i, ii, iii...; nội dung: 1, 2, 3...
    for idx,(fmt,start) in enumerate([('lowerRoman',1),('decimal',1)],start=1):
        sec=doc.sections[idx]; sec.footer.is_linked_to_previous=False
        ft=sec.footer
        for p in list(ft.paragraphs): p._element.getparent().remove(p._element)
        p=ft.add_paragraph(); page_field(p); set_page_num_type(sec,fmt,start)
    # Không lặp header mẫu; mọi trang của phần đầu và phần chính đều hiện số.
    for sec in doc.sections:
        sec.header.is_linked_to_previous=False
        for p in sec.header.paragraphs:
            p.clear(); p.paragraph_format.space_after=Pt(0)
        for node in list(sec._sectPr.findall(qn('w:titlePg'))):
            sec._sectPr.remove(node)
    # Hai trang bìa tuyệt đối không có tham chiếu đầu/chân trang.
    for tag in ('w:headerReference','w:footerReference'):
        for node in list(doc.sections[0]._sectPr.findall(qn(tag))):
            doc.sections[0]._sectPr.remove(node)
    doc.save(path)
    print(f'Đã chuẩn hóa {path}: {len(image_captions)} hình, {len(table_captions)} bảng, {len(heading_entries)} đề mục, 3 section.')

if __name__=='__main__': main()
