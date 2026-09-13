import { useState } from "react";

export default function Login({
  onLogin,
}: {
  onLogin: (username: string, password: string) => Promise<void>;
}) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-brand">
        <div className="brand-mark" aria-hidden="true">KMA</div>
        <div className="login-brand-copy">
          <p className="eyebrow light-eyebrow">HỆ THỐNG BLOCKCERTS</p>
          <h1>Quản lý văn bằng số</h1>
          <p>
            Quy trình phát hành minh bạch, kiểm soát hai lớp và có thể
            xác minh độc lập bằng bằng chứng blockchain.
          </p>
        </div>
        <div className="login-flow" aria-label="Quy trình phát hành">
          <span><b>01</b> Maker lập phiếu</span>
          <i aria-hidden="true" />
          <span><b>02</b> Checker phê duyệt</span>
          <i aria-hidden="true" />
          <span><b>03</b> Neo bằng chứng</span>
        </div>
        <p className="login-network"><span /> Blockcerts V3 · Bitcoin regtest</p>
      </section>
      <section className="login-panel">
        <div className="login-card card">
          <p className="eyebrow">CỔNG MAKER · CHECKER</p>
          <h2>Chào mừng trở lại</h2>
          <p className="muted login-subtitle">Đăng nhập để tiếp tục công việc của bạn.</p>
          <form onSubmit={submit} className="form-stack login-form">
            <label>
              Tài khoản
              <input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Nhập tên đăng nhập"
                required
              />
            </label>
            <label>
              Mật khẩu
              <input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Nhập mật khẩu"
                required
              />
            </label>
            {error && <div className="alert error" role="alert">{error}</div>}
            <button className="button primary login-button" disabled={busy}>
              {busy ? <><span className="spinner" /> Đang kiểm tra…</> : "Đăng nhập"}
            </button>
          </form>
          <p className="security-note"><span aria-hidden="true">✓</span> Phiên đăng nhập được bảo vệ bằng JWT và phân quyền RBAC.</p>
        </div>
      </section>
    </div>
  );
}
