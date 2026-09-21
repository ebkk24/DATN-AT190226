import { useMemo, useState } from "react";
import { api, type RecipientInput } from "../api";

const columns = ["studentCode","degreeName","major","educationLevel","graduationRank","graduationYear","issueDate","diplomaNumber","trainingMode","pubkey"] as const;
const sample = `studentCode,degreeName,major,educationLevel,graduationRank,graduationYear,issueDate,diplomaNumber,trainingMode,pubkey
AT190226,Bằng tốt nghiệp đại học,An Toàn Thông Tin,Đại học,Giỏi,2027,2027-06-30,KMA-2027-0001,Chính quy,mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT`;

function csvFields(line: string) {
  const fields: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { fields.push(value.trim()); value = ""; }
    else value += char;
  }
  if (quoted) throw new Error("dấu ngoặc kép chưa đóng");
  fields.push(value.trim()); return fields;
}

export function parseCsv(text: string): RecipientInput[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV phải có dòng tiêu đề và ít nhất một bản ghi");
  const header = csvFields(lines[0]).map((x) => x.replace(/^\uFEFF/, ""));
  if (header.join(",") !== columns.join(",")) throw new Error(`Dòng 1 phải đúng tiêu đề: ${columns.join(",")}`);
  if (lines.length - 1 > 500) throw new Error("Mỗi lô tối đa 500 bản ghi");
  return lines.slice(1).map((line, index) => {
    const lineNo = index + 2; let values: string[];
    try { values = csvFields(line); } catch (error) { throw new Error(`Dòng ${lineNo}: ${(error as Error).message}`); }
    if (values.length !== columns.length) throw new Error(`Dòng ${lineNo}: cần đúng ${columns.length} cột, hiện có ${values.length}`);
    const row = Object.fromEntries(columns.map((key, i) => [key, values[i]])) as Record<(typeof columns)[number], string>;
    const missing = columns.find((key) => !row[key]);
    if (missing) throw new Error(`Dòng ${lineNo}: thiếu ${missing}`);
    const year = Number(row.graduationYear);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error(`Dòng ${lineNo}: graduationYear không hợp lệ`);
    return { ...row, studentCode: row.studentCode.toUpperCase(), diplomaNumber: row.diplomaNumber.toUpperCase(), graduationYear: year } as RecipientInput;
  });
}

export default function BatchMaker() {
  const [raw, setRaw] = useState(sample); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const lineCount = useMemo(() => Math.max(0, raw.split(/\r?\n/).filter((line) => line.trim()).length - 1), [raw]);
  function downloadTemplate() { const blob = new Blob([sample + "\n"], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "mau-cap-van-bang.csv"; a.click(); URL.revokeObjectURL(url); }
  async function submit(event: React.FormEvent) { event.preventDefault(); setMessage(""); setError(""); setBusy(true); try { const recipients = parseCsv(raw); const result = await api.requestBatch(recipients); setMessage(`Đã lập ${result.count} phiếu trong lô ${result.batchId.slice(0, 8)} — chờ Checker duyệt.`); } catch (err) { setError(err instanceof Error ? err.message : "Không thể lập lô"); } finally { setBusy(false); } }
  return <section className="page-section">
    <div className="section-heading"><div><p className="eyebrow">MAKER · BATCH</p><h2>Lập phiếu theo lô CSV</h2><p className="muted">Tối đa 500 bản ghi; backend tra cứu và chụp hồ sơ Student theo từng mã.</p></div><span className="count-badge">{lineCount}/500 bản ghi</span></div>
    <form onSubmit={submit} className="card form-stack">
      <div className="form-actions"><button type="button" className="button secondary" onClick={downloadTemplate}>Tải tệp CSV mẫu</button></div>
      <label>Nội dung CSV<textarea rows={16} value={raw} onChange={(e) => setRaw(e.target.value)} spellCheck={false} required /></label>
      <div className="hint">Thứ tự cột bắt buộc: <code>{columns.join(", ")}</code>. Lỗi cú pháp được báo theo số dòng.</div>
      <div className="form-actions"><button className="button primary" disabled={busy || lineCount === 0}>{busy ? "Đang tạo lô…" : `Tạo ${lineCount || ""} phiếu`}</button></div>
      {message && <div className="alert success">{message}</div>}{error && <div className="alert error">{error}</div>}
    </form>
  </section>;
}
