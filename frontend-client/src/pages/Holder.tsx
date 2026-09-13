import { useEffect, useState } from "react";
import { myCerts, type HolderCertificate } from "../api";
import Icon from "../components/Icon";

const statusLabels: Record<string, string> = {
  issued: "Đã phát hành",
  revoked: "Đã thu hồi",
};

function formatDate(value?: string) {
  if (!value) return "Chưa cập nhật";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
}

function shorten(value?: string, length = 18) {
  if (!value) return "Chưa có";
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

export default function Holder({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [certificates, setCertificates] = useState<HolderCertificate[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setCertificates(await myCerts());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tải được văn bằng");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- Nạp danh sách văn bằng lần đầu sau khi màn hình được gắn.
    void load();
  }, []);

  function download(certificate: HolderCertificate) {
    const blob = new Blob([JSON.stringify(certificate.certificate, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${certificate.certUid || "blockcerts-certificate"}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div className="container header-content">
          <div className="brand-lockup compact">
            <div className="brand-mark">KMA</div>
            <div><strong>HỆ THỐNG VĂN BẰNG SỐ</strong><span>Cổng sinh viên</span></div>
          </div>
          <div className="header-account">
            <div className="user-chip"><span className="avatar">{username.charAt(0).toUpperCase()}</span><span><small>Tài khoản</small><strong>{username}</strong></span></div>
            <button className="button secondary logout-button" onClick={onLogout} type="button"><Icon name="logout" /> Đăng xuất</button>
          </div>
        </div>
      </header>

      <main className="container portal-main">
        <section className="page-heading">
          <div><p className="eyebrow">CỔNG SINH VIÊN</p><h1>Văn bằng của tôi</h1><p className="muted">Xem và tải các chứng thư số đã được cấp cho tài khoản này.</p></div>
          <span className="live-badge"><i /> Đồng bộ trực tiếp</span>
        </section>

        <section className="summary-card card">
          <div className="summary-icon"><Icon name="certificate" size={28} /></div>
          <div><span className="muted">Văn bằng đã nhận</span><strong>{loading ? "—" : certificates.length}</strong></div>
          <div className="summary-divider" />
          <div className="summary-assurance"><Icon name="chain" /><span><strong>Bằng chứng blockchain</strong><small>Mỗi chứng thư có mã định danh và giao dịch neo riêng</small></span></div>
          <button aria-label="Làm mới danh sách" className="icon-button" disabled={loading} onClick={() => void load()} title="Làm mới" type="button"><Icon name="refresh" /></button>
        </section>

        {error && <div className="alert error" role="alert">{error}</div>}
        {loading && (
          <div className="loading-grid" aria-label="Đang tải văn bằng">
            <div className="skeleton-card card" /><div className="skeleton-card card" />
          </div>
        )}
        {!loading && !error && certificates.length === 0 && (
          <section className="empty-state card">
            <div className="empty-icon"><Icon name="certificate" size={32} /></div>
            <h2>Chưa có văn bằng</h2>
            <p className="muted">Văn bằng sẽ xuất hiện tại đây sau khi được Maker lập phiếu và Checker phê duyệt.</p>
          </section>
        )}
        {!loading && certificates.length > 0 && (
          <section className="certificate-grid" aria-label="Danh sách văn bằng">
            {certificates.map((certificate) => {
              const status = certificate.status || "issued";
              return (
                <article className="certificate-card card" key={certificate.id}>
                  <div className="certificate-accent" />
                  <div className="certificate-head">
                    <div className="certificate-seal">KMA</div>
                    <span className={`status-chip ${status}`}><i /> {statusLabels[status] || "Đã phát hành"}</span>
                  </div>
                  <div className="certificate-body">
                    <p className="eyebrow">CHỨNG THƯ BLOCKCERTS</p>
                    <h2>{certificate.certificate?.name || "Văn bằng số"}</h2>
                    <p className="recipient-name">{certificate.recipientName}</p>
                    <div className="certificate-meta">
                      <div><span>Ngày cấp</span><strong>{formatDate(certificate.certificate?.issuanceDate)}</strong></div>
                      <div><span>Mã chứng thư</span><strong className="mono" title={certificate.certUid}>{shorten(certificate.certUid)}</strong></div>
                    </div>
                    <div className="proof-row"><Icon name="chain" /><span><small>Giao dịch neo blockchain</small><strong className="mono" title={certificate.txid}>{shorten(certificate.txid, 26)}</strong></span></div>
                  </div>
                  <div className="certificate-footer">
                    <span className="format-label">JSON · BLOCKCERTS V3</span>
                    <button className="button primary" onClick={() => download(certificate)} type="button"><Icon name="download" /> Tải chứng thư</button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      <footer className="portal-footer"><div className="container"><span>© 2026 Học viện Kỹ thuật Mật mã</span><span>Blockcerts V3 · Bitcoin blockchain</span></div></footer>
    </div>
  );
}
