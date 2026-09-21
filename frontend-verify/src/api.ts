const API = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? window.location.origin
    : `${window.location.protocol}//${window.location.hostname}:4000`)
).replace(/\/$/, "");

export interface VerifyResult {
  status: string;
  txid?: string;
  issuedOn?: string;
  recipientName?: string;
  certUid?: string;
  studentCode?: string;
  dateOfBirth?: string;
  email?: string;
  cohort?: string;
  degreeName?: string;
  major?: string;
  educationLevel?: string;
  graduationRank?: string;
  graduationYear?: number;
  issueDate?: string;
  diplomaNumber?: string;
  trainingMode?: string;
  message?: string;
  revocationTxid?: string;
  [key: string]: unknown;
}

export async function verify(certificate: unknown): Promise<VerifyResult> {
  const response = await fetch(`${API}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ certificate }),
  });
  return response.json() as Promise<VerifyResult>;
}
