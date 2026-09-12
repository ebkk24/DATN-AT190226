import { useEffect, useState } from "react";
import { myCerts } from "../api";
export default function Holder({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [certs, setCerts] = useState<any[]>([]); const [err, setErr] = useState("");
  useEffect(() => { myCerts().then(setCerts).catch((e) => setErr(e.message)); }, []);
  function download(c: any) {
    const blob = new Blob([JSON.stringify(c.certificate, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${c.certUid}.json`; a.click();
    URL.revokeObjectURL(url);
  }
  return (<div style={w}>
    <header style={{ display: "flex", justifyContent: "space-between", padding: 16, borderBottom: "1px solid #ddd", width: "100%" }}>
      <strong>🎓 Văn bằng của tôi</strong><span>{username} <button onClick={onLogout}>Đăng xuất</button></span>
    </header>
    <main style={{ padding: 16 }}>
      {err && <p style={{ color: "red" }}>{err}</p>}
      {certs.length === 0 && !err && <p>Chưa có văn bằng nào.</p>}
      {certs.map((c) => (
        <div key={c.id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: 14, marginBottom: 10 }}>
          <h3 style={{ margin: "0 0 6px" }}>{c.certificate?.name || "Văn bằng"}</h3>
          <div style={{ fontSize: 13, color: "#555" }}>Người nhận: {c.recipientName}</div>
          <div style={{ fontSize: 13, color: "#555" }}>Ngày cấp: {c.certificate?.issuanceDate}</div>
          <div style={{ fontSize: 13, color: "#555" }}>TxID: {(c.txid || "").slice(0, 20)}...</div>
          <button style={{ marginTop: 8 }} onClick={() => download(c)}>⬇️ Tải chứng thư (JSON)</button>
        </div>
      ))}
    </main></div>);
}
const w: React.CSSProperties = { fontFamily: "sans-serif", minHeight: "100vh" };
