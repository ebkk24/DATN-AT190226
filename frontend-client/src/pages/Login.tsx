import { useState } from "react";
export default function Login({ onLogin }: { onLogin: (u: string, p: string) => Promise<void> }) {
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  function submit(e: React.FormEvent) { e.preventDefault(); setBusy(true); setErr("");
    onLogin(u, p).catch((e) => setErr(e.message)).finally(() => setBusy(false)); }
  return (<div style={w}><h2>🎓 Cổng Sinh viên</h2>
    <form onSubmit={submit} style={{ display: "grid", gap: 10, width: 280 }}>
      <input placeholder="Mã sinh viên / tài khoản" value={u} onChange={(e) => setU(e.target.value)} />
      <input placeholder="Mật khẩu" type="password" value={p} onChange={(e) => setP(e.target.value)} />
      <button disabled={busy}>{busy ? "..." : "Đăng nhập"}</button>
      {err && <p style={{ color: "red" }}>{err}</p>}
    </form><p style={{ fontSize: 12, color: "#666" }}>Thử: sv01 (pass123)</p></div>);
}
const w: React.CSSProperties = { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" };
