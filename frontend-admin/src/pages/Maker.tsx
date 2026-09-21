import { useState } from "react";
import { api, type RecipientInput, type StudentProfile } from "../api";

const initialDiploma: Omit<RecipientInput, "studentCode"> = {
  pubkey: "", degreeName: "Bằng tốt nghiệp đại học", major: "An Toàn Thông Tin",
  educationLevel: "Đại học", graduationRank: "Giỏi", graduationYear: new Date().getFullYear(),
  issueDate: new Date().toISOString().slice(0, 10), diplomaNumber: "", trainingMode: "Chính quy",
};

export default function Maker() {
  const [studentCode, setStudentCode] = useState("");
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [form, setForm] = useState(initialDiploma);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function lookup() {
    const code = studentCode.trim().toUpperCase();
    if (!code) return;
    setBusy(true); setError(""); setMessage(""); setStudent(null);
    try { setStudent(await api.studentProfile(code)); setStudentCode(code); }
    catch (err) { setError(err instanceof Error ? err.message : "Không tìm thấy hồ sơ Student"); }
    finally { setBusy(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!student || student.studentCode !== studentCode.trim().toUpperCase()) {
      setError("Hãy tra cứu lại hồ sơ Student trước khi lập phiếu"); return;
    }
    setError(""); setMessage(""); setBusy(true);
    try {
      const result = await api.requestIssue({ ...form, studentCode: student.studentCode });
      setMessage(`Đã lập phiếu ${result.id.slice(0, 8)} — đang chờ Checker duyệt.`);
      setStudentCode(""); setStudent(null); setForm(initialDiploma);
    } catch (err) { setError(err instanceof Error ? err.message : "Không thể lập phiếu"); }
    finally { setBusy(false); }
  }

  return <section className="page-section">
    <div className="section-heading"><div><p className="eyebrow">MAKER</p><h2>Lập phiếu cấp văn bằng</h2><p className="muted">Tra cứu hồ sơ Student nguồn, sau đó nhập dữ liệu riêng của văn bằng.</p></div><span className="status-chip pending">Chưa ghi blockchain</span></div>
    <form onSubmit={submit} className="card form-grid">
      <label>Mã sinh viên<input value={studentCode} onChange={(e) => { setStudentCode(e.target.value); setStudent(null); }} placeholder="Ví dụ: AT190226" required /></label>
      <div className="form-actions"><button type="button" className="button secondary" onClick={() => void lookup()} disabled={busy || !studentCode.trim()}>Tra cứu hồ sơ</button></div>
      {student && <div className="card full-width">
        <p className="eyebrow">HỒ SƠ STUDENT — CHỈ ĐỌC</p>
        <div className="form-grid">
          <div><span className="muted">Mã sinh viên</span><br/><strong>{student.studentCode}</strong></div>
          <div><span className="muted">Họ và tên</span><br/><strong>{student.recipientName}</strong></div>
          <div><span className="muted">Ngày sinh</span><br/><strong>{student.dateOfBirth || "Chưa cập nhật"}</strong></div>
          <div><span className="muted">Email</span><br/><strong>{student.email || "Chưa cập nhật"}</strong></div>
          <div><span className="muted">Niên khóa</span><br/><strong>{student.cohort || "Chưa cập nhật"}</strong></div>
        </div>
      </div>}
      <label>Tên văn bằng<input value={form.degreeName} onChange={(e) => update("degreeName", e.target.value)} minLength={2} maxLength={255} required /></label>
      <label>Ngành/chuyên ngành<select value={form.major} onChange={(e) => update("major", e.target.value as RecipientInput["major"])}><option>An Toàn Thông Tin</option></select></label>
      <label>Trình độ đào tạo<select value={form.educationLevel} onChange={(e) => update("educationLevel", e.target.value as RecipientInput["educationLevel"])}><option>Đại học</option><option>Thạc sĩ</option><option>Tiến sĩ</option></select></label>
      <label>Xếp loại tốt nghiệp<select value={form.graduationRank} onChange={(e) => update("graduationRank", e.target.value as RecipientInput["graduationRank"])}><option>Xuất sắc</option><option>Giỏi</option><option>Khá</option><option>Trung bình</option></select></label>
      <label>Năm tốt nghiệp<input type="number" min="2000" max="2100" value={form.graduationYear} onChange={(e) => update("graduationYear", Number(e.target.value))} required /></label>
      <label>Ngày cấp<input type="date" value={form.issueDate} onChange={(e) => update("issueDate", e.target.value)} required /></label>
      <label>Số hiệu văn bằng<input value={form.diplomaNumber} onChange={(e) => update("diplomaNumber", e.target.value.toUpperCase())} minLength={2} maxLength={100} placeholder="KMA-2027-0001" required /></label>
      <label>Hình thức đào tạo<select value={form.trainingMode} onChange={(e) => update("trainingMode", e.target.value as RecipientInput["trainingMode"])}><option>Chính quy</option><option>Vừa làm vừa học</option><option>Đào tạo từ xa</option></select></label>
      <label className="full-width">Địa chỉ nhận / public key<input value={form.pubkey} onChange={(e) => update("pubkey", e.target.value)} placeholder="Địa chỉ Bitcoin P2PKH regtest" required /></label>
      <div className="form-actions full-width"><button className="button primary" disabled={busy || !student}>{busy ? "Đang xử lý…" : "Lập phiếu"}</button></div>
      {message && <div className="alert success full-width">{message}</div>}{error && <div className="alert error full-width">{error}</div>}
    </form>
  </section>;
}
