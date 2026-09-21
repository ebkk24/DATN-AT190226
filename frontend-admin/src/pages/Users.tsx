import { useEffect, useState } from "react";
import { api, type Role, type UserRecord } from "../api";
const roleLabel: Record<Role, string> = { maker: "Maker — lập phiếu", checker: "Checker — kiểm duyệt", student: "Student — người nhận" };
type Profile = { recipientName: string; dateOfBirth: string; email: string; cohort: string };
const blank: Profile = { recipientName: "", dateOfBirth: "", email: "", cohort: "" };

export default function Users() {
  const [users,setUsers]=useState<UserRecord[]>([]); const [username,setUsername]=useState(""); const [password,setPassword]=useState(""); const [role,setRole]=useState<Role>("student"); const [studentCode,setStudentCode]=useState(""); const [profile,setProfile]=useState<Profile>(blank); const [editing,setEditing]=useState<UserRecord|null>(null); const [editProfile,setEditProfile]=useState<Profile>(blank); const [message,setMessage]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function load(){try{setUsers(await api.listUsers());setError("");}catch(err){setError(err instanceof Error?err.message:"Không tải được tài khoản");}}
  useEffect(()=>{void load();},[]);
  function profileFields(value: Profile, change: (next: Profile)=>void) { return <>
    <label>Họ và tên<input value={value.recipientName} onChange={(e)=>change({...value,recipientName:e.target.value})} required /></label>
    <label>Ngày sinh<input type="date" value={value.dateOfBirth} onChange={(e)=>change({...value,dateOfBirth:e.target.value})} required /></label>
    <label>Email<input type="email" value={value.email} onChange={(e)=>change({...value,email:e.target.value})} required /></label>
    <label>Niên khóa<input value={value.cohort} onChange={(e)=>change({...value,cohort:e.target.value})} pattern="[0-9]{4} - [0-9]{4}" placeholder="2022 - 2027" required /></label>
  </>; }
  async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError("");setMessage("");try{const result=await api.createUser({username:username.trim(),password,role,studentCode:role==="student"?studentCode.trim().toUpperCase():undefined,...(role==="student"?profile:{})});setMessage(`Đã tạo tài khoản ${result.username} (${roleLabel[result.role]}).`);setUsername("");setPassword("");setStudentCode("");setProfile(blank);await load();}catch(err){setError(err instanceof Error?err.message:"Không thể tạo tài khoản");}finally{setBusy(false);}}
  function startEdit(user:UserRecord){setEditing(user);setEditProfile({recipientName:user.recipientName||"",dateOfBirth:user.dateOfBirth||"",email:user.email||"",cohort:user.cohort||""});setMessage("");setError("");}
  async function saveEdit(event:React.FormEvent){event.preventDefault();if(!editing)return;setBusy(true);try{await api.updateStudentProfile(editing.id,editProfile);setMessage(`Đã cập nhật hồ sơ ${editing.studentCode}. Chứng thư cũ vẫn giữ snapshot ban đầu.`);setEditing(null);await load();}catch(err){setError(err instanceof Error?err.message:"Không thể cập nhật hồ sơ");}finally{setBusy(false);}}
  return <section className="page-section">
    <div className="section-heading"><div><p className="eyebrow">PHÂN QUYỀN</p><h2>Quản lý người dùng và hồ sơ Student</h2><p className="muted">Checker quản lý hồ sơ nguồn; phiếu đã lập giữ nguyên bản chụp dữ liệu.</p></div><span className="count-badge">{users.length} tài khoản</span></div>
    {message&&<div className="alert success">{message}</div>}{error&&<div className="alert error">{error}</div>}
    <div className="two-column-layout">
      <form onSubmit={submit} className="card form-stack sticky-card"><h3>Tạo tài khoản</h3>
        <label>Tên đăng nhập<input value={username} onChange={(e)=>setUsername(e.target.value)} required /></label><label>Mật khẩu ban đầu<input type="password" minLength={6} value={password} onChange={(e)=>setPassword(e.target.value)} required /></label>
        <label>Vai trò<select value={role} onChange={(e)=>setRole(e.target.value as Role)}>{Object.entries(roleLabel).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        {role==="student"&&<><label>Mã sinh viên duy nhất<input value={studentCode} onChange={(e)=>setStudentCode(e.target.value)} placeholder="AT190226" required /></label>{profileFields(profile,setProfile)}</>}
        <button className="button primary" disabled={busy}>{busy?"Đang tạo…":"Tạo tài khoản"}</button>
      </form>
      <div className="card table-card"><div className="table-scroll"><table><thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Hồ sơ Student</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead><tbody>
        {!users.length&&<tr><td colSpan={5}><div className="empty-state compact">Chưa có tài khoản.</div></td></tr>}
        {users.map((user)=><tr key={user.id}><td><strong>{user.username}</strong><span className="table-sub mono">{user.id.slice(0,8)}</span></td><td><span className={`role-chip ${user.role}`}>{roleLabel[user.role].split(" — ")[0]}</span></td><td>{user.role==="student"?<><strong>{user.recipientName}</strong><span className="table-sub mono">{user.studentCode}</span><span className="table-sub">{user.dateOfBirth||"Thiếu ngày sinh"} · {user.email||"Thiếu email"} · {user.cohort||"Thiếu niên khóa"}</span></>:"—"}</td><td>{new Date(user.createdAt).toLocaleDateString("vi-VN")}</td><td>{user.role==="student"?<button type="button" className="button secondary small-button" onClick={()=>startEdit(user)}>Sửa hồ sơ</button>:"—"}</td></tr>)}
      </tbody></table></div></div>
    </div>
    {editing&&<form onSubmit={saveEdit} className="card form-grid"><div className="full-width"><h3>Cập nhật {editing.studentCode} — {editing.username}</h3><p className="muted">Thay đổi chỉ áp dụng cho phiếu lập sau thời điểm cập nhật.</p></div>{profileFields(editProfile,setEditProfile)}<div className="form-actions full-width"><button className="button primary" disabled={busy}>Lưu hồ sơ</button><button type="button" className="button secondary" onClick={()=>setEditing(null)}>Hủy</button></div></form>}
  </section>;
}
