#!/usr/bin/env python3
"""Cập nhật mục lục DOCX bằng LibreOffice UNO rồi xuất PDF."""
import argparse,subprocess,tempfile,time,os,sys
from pathlib import Path
import uno
from com.sun.star.beans import PropertyValue

def prop(name,value):
    p=PropertyValue();p.Name=name;p.Value=value;return p
ap=argparse.ArgumentParser();ap.add_argument('soffice');ap.add_argument('docx');ap.add_argument('pdf');a=ap.parse_args()
docx=Path(a.docx).resolve();pdf=Path(a.pdf).resolve()
with tempfile.TemporaryDirectory() as profile:
    port=20883
    cmd=[a.soffice,'--headless',f'-env:UserInstallation=file://{profile}','--accept='+f'socket,host=127.0.0.1,port={port};urp;StarOffice.ComponentContext','--norestore','--nodefault','--nofirststartwizard']
    proc=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        local=uno.getComponentContext();resolver=local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver',local)
        ctx=None
        for _ in range(80):
            try: ctx=resolver.resolve(f'uno:socket,host=127.0.0.1,port={port};urp;StarOffice.ComponentContext');break
            except Exception: time.sleep(.25)
        if ctx is None: raise RuntimeError('Không kết nối được LibreOffice UNO')
        desktop=ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop',ctx)
        doc=desktop.loadComponentFromURL(uno.systemPathToFileUrl(str(docx)),'_blank',0,(prop('Hidden',True),prop('ReadOnly',False)))
        if doc is None: raise RuntimeError('Không mở được DOCX')
        indexes=doc.getDocumentIndexes()
        for i in range(indexes.getCount()): indexes.getByIndex(i).update()
        doc.store()
        doc.storeToURL(uno.systemPathToFileUrl(str(pdf)),(prop('FilterName','writer_pdf_Export'),prop('Overwrite',True)))
        doc.close(True)
    finally:
        proc.terminate()
        try: proc.wait(timeout=10)
        except subprocess.TimeoutExpired: proc.kill()
