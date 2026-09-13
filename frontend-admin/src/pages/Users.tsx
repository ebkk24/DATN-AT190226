import { useEffect, useState } from "react";
import { api, type Role, type UserRecord } from "../api";

const roleLabel: Record<Role, string> = {
  maker: "Maker — lập phiếu",
  checker: "Checker — kiểm duyệt",
  student: "Student — người nhận",
};

export default function Users() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [recipientName, setRecipientName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setUsers(await api.listUsers());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được tài khoản");
    }
  }

  useEffect(() => {
    // Tải trạng thái máy chủ một lần khi màn hình được mở.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.createUser({
        username: username.trim(),
        password,
        role,
        recipientName: role === "student" ? recipientName.trim() : undefined,
      });
      setMessage(`Đã tạo tài khoản ${result.username} (${roleLabel[result.role]}).`);
      setUsername("");
      setPassword("");
      setRecipientName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tạo tài khoản");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PHÂN QUYỀN</p>
          <h2>Quản lý người dùng</h2>
          <p className="muted">Chỉ Checker được tạo tài khoản và gán vai trò.</p>
        </div>
        <span className="count-badge">{users.length} tài khoản</span>
      </div>
      <div className="two-column-layout">
        <form onSubmit={submit} className="card form-stack sticky-card">
          <h3>Tạo tài khoản</h3>
          <label>
            Tên đăng nhập
            <input value={username} onChange={(event) => setUsername(event.target.value)} required />
          </label>
          <label>
            Mật khẩu ban đầu
            <input
              type="password"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Vai trò
            <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
              {Object.entries(roleLabel).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          {role === "student" && (
            <label>
              Họ tên liên kết văn bằng
              <input
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                placeholder="Phải khớp tên trên văn bằng"
                required
              />
            </label>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Đang tạo…" : "Tạo tài khoản"}
          </button>
          {message && <div className="alert success">{message}</div>}
          {error && <div className="alert error">{error}</div>}
        </form>
        <div className="card table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Tài khoản</th><th>Vai trò</th><th>Liên kết người nhận</th><th>Ngày tạo</th></tr>
              </thead>
              <tbody>
                {!users.length && (
                  <tr><td colSpan={4}><div className="empty-state compact">Chưa có tài khoản.</div></td></tr>
                )}
                {users.map((user) => (
                  <tr key={user.id}>
                    <td><strong>{user.username}</strong><span className="table-sub mono">{user.id.slice(0, 8)}</span></td>
                    <td><span className={`role-chip ${user.role}`}>{roleLabel[user.role].split(" — ")[0]}</span></td>
                    <td>{user.recipientName || "—"}</td>
                    <td>{new Date(user.createdAt).toLocaleDateString("vi-VN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
