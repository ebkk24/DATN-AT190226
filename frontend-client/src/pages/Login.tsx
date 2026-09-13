import { useState } from "react";
import Icon from "../components/Icon";

export default function Login({ onLogin }: { onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onLogin(username.trim(), password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể đăng nhập");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <aside className="login-brand" aria-label="Giới thiệu hệ thống">
        <div className="brand-lockup">
          <div className="brand-mark">KMA</div>
          <div>
            <strong>HỌC VIỆN KỸ THUẬT MẬT MÃ</strong>
            <span>Hệ thống văn bằng số</span>
          </div>
        </div>
        <div className="login-brand-copy">
          <p className="eyebrow light">BLOCKCERTS V3</p>
          <h1>Văn bằng của bạn,<br />luôn sẵn sàng.</h1>
          <p>Tra cứu, lưu trữ và tải chứng thư số đã được xác thực trên blockchain.</p>
        </div>
        <div className="brand-benefits">
          <div><Icon name="shield" /><span><strong>Tin cậy</strong><small>Chứng thư có bằng chứng toàn vẹn</small></span></div>
          <div><Icon name="chain" /><span><strong>Minh bạch</strong><small>Dữ liệu phát hành được neo blockchain</small></span></div>
        </div>
        <p className="brand-footnote">Cổng dành riêng cho người nhận văn bằng</p>
      </aside>

      <main className="login-panel">
        <section className="login-card card">
          <div className="mobile-brand"><span className="mini-brand">KMA</span><span>Hệ thống văn bằng số</span></div>
          <div className="portal-label"><Icon name="user" /> CỔNG SINH VIÊN</div>
          <h2>Chào mừng trở lại</h2>
          <p className="muted">Đăng nhập để quản lý văn bằng được cấp cho bạn.</p>
          <form onSubmit={submit} className="form-stack">
            <label>
              Tài khoản sinh viên
              <input
                autoComplete="username"
                autoFocus
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Nhập tài khoản"
                required
                value={username}
              />
            </label>
            <label>
              Mật khẩu
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Nhập mật khẩu"
                required
                type="password"
                value={password}
              />
            </label>
            {error && <div className="alert error" role="alert">{error}</div>}
            <button className="button primary full-button" disabled={busy} type="submit">
              {busy ? <><span className="spinner" /> Đang đăng nhập…</> : "Đăng nhập"}
            </button>
          </form>
          <div className="security-note"><Icon name="shield" size={18} /><span>Phiên truy cập được bảo vệ bằng xác thực JWT.</span></div>
        </section>
        <p className="login-copyright">© 2026 KMA Blockcerts · Cổng sinh viên</p>
      </main>
    </div>
  );
}
