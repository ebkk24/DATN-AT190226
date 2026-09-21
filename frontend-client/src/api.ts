const API = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? window.location.origin
    : `${window.location.protocol}//${window.location.hostname}:4000`)
).replace(/\/$/, "");

export interface LoginResponse {
  token: string;
  username: string;
  role: string;
}

export interface HolderCertificate {
  id: string;
  certUid: string;
  recipientName: string;
  studentCode?: string | null;
  studentDateOfBirth?: string | null;
  studentEmail?: string | null;
  cohort?: string | null;
  degreeName?: string | null;
  major?: string | null;
  educationLevel?: string | null;
  graduationRank?: string | null;
  graduationYear?: number | null;
  issueDate?: string | null;
  diplomaNumber?: string | null;
  trainingMode?: string | null;
  txid?: string;
  status?: string;
  certificate?: {
    name?: string;
    issuanceDate?: string;
    [key: string]: unknown;
  };
}

function token() {
  return localStorage.getItem("token");
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error("Tài khoản hoặc mật khẩu chưa đúng");
  return response.json() as Promise<LoginResponse>;
}

export async function myCerts(): Promise<HolderCertificate[]> {
  const response = await fetch(`${API}/api/issue/holder/certificates`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (response.status === 401) throw new Error("Phiên đăng nhập đã hết hạn");
  if (!response.ok) throw new Error("Không tải được danh sách văn bằng");
  return response.json() as Promise<HolderCertificate[]>;
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
}
