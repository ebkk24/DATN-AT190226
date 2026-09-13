import { useEffect, useMemo, useState } from "react";
import { api, type AuditRecord } from "../api";

const roleLabels: Record<string, string> = {
  maker: "Maker",
  checker: "Checker",
  student: "Sinh viên",
};

const actionLabels: Record<string, string> = {
  register: "Tạo tài khoản",
  login: "Đăng nhập",
  request: "Lập phiếu",
  approve: "Phê duyệt",
  reject: "Từ chối",
  issue: "Phát hành",
  revoke: "Thu hồi",
  verify: "Xác minh",
};

export default function Audit() {
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [action, setAction] = useState("all");
  const [error, setError] = useState("");

  async function load() {
    try {
      setLogs(await api.listAudit());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được nhật ký");
    }
  }

  useEffect(() => {
    // Tải trạng thái máy chủ một lần khi màn hình được mở.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, []);

  const filtered = useMemo(
    () => action === "all" ? logs : logs.filter((log) => log.action === action),
    [action, logs],
  );

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AUDIT TRAIL</p>
          <h2>Nhật ký hệ thống</h2>
          <p className="muted">Ai làm gì, trên đối tượng nào và vào thời điểm nào.</p>
        </div>
        <span className="count-badge">{filtered.length} sự kiện</span>
      </div>
      <div className="toolbar card">
        <select value={action} onChange={(event) => setAction(event.target.value)}>
          <option value="all">Tất cả hành động</option>
          {Object.entries(actionLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button className="button secondary" onClick={() => void load()}>Làm mới</button>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="timeline">
        {filtered.map((log) => (
          <article className="timeline-item card" key={log.id}>
            <span className={`timeline-dot action-${log.action}`} />
            <div>
              <strong>{actionLabels[log.action] || log.action}</strong>
              <p className="muted small">
                {log.actor || "Khách công khai"}{log.actorRole ? ` · ${roleLabels[log.actorRole] || log.actorRole}` : ""}
              </p>
              <p className="mono small break-word">
                {log.targetId ? `Đối tượng: ${log.targetId}` : "Không có mã đối tượng"}
              </p>
              {log.detail && <p className="small">{log.detail}</p>}
              {log.txid && <p className="mono small break-word">Txid: {log.txid}</p>}
            </div>
            <time>{new Date(log.createdAt).toLocaleString("vi-VN")}</time>
          </article>
        ))}
        {!filtered.length && <div className="empty-state">Chưa có sự kiện phù hợp.</div>}
      </div>
    </section>
  );
}
