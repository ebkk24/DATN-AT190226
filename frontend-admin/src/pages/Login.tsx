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
        <div className="brand-mark">KMA</div>
        <p className="eyebrow">HỆ THỐNG BLOCKCERTS</p>
        <h1>Quản lý văn bằng số</h1>
        <p>
          Lập phiếu, kiểm soát hai lớp, phát hành theo lô và xác minh
          bằng chứng neo trên Bitcoin regtest.
        </p>
        <div className="login-flow">
          <span>Maker lập phiếu</span><b>→</b>
          <span>Checker duyệt</span><b>→</b>
          <span>Blockchain neo bằng chứng</span>
        </div>
      </section>
      <section className="login-card card">
        <p className="eyebrow">CỔNG QUẢN TRỊ</p>
        <h2>Đăng nhập</h2>
        <p className="muted">Dành cho cán bộ Maker và Checker.</p>
        <form onSubmit={submit} className="form-stack">
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
          <button className="button primary" disabled={busy}>
            {busy ? "Đang kiểm tra…" : "Đăng nhập"}
          </button>
          {error && <div className="alert error">{error}</div>}
        </form>
      </section>
    </div>
  );
}
