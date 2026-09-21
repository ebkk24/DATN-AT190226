import { useMemo, useState } from "react";
import { api, type RecipientInput } from "../api";

function parseRows(text: string, defaultPubkey: string): RecipientInput[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Chưa có dữ liệu sinh viên");
  if (lines.length > 500) throw new Error("Mỗi lô tối đa 500 sinh viên");
  return lines.map((line, index) => {
    const [studentCode = "", customPubkey = ""] = line
      .split("|")
      .map((part) => part.trim());
    const pubkey = customPubkey || defaultPubkey.trim();
    if (!studentCode) throw new Error(`Dòng ${index + 1} thiếu mã sinh viên`);
    if (!pubkey) throw new Error(`Dòng ${index + 1} thiếu public key`);
    return { studentCode: studentCode.toUpperCase(), pubkey };
  });
}

export default function BatchMaker() {
  const [defaultPubkey, setDefaultPubkey] = useState("");
  const [raw, setRaw] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lineCount = useMemo(
    () => raw.split(/\r?\n/).filter((line) => line.trim()).length,
    [raw],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    setBusy(true);
    try {
      const recipients = parseRows(raw, defaultPubkey);
      const result = await api.requestBatch(recipients);
      setMessage(`Đã lập ${result.count} phiếu — chờ Checker duyệt theo lô.`);
      setRaw("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lập lô");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MAKER · BATCH</p>
          <h2>Lập phiếu theo lô</h2>
          <p className="muted">Tối đa 500 hồ sơ; họ tên được lấy từ tài khoản Student.</p>
        </div>
        <span className="count-badge">{lineCount}/500 dòng</span>
      </div>
      <form onSubmit={submit} className="card form-stack">
        <label>
          Public key dùng chung
          <input
            value={defaultPubkey}
            onChange={(event) => setDefaultPubkey(event.target.value)}
            placeholder="Có thể bỏ trống nếu mỗi dòng có public key riêng"
          />
        </label>
        <label>
          Danh sách mã sinh viên
          <textarea
            rows={14}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={"AT180001\nAT180002\nAT180003 | public-key-riêng"}
            required
          />
        </label>
        <div className="hint">
          Định dạng mỗi dòng: <code>Mã sinh viên | public key tùy chọn</code>
        </div>
        <div className="form-actions">
          <button className="button primary" disabled={busy || lineCount === 0}>
            {busy ? "Đang tạo lô…" : `Tạo ${lineCount || ""} phiếu`}
          </button>
        </div>
        {message && <div className="alert success">{message}</div>}
        {error && <div className="alert error">{error}</div>}
      </form>
    </section>
  );
}
