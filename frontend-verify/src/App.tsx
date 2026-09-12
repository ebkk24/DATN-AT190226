import { useState } from "react";
import { verify } from "./api";

export default function App() {
  const [text, setText] = useState("");
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function check(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(""); setRes(null);
    let cert: any;
    try { cert = JSON.parse(text); } catch { setErr("JSON không hợp lệ"); setBusy(false); return; }
    verify(cert).then(setRes).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  }

  const color = res?.status === "VALID" ? "#1a7f37" : res?.status === "REVOKED" ? "#cf222e" : "#9a6700";
  return (
    <div style={w}>
      <h2>🔎 Xác minh văn bằng (Công khai)</h2>
      <p style={{ color: "#666", maxWidth: 480 }}>Dán nội dung chứng thư Blockcerts (file JSON) vào ô dưới, không cần đăng nhập.</p>
      <form onSubmit={check} style={{ display: "grid", gap: 10, width: 520 }}>
        <textarea rows={10} placeholder='{ "...": "dán JSON chứng thư vào đây" }' value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: "monospace" }} />
        <button disabled={busy}>{busy ? "Đang xác minh..." : "Xác minh"}</button>
      </form>
      {err && <p style={{ color: "red" }}>{err}</p>}
      {res && (
        <div style={{ marginTop: 16, padding: 16, border: `2px solid ${color}`, borderRadius: 8, maxWidth: 520 }}>
          <h3 style={{ color, margin: "0 0 8px" }}>Kết quả: {res.status}</h3>
          {res.txid && <div>TxID: {res.txid}</div>}
          {res.issuedOn && <div>Ngày cấp: {res.issuedOn}</div>}
          {res.recipientName && <div>Người nhận: {res.recipientName}</div>}
          {res.message && <div style={{ color: "#666" }}>{res.message}</div>}
        </div>
      )}
    </div>
  );
}
const w: React.CSSProperties = { fontFamily: "sans-serif", minHeight: "100vh", padding: 24 };
