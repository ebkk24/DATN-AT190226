import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(path.join(root, "backend/package.json"));
const { LDMerkleProof2019 } = require("jsonld-signatures-merkleproof2019");
const { Encoder } = require("@blockcerts/lds-merkle-proof-2019");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
  const at = line.indexOf("=");
  if (!(line.slice(0, at) in process.env)) process.env[line.slice(0, at)] = line.slice(at + 1);
}
const accounts = JSON.parse(fs.readFileSync(path.join(root, "experiments/private/current-accounts.json"), "utf8"));
const base = accounts.baseUrl;
const startedAt = new Date();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function call(pathname, { method = "GET", token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + pathname, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: response.status, body: payload };
}
async function login(account) {
  const r = await call("/api/auth/login", { method: "POST", body: { username: account.username, password: account.password } });
  assert(r.status === 201 && r.body?.token, `Đăng nhập ${account.role} lỗi ${r.status}`);
  assert(r.body.role === account.role, `Role JWT sai cho ${account.role}`);
  return r.body.token;
}
async function confirmations(txid) {
  const out = execFileSync("docker", ["exec", "datn-bitcoin-core", "bitcoin-cli", "-regtest", `-rpcuser=${process.env.BITCOIN_RPC_USER}`, `-rpcpassword=${process.env.BITCOIN_RPC_PASSWORD}`, "getrawtransaction", txid, "true"], { encoding: "utf8" });
  return JSON.parse(out).confirmations || 0;
}
const checker = await login(accounts.checker);
const maker = await login(accounts.maker);
const student = await login(accounts.student);
const issueStart = Date.now();
const request = await call("/api/issue/request", { method: "POST", token: maker, body: { recipientName: accounts.student.recipientName, pubkey: process.env.ISSUING_ADDRESS, identity: `e2e-${accounts.runId}@example.invalid` } });
assert(request.status === 201 && request.body?.id, `Maker lập phiếu lỗi ${request.status}`);
const id = request.body.id;
const makerApprove = await call(`/api/issue/${id}/approve`, { method: "POST", token: maker, body: {} });
assert(makerApprove.status === 403, `Maker tự duyệt phải 403, nhận ${makerApprove.status}`);
const approved = await call(`/api/issue/${id}/approve`, { method: "POST", token: checker, body: {} });
assert(approved.status === 201 && approved.body?.status === "queued", `Checker duyệt lỗi ${approved.status}`);
let row = null;
for (let i = 0; i < 180; i++) {
  const r = await call(`/api/issue/${id}`, { token: checker });
  assert(r.status === 200, `Đọc trạng thái lỗi ${r.status}`);
  row = r.body;
  if (["issued", "failed"].includes(row.status)) break;
  await sleep(2000);
}
assert(row?.status === "issued", `Worker không issued: ${row?.status} ${row?.errorMessage || ""}`);
assert(row.certUid && row.txid && row.merkleRoot, "Issued thiếu certUid/txid/merkleRoot");
const issueSeconds = (Date.now() - issueStart) / 1000;
const certPath = path.join(root, "blockcerts/cert-issuer/blockchain_certificates", `${row.certUid}.json`);
assert(fs.existsSync(certPath), "Không tìm thấy JSON chứng thư đã phát hành");
const certificate = JSON.parse(fs.readFileSync(certPath, "utf8"));
assert(certificate.proof?.verificationMethod === `${base}/api/blockcerts/issuers/kma/profile.json`, "verificationMethod chưa dùng Issuer Profile ổn định");
assert(certificate.issuer === `${base}/api/blockcerts/issuers/kma/profile.json`, "issuer chưa dùng Issuer Profile ổn định");
const original = await call("/api/verify", { method: "POST", body: { certificate } });
assert(original.status === 201 && original.body?.status === "VALID", `Chứng thư gốc không VALID: ${original.body?.status}`);
const modifiedRecipient = structuredClone(certificate);
modifiedRecipient.credentialSubject.name += " [ĐÃ SỬA]";
const modifiedCredential = structuredClone(certificate);
modifiedCredential.name += " [ĐÃ SỬA]";
const modifiedProof = structuredClone(certificate);
const pv = modifiedProof.proof.proofValue;
modifiedProof.proof.proofValue = pv.slice(0, -1) + (pv.endsWith("1") ? "2" : "1");
const modifiedTxid = structuredClone(certificate);
const receipt = LDMerkleProof2019.decodeMerkleProof2019(modifiedTxid.proof);
receipt.anchors = receipt.anchors.map((anchor) => anchor.replace(/:[0-9a-f]{64}$/i, `:${"0".repeat(64)}`));
modifiedTxid.proof.proofValue = new Encoder(receipt).encode();
const tampered = {};
for (const [name, cert] of Object.entries({ recipientName: modifiedRecipient, credentialName: modifiedCredential, proofValue: modifiedProof, txid: modifiedTxid })) {
  const r = await call("/api/verify", { method: "POST", body: { certificate: cert } });
  tampered[name] = r.body?.status || `HTTP_${r.status}`;
  assert(r.body?.status !== "VALID", `Bản sửa ${name} vẫn VALID`);
}
const holder = await call("/api/issue/holder/certificates", { token: student });
assert(holder.status === 200 && Array.isArray(holder.body) && holder.body.some((x) => x.id === id), "Holder không thấy chứng thư của mình");
const studentRevoke = await call(`/api/revoke/${id}`, { method: "POST", token: student, body: { reason: "RBAC test" } });
const makerRevoke = await call(`/api/revoke/${id}`, { method: "POST", token: maker, body: { reason: "RBAC test" } });
assert(studentRevoke.status === 403 && makerRevoke.status === 403, `RBAC revoke sai: student=${studentRevoke.status}, maker=${makerRevoke.status}`);
const revoked = await call(`/api/revoke/${id}`, { method: "POST", token: checker, body: { reason: "Thu hồi trong kiểm thử E2E B12" } });
assert(revoked.status === 201 && revoked.body?.status === "revoked", `Checker thu hồi lỗi ${revoked.status}`);
const revokeConfirmations = await confirmations(revoked.body.revocationTxid);
assert(revokeConfirmations >= 1, `Giao dịch thu hồi chưa xác nhận: ${revokeConfirmations}`);
const afterRevoke = await call("/api/verify", { method: "POST", body: { certificate } });
assert(afterRevoke.status === 201 && afterRevoke.body?.status === "REVOKED", `Sau thu hồi không REVOKED: ${afterRevoke.body?.status}`);
const revocationList = await call("/api/blockcerts/issuers/kma/revocation-list.json");
assert(revocationList.status === 200 && revocationList.body.revokedAssertions.some((x) => x.id.includes(row.certUid)), "Revocation List chưa có chứng thư vừa thu hồi");
const audit = await call("/api/audit", { token: checker });
assert(audit.status === 200 && Array.isArray(audit.body), `Đọc audit lỗi ${audit.status}`);
const related = audit.body.filter((x) => x.targetId === id);
for (const action of ["request", "approve", "issue", "revoke"]) assert(related.some((x) => x.action === action), `Audit thiếu ${action}`);
assert(related.find((x) => x.action === "request")?.actorRole === "maker", "Audit request sai role");
for (const action of ["approve", "issue", "revoke"]) assert(related.find((x) => x.action === action)?.actorRole === "checker", `Audit ${action} sai role`);
const result = {
  kind: "B12_E2E_PREFLIGHT",
  runId: accounts.runId,
  startedAt: startedAt.toISOString(),
  completedAt: new Date().toISOString(),
  issuance: { id, certUid: row.certUid, txid: row.txid, merkleRoot: row.merkleRoot, seconds: issueSeconds, confirmations: await confirmations(row.txid), profile: certificate.proof.verificationMethod },
  rbac: { makerSelfApprove: makerApprove.status, studentRevoke: studentRevoke.status, makerRevoke: makerRevoke.status, checkerRevoke: revoked.status },
  verification: { original: original.body.status, tampered, afterRevoke: afterRevoke.body.status },
  revocation: { txid: revoked.body.revocationTxid, confirmations: revokeConfirmations, listed: true },
  holder: { visible: true, returnedCount: holder.body.length },
  audit: related.map(({ action, actor, actorRole, targetId, txid, createdAt }) => ({ action, actor, actorRole, targetId, txid, createdAt })),
  passed: true,
};
const out = path.join(root, "experiments/results/e2e-preflight.json");
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ passed: true, id, issueSeconds, original: result.verification.original, tampered, afterRevoke: result.verification.afterRevoke, rbac: result.rbac, auditActions: result.audit.map((x) => x.action) }));
