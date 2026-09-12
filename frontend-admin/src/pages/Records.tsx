import { useEffect, useMemo, useState } from "react";
import { api, type CertificateRecord, type IssuanceStatus } from "../api";

const labels: Record<IssuanceStatus, string> = {
  pending_approval: "Chờ duyệt",
  queued: "Trong hàng đợi",
  processing: "Đang phát hành",
  issued: "Đã cấp",
  revoked: "Đã thu hồi",
  rejected: "Đã từ chối",
  failed: "Thất bại",
};

export default function Records() {
  const [records, setRecords] = useState<CertificateRecord[]>([]);
  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      setRecords(await api.listAll());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được văn bằng");
    }
  }

  useEffect(() => {
    // Tải trạng thái máy chủ một lần khi màn hình được mở.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, []);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return records.filter((record) => {
      const matchesStatus = status === "all" || record.status === status;
      const matchesText = !keyword || [
        record.recipientName,
        record.identity,
        record.id,
        record.certUid,
        record.txid,
      ].some((value) => String(value || "").toLowerCase().includes(keyword));
      return matchesStatus && matchesText;
    });
  }, [records, query, status]);

  async function revoke(record: CertificateRecord) {
    const reason = window.prompt(
      `Lý do thu hồi văn bằng của ${record.recipientName}:`,
      "Theo quyết định của đơn vị phát hành",
    );
    if (reason === null) return;
    if (!window.confirm("Thu hồi sẽ tạo giao dịch OP_RETURN trên blockchain. Tiếp tục?")) return;
    setBusyId(record.id);
    setError("");
    try {
      const result = await api.revoke(record.id, reason);
      setMessage(`Đã thu hồi. Txid: ${result.revocationTxid}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thu hồi thất bại");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">VĂN BẰNG</p>
          <h2>Danh sách phát hành</h2>
          <p className="muted">Theo dõi trạng thái, giao dịch neo và lịch sử thu hồi.</p>
        </div>
        <span className="count-badge">{filtered.length}/{records.length}</span>
      </div>
      <div className="toolbar card wrap-toolbar">
        <input
          className="search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm theo tên, mã, certUid hoặc txid…"
        />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button className="button secondary" onClick={() => void load()}>Làm mới</button>
      </div>
      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}
      <div className="table-card card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Người nhận</th>
                <th>Trạng thái</th>
                <th>Người duyệt</th>
                <th>Txid phát hành</th>
                <th>Thời gian</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => (
                <tr key={record.id}>
                  <td>
                    <strong>{record.recipientName}</strong>
                    <span className="table-sub mono">{record.identity || record.id.slice(0, 8)}</span>
                  </td>
                  <td>
                    <span className={`status-chip ${record.status}`}>
                      {labels[record.status] || record.status}
                    </span>
                  </td>
                  <td>{record.approvedBy || "—"}</td>
                  <td className="mono" title={record.txid || ""}>
                    {record.txid ? `${record.txid.slice(0, 12)}…` : "—"}
                  </td>
                  <td>{new Date(record.createdAt).toLocaleString("vi-VN")}</td>
                  <td>
                    {record.status === "issued" ? (
                      <button
                        className="button danger ghost small-button"
                        onClick={() => void revoke(record)}
                        disabled={busyId === record.id}
                      >
                        {busyId === record.id ? "Đang thu hồi…" : "Thu hồi"}
                      </button>
                    ) : record.status === "revoked" ? (
                      <span className="muted small">Đã ghi OP_RETURN</span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
