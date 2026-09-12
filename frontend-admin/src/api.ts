const API = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? window.location.origin
    : `${window.location.protocol}//${window.location.hostname}:4000`)
).replace(/\/$/, "");

export type Role = "maker" | "checker" | "student";
export type IssuanceStatus =
  | "pending_approval"
  | "queued"
  | "processing"
  | "issued"
  | "revoked"
  | "rejected"
  | "failed";

export type CertificateRecord = {
  id: string;
  recipientName: string;
  pubkey?: string | null;
  identity?: string | null;
  status: IssuanceStatus;
  requestedBy?: string | null;
  approvedBy?: string | null;
  certUid?: string | null;
  batchId?: string | null;
  txid?: string | null;
  merkleRoot?: string | null;
  revocationTxid?: string | null;
  revokedBy?: string | null;
  revokeReason?: string | null;
  createdAt: string;
  errorMessage?: string | null;
};

export type UserRecord = {
  id: string;
  username: string;
  role: Role;
  recipientName?: string | null;
  createdAt: string;
};

export type AuditRecord = {
  id: string;
  action: string;
  actor?: string | null;
  actorRole?: string | null;
  targetId?: string | null;
  detail?: string | null;
  txid?: string | null;
  createdAt: string;
};

export type RecipientInput = {
  recipientName: string;
  pubkey: string;
  identity?: string;
};

function token() {
  return localStorage.getItem("token");
}

export async function login(
  username: string,
  password: string,
): Promise<{
  token: string;
  role: Role;
  username: string;
}> {
  const response = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error("Sai tài khoản hoặc mật khẩu");
  return response.json();
}

async function authFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const accessToken = token();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (response.status === 401) {
    logout();
    throw new Error("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại");
  }
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const message = Array.isArray(payload?.message)
      ? payload.message.join("; ")
      : payload?.message;
    throw new Error(message || `Máy chủ trả lỗi ${response.status}`);
  }
  return payload as T;
}

const jsonOptions = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  requestIssue: (recipient: RecipientInput) =>
    authFetch<{ id: string; status: string }>(
      "/api/issue/request",
      jsonOptions("POST", recipient),
    ),

  requestBatch: (recipients: RecipientInput[]) =>
    authFetch<{
      count: number;
      status: string;
      ids: string[];
      batchId: string;
    }>("/api/issue/batch/request", jsonOptions("POST", { recipients })),

  listPending: () =>
    authFetch<CertificateRecord[]>("/api/issue?status=pending_approval"),

  listAll: () => authFetch<CertificateRecord[]>("/api/issue"),

  approve: (id: string) =>
    authFetch<{ id: string; status: string }>(
      `/api/issue/${id}/approve`,
      jsonOptions("POST", {}),
    ),

  approveBatch: (ids: string[]) =>
    authFetch<{
      jobId: string;
      count: number;
      status: string;
      batchId: string;
    }>("/api/issue/batch/approve", jsonOptions("POST", { ids })),

  reject: (id: string, reason: string) =>
    authFetch<{ id: string; status: string }>(
      `/api/issue/${id}/reject`,
      jsonOptions("POST", { reason }),
    ),

  revoke: (id: string, reason: string) =>
    authFetch<{
      id: string;
      certUid: string;
      status: string;
      revocationTxid: string;
    }>(`/api/revoke/${id}`, jsonOptions("POST", { reason })),

  listUsers: () => authFetch<UserRecord[]>("/api/admin/users"),

  createUser: (user: {
    username: string;
    password: string;
    role: Role;
    recipientName?: string;
  }) =>
    authFetch<{ id: string; username: string; role: Role }>(
      "/api/admin/users",
      jsonOptions("POST", user),
    ),

  listAudit: () => authFetch<AuditRecord[]>("/api/audit"),
};

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("username");
}

export function getRole() {
  return localStorage.getItem("role") as Role | null;
}

export function getUsername() {
  return localStorage.getItem("username");
}
