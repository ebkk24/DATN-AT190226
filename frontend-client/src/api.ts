const API = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? window.location.origin
    : `${window.location.protocol}//${window.location.hostname}:4000`)
).replace(/\/$/, "");
function token() {
  return localStorage.getItem("token");
}
export async function login(username: string, password: string) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw new Error("Sai tài khoản hoặc mật khẩu");
  return r.json();
}
export async function myCerts() {
  const t = token();
  const r = await fetch(`${API}/api/issue/holder/certificates`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (r.status === 401) throw new Error("Hết phiên");
  if (!r.ok) throw new Error(`Lỗi ${r.status}`);
  return r.json();
}
export function logout() {
  localStorage.clear();
}
