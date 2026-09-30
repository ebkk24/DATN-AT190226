#!/usr/bin/env python3
"""Sinh Hình 3.6-3.8 trực tiếp từ benchmark-summary.json đã công bố."""
from __future__ import annotations
import argparse, json
from pathlib import Path
import matplotlib.pyplot as plt

parser=argparse.ArgumentParser()
parser.add_argument("summary", type=Path)
parser.add_argument("--output-dir", type=Path, default=Path("report-assets"))
a=parser.parse_args()
data=json.loads(a.summary.read_text(encoding="utf-8"))
assert data.get("allPassed") and data.get("runs")==9 and data.get("totalCertificates")==1830
rows=sorted(data["bySize"], key=lambda x:x["size"])
assert [x["size"] for x in rows]==[10,100,500]
a.output_dir.mkdir(parents=True,exist_ok=True)
plt.rcParams.update({"font.family":"DejaVu Sans","font.size":12,"axes.titlesize":15,"axes.labelsize":12})
colors=["#305496","#5B9BD5","#70AD47"]

def save(name):
    plt.tight_layout(); plt.savefig(a.output_dir/name,dpi=160,bbox_inches="tight",facecolor="white"); plt.close()
def labels(ax,bars,fmt):
    for b in bars: ax.text(b.get_x()+b.get_width()/2,b.get_height(),fmt(b.get_height()),ha="center",va="bottom",fontsize=11,fontweight="bold")

sizes=[str(x["size"]) for x in rows]
fig,ax=plt.subplots(figsize=(11,6.6)); vals=[x["approvalToIssuedSecondsMean"] for x in rows]; errs=[x["approvalToIssuedSecondsStd"] for x in rows]
bars=ax.bar(sizes,vals,yerr=errs,capsize=6,color=colors,edgecolor="#1F1F1F",linewidth=.7)
ax.set_title("Thời gian từ duyệt đến phát hành theo kích thước lô"); ax.set_xlabel("Số chứng thư trong lô"); ax.set_ylabel("Thời gian trung bình (giây)"); ax.grid(axis="y",alpha=.25); labels(ax,bars,lambda v:f"{v:.3f}")
save("ch3-06-thoi-gian-batch.png")

fig,ax1=plt.subplots(figsize=(11,6.6)); x=range(3); through=[r["throughputCertificatesPerSecondMean"] for r in rows]; per=[r["secondsPerCertificateMean"] for r in rows]
b1=ax1.bar([i-.18 for i in x],through,width=.36,color="#305496",label="Chứng thư/giây"); ax1.set_ylabel("Thông lượng (chứng thư/giây)"); ax1.set_xticks(list(x),sizes); ax1.set_xlabel("Số chứng thư trong lô"); ax1.grid(axis="y",alpha=.2)
ax2=ax1.twinx(); b2=ax2.bar([i+.18 for i in x],per,width=.36,color="#70AD47",label="Giây/chứng thư"); ax2.set_ylabel("Thời gian bình quân (giây/chứng thư)")
ax1.set_title("Thông lượng và thời gian bình quân trên mỗi chứng thư"); labels(ax1,b1,lambda v:f"{v:.2f}"); labels(ax2,b2,lambda v:f"{v:.3f}")
ax1.legend([b1,b2],["Chứng thư/giây","Giây/chứng thư"],loc="upper left")
save("ch3-07-thong-luong-hieu-qua.png")

fig,(ax1,ax2)=plt.subplots(1,2,figsize=(11,6.6)); cpu=[r["cpuAveragePercentMean"] for r in rows]; rss=[r["backendRssAverageMbMean"] for r in rows]
b1=ax1.bar(sizes,cpu,color=colors,edgecolor="#1F1F1F",linewidth=.7); ax1.set_title("CPU trung bình toàn máy"); ax1.set_xlabel("Kích thước lô"); ax1.set_ylabel("CPU (%)"); ax1.set_ylim(0,max(cpu)*1.25); ax1.grid(axis="y",alpha=.25); labels(ax1,b1,lambda v:f"{v:.1f}%")
b2=ax2.bar(sizes,rss,color=colors,edgecolor="#1F1F1F",linewidth=.7); ax2.set_title("RSS trung bình của backend"); ax2.set_xlabel("Kích thước lô"); ax2.set_ylabel("Bộ nhớ (MiB)"); ax2.set_ylim(0,max(rss)*1.25); ax2.grid(axis="y",alpha=.25); labels(ax2,b2,lambda v:f"{v:.1f}")
fig.suptitle("Mức sử dụng tài nguyên theo kích thước lô",fontsize=15)
save("ch3-08-tai-nguyen.png")
print(json.dumps({"generated":["ch3-06-thoi-gian-batch.png","ch3-07-thong-luong-hieu-qua.png","ch3-08-tai-nguyen.png"],"source":str(a.summary)},ensure_ascii=False))
