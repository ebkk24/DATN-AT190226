import { useState } from "react";
import { api } from "../api";

export default function Maker() {
  const [studentCode, setStudentCode] = useState("");
  const [pubkey, setPubkey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await api.requestIssue({
        studentCode: studentCode.trim().toUpperCase(),
        pubkey: pubkey.trim(),
      });
      setMessage(`Đã lập phiếu ${result.id.slice(0, 8)} — đang chờ Checker duyệt.`);
      setStudentCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lập phiếu");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MAKER</p>
          <h2>Lập phiếu cấp văn bằng</h2>
          <p className="muted">Họ tên được lấy từ hồ sơ Student theo mã sinh viên, không nhập thủ công.</p>
        </div>
        <span className="status-chip pending">Chưa ghi blockchain</span>
      </div>
      <form onSubmit={submit} className="card form-grid">
        <label>
          Mã sinh viên
          <input
            value={studentCode}
            onChange={(event) => setStudentCode(event.target.value)}
            placeholder="Ví dụ: AT180001"
            required
          />
        </label>
        <label className="full-width">
          Địa chỉ nhận / public key
          <input
            value={pubkey}
            onChange={(event) => setPubkey(event.target.value)}
            placeholder="Địa chỉ Bitcoin regtest của người nhận"
            required
          />
        </label>
        <div className="form-actions full-width">
          <button className="button primary" disabled={busy}>
            {busy ? "Đang lập phiếu…" : "Lập phiếu"}
          </button>
        </div>
        {message && <div className="alert success full-width">{message}</div>}
        {error && <div className="alert error full-width">{error}</div>}
      </form>
    </section>
  );
}
