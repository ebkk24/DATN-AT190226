import { useEffect, useMemo, useState } from "react";
import { api, type CertificateRecord, type IssuanceStatus, type Role } from "../api";

const statusLabel: Record<IssuanceStatus, string> = {
  pending_approval: "Chờ duyệt",
  queued: "Trong hàng đợi",
  processing: "Đang phát hành",
  issued: "Đã cấp",
  revoked: "Đã thu hồi",
  rejected: "Đã từ chối",
  failed: "Thất bại",
};

export default function Overview({ role }: { role: Role }) {
  const [records, setRecords] = useState<CertificateRecord[]>([]);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [auditCount, setAuditCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const jobs: Promise<unknown>[] = [
      api.listAll().then(setRecords),
      api.listAudit().then((logs) => setAuditCount(logs.length)),
    ];
    if (role === "checker") {
      jobs.push(api.listUsers().then((users) => setUserCount(users.length)));
    }
    Promise.all(jobs).catch((err) => {
      setError(err instanceof Error ? err.message : "Không tải được tổng quan");
    });
  }, [role]);

  const stats = useMemo(() => ({
    pending: records.filter((item) => item.status === "pending_approval").length,
    active: records.filter((item) => ["queued", "processing"].includes(item.status)).length,
    issued: records.filter((item) => item.status === "issued").length,
    revoked: records.filter((item) => item.status === "revoked").length,
  }), [records]);

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">TỔNG QUAN</p>
          <h2>Bảng điều khiển phát hành</h2>
          <p className="muted">Số liệu trực tiếp từ PostgreSQL và hàng đợi nghiệp vụ.</p>
        </div>
        <span className="live-badge"><i /> Dữ liệu trực tiếp</span>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="stats-grid">
        <article className="stat-card card"><span>Chờ duyệt</span><strong>{stats.pending}</strong><small>Maker → Checker</small></article>
        <article className="stat-card card"><span>Đang xử lý</span><strong>{stats.active}</strong><small>Queue / Worker</small></article>
        <article className="stat-card card accent-card"><span>Đã phát hành</span><strong>{stats.issued}</strong><small>Neo blockchain</small></article>
        <article className="stat-card card warning-card"><span>Đã thu hồi</span><strong>{stats.revoked}</strong><small>OP_RETURN</small></article>
      </div>
      <div className="summary-strip card">
        <div><span>Tổng hồ sơ</span><strong>{records.length}</strong></div>
        <div><span>Audit gần nhất</span><strong>{auditCount}</strong><small>tối đa 200 sự kiện</small></div>
        {role === "checker" && <div><span>Tài khoản</span><strong>{userCount ?? "…"}</strong></div>}
      </div>
      <div className="card table-card">
        <div className="card-title-row"><h3>Hồ sơ gần đây</h3><span className="muted small">10 bản ghi mới nhất</span></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Người nhận</th><th>Trạng thái</th><th>Maker</th><th>Checker</th><th>Thời gian</th></tr></thead>
            <tbody>
              {!records.length && (
                <tr><td colSpan={5}><div className="empty-state compact">Chưa có hồ sơ phát hành.</div></td></tr>
              )}
              {records.slice(0, 10).map((record) => (
                <tr key={record.id}>
                  <td><strong>{record.recipientName}</strong><span className="table-sub mono">{record.id.slice(0, 8)}</span></td>
                  <td><span className={`status-chip ${record.status}`}>{statusLabel[record.status]}</span></td>
                  <td>{record.requestedBy || "—"}</td>
                  <td>{record.approvedBy || "—"}</td>
                  <td>{new Date(record.createdAt).toLocaleString("vi-VN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
