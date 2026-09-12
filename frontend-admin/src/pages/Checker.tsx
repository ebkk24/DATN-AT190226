import { useEffect, useMemo, useState } from "react";
import { api, type CertificateRecord } from "../api";

export default function Checker() {
  const [records, setRecords] = useState<CertificateRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setRecords(await api.listPending());
      setSelected(new Set());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách");
    }
  }

  useEffect(() => {
    // Tải trạng thái máy chủ một lần khi màn hình được mở.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, []);

  const allSelected = useMemo(
    () => records.length > 0 && selected.size === records.length,
    [records, selected],
  );

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(records.map((item) => item.id)));
  }

  async function approveOne(id: string) {
    setBusy(true);
    setError("");
    try {
      await api.approve(id);
      setMessage("Đã duyệt phiếu và chuyển sang hàng đợi phát hành.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Duyệt thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function approveSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.approveBatch(ids);
      setMessage(`Đã duyệt ${result.count} phiếu, job batch #${result.jobId}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Duyệt lô thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: string) {
    const reason = window.prompt("Nhập lý do từ chối:", "Thông tin chưa hợp lệ");
    if (reason === null) return;
    setBusy(true);
    try {
      await api.reject(id, reason);
      setMessage("Đã từ chối phiếu.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Từ chối thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">CHECKER</p>
          <h2>Kiểm tra và phê duyệt</h2>
          <p className="muted">Chỉ phiếu đã duyệt mới được đưa vào hàng đợi blockchain.</p>
        </div>
        <button className="button secondary" onClick={() => void load()} disabled={busy}>
          Làm mới
        </button>
      </div>

      <div className="toolbar card">
        <label className="check-label">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          Chọn tất cả ({records.length})
        </label>
        <button
          className="button primary"
          onClick={() => void approveSelected()}
          disabled={busy || selected.size === 0}
        >
          Duyệt lô {selected.size ? `(${selected.size})` : ""}
        </button>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}
      {!records.length && <div className="empty-state">Không có phiếu chờ duyệt.</div>}

      <div className="record-list">
        {records.map((record) => (
          <article className="record-card card" key={record.id}>
            <input
              aria-label={`Chọn ${record.recipientName}`}
              type="checkbox"
              checked={selected.has(record.id)}
              onChange={() => toggle(record.id)}
            />
            <div className="record-main">
              <strong>{record.recipientName}</strong>
              <span className="mono muted">{record.identity || record.id}</span>
              <span className="mono small break-word">{record.pubkey}</span>
            </div>
            <div className="record-actions">
              <button className="button primary small-button" onClick={() => void approveOne(record.id)} disabled={busy}>
                Duyệt
              </button>
              <button className="button danger ghost small-button" onClick={() => void reject(record.id)} disabled={busy}>
                Từ chối
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
