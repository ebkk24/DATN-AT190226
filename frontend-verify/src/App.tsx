import { useRef, useState } from "react";
import { verify, type VerifyResult } from "./api";
import Icon from "./components/Icon";

const resultCopy: Record<string, { title: string; description: string }> = {
  VALID: {
    title: "Văn bằng hợp lệ",
    description: "Chữ ký, Merkle proof và giao dịch neo blockchain đã được xác thực.",
  },
  REVOKED: {
    title: "Văn bằng đã bị thu hồi",
    description: "Chứng thư từng được phát hành nhưng hiện không còn hiệu lực.",
  },
  INVALID: {
    title: "Không thể xác thực",
    description: "Nội dung chứng thư không hợp lệ hoặc bằng chứng blockchain không khớp.",
  },
};

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

export default function App() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function check(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    let certificate: unknown;
    try {
      certificate = JSON.parse(text);
    } catch {
      setError("Nội dung JSON chưa đúng định dạng. Vui lòng kiểm tra lại tệp chứng thư.");
      setBusy(false);
      return;
    }
    try {
      setResult(await verify(certificate));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể xác minh chứng thư");
    } finally {
      setBusy(false);
    }
  }

  async function loadFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setResult(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("Tệp quá lớn. Vui lòng chọn tệp JSON nhỏ hơn 5 MB.");
      event.target.value = "";
      return;
    }
    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as unknown;
      setText(JSON.stringify(parsed, null, 2));
      setFileName(file.name);
    } catch {
      setError("Tệp đã chọn không phải chứng thư JSON hợp lệ.");
      event.target.value = "";
    }
  }

  function reset() {
    setText("");
    setFileName("");
    setError("");
    setResult(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  const resultState = result?.status === "VALID" ? "valid" : result?.status === "REVOKED" ? "revoked" : "invalid";
  const copy = result ? (resultCopy[result.status] || resultCopy.INVALID) : null;

  return (
    <div className="public-shell">
      <header className="portal-header">
        <div className="container header-content">
          <div className="brand-lockup">
            <div className="brand-mark">KMA</div>
            <div><strong>HỆ THỐNG VĂN BẰNG SỐ</strong><span>Xác minh công khai</span></div>
          </div>
          <span className="public-badge"><Icon name="shield" size={17} /> Không cần đăng nhập</span>
        </div>
      </header>

      <main>
        <section className="verify-hero">
          <div className="container">
            <div className="hero-icon"><Icon name="search" size={30} /></div>
            <p className="eyebrow">XÁC MINH CÔNG KHAI</p>
            <h1>Kiểm tra văn bằng số</h1>
            <p>Đối chiếu tính toàn vẹn, trạng thái phát hành và bằng chứng blockchain của chứng thư Blockcerts V3.</p>
          </div>
        </section>

        <section className="container verify-layout">
          <aside className="guide-card card">
            <p className="eyebrow">CÁCH THỰC HIỆN</p>
            <h2>Ba bước xác minh</h2>
            <ol className="steps">
              <li><span>1</span><div><strong>Chọn chứng thư</strong><p>Tải lên tệp JSON do người nhận cung cấp.</p></div></li>
              <li><span>2</span><div><strong>Kiểm tra nội dung</strong><p>Có thể xem lại hoặc dán trực tiếp JSON vào biểu mẫu.</p></div></li>
              <li><span>3</span><div><strong>Nhận kết quả</strong><p>Hệ thống đối chiếu Merkle proof và trạng thái thu hồi.</p></div></li>
            </ol>
            <div className="trust-note"><Icon name="chain" /><div><strong>Xác minh độc lập</strong><p>Không cần tài khoản và không làm thay đổi nội dung chứng thư.</p></div></div>
          </aside>

          <section className="verify-card card">
            <div className="card-heading">
              <div><p className="eyebrow">CHỨNG THƯ BLOCKCERTS</p><h2>Nội dung cần xác minh</h2></div>
              {text && <button className="reset-button" onClick={reset} type="button"><Icon name="reset" size={17} /> Làm lại</button>}
            </div>
            <form className="verify-form" onSubmit={check}>
              <input accept=".json,application/json" className="visually-hidden" onChange={(event) => void loadFile(event)} ref={fileInput} type="file" />
              <button className="upload-zone" onClick={() => fileInput.current?.click()} type="button">
                <span className="upload-icon"><Icon name="upload" /></span>
                <span><strong>{fileName || "Chọn tệp chứng thư JSON"}</strong><small>{fileName ? "Tệp đã sẵn sàng để xác minh" : "Tối đa 5 MB · định dạng .json"}</small></span>
                <span className="choose-label">Chọn tệp</span>
              </button>
              <div className="separator"><span>hoặc dán nội dung</span></div>
              <label className="textarea-label" htmlFor="certificate-json">Nội dung JSON</label>
              <textarea
                id="certificate-json"
                onChange={(event) => { setText(event.target.value); setFileName(""); setResult(null); setError(""); }}
                placeholder={'{\n  "@context": [...],\n  "type": "BlockcertsCredential",\n  ...\n}'}
                required
                rows={11}
                spellCheck={false}
                value={text}
              />
              <div className="form-meta"><span><Icon name="file" size={15} /> {text.length.toLocaleString("vi-VN")} ký tự</span><span>Dữ liệu được gửi qua kết nối hiện tại</span></div>
              {error && <div className="alert error" role="alert">{error}</div>}
              <button className="button primary verify-button" disabled={busy || !text.trim()} type="submit">
                {busy ? <><span className="spinner" /> Đang đối chiếu…</> : <><Icon name="search" /> Xác minh văn bằng</>}
              </button>
            </form>

            {result && copy && (
              <section aria-live="polite" className={`result-panel ${resultState}`}>
                <div className="result-heading">
                  <span className="result-icon">{resultState === "valid" ? <Icon name="check" size={26} /> : <Icon name="shield" size={26} />}</span>
                  <div><p>KẾT QUẢ XÁC MINH</p><h3>{copy.title}</h3><span>{copy.description}</span></div>
                </div>
                <dl className="result-details">
                  {result.recipientName && <div><dt>Người nhận</dt><dd>{result.recipientName}</dd></div>}
                  {result.issuedOn && <div><dt>Ngày phát hành</dt><dd>{formatDate(result.issuedOn)}</dd></div>}
                  {result.certUid && <div><dt>Mã chứng thư</dt><dd className="mono">{result.certUid}</dd></div>}
                  {result.txid && <div className="full-row"><dt>Giao dịch blockchain</dt><dd className="mono">{result.txid}</dd></div>}
                </dl>
                {result.message && <p className="result-message">{result.message}</p>}
                <details className="result-technical">
                  <summary>Chi tiết kỹ thuật</summary>
                  <pre>{JSON.stringify(result, null, 2)}</pre>
                </details>
              </section>
            )}
          </section>
        </section>

        <section className="container assurance-strip" aria-label="Các lớp kiểm tra">
          <div><Icon name="file" /><span><strong>Toàn vẹn chứng thư</strong><small>Kiểm tra nội dung JSON</small></span></div>
          <div><Icon name="chain" /><span><strong>Merkle proof</strong><small>Đối chiếu bằng chứng lô</small></span></div>
          <div><Icon name="clock" /><span><strong>Trạng thái hiệu lực</strong><small>Kiểm tra dữ liệu thu hồi</small></span></div>
        </section>
      </main>

      <footer className="portal-footer"><div className="container"><span>© 2026 Học viện Kỹ thuật Mật mã</span><span>Blockcerts V3 · Bitcoin blockchain</span></div></footer>
    </div>
  );
}
