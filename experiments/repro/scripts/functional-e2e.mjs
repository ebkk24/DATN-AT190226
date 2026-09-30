import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const runtime = path.join(root, "experiments/repro/runtime");
const require = createRequire(path.join(root, "backend/package.json"));
const { LDMerkleProof2019 } = require("jsonld-signatures-merkleproof2019");
const { Encoder } = require("@blockcerts/lds-merkle-proof-2019");
const { Client } = require("pg");
for (const line of fs.readFileSync(path.join(runtime, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
  const at = line.indexOf("="); process.env[line.slice(0, at)] = line.slice(at + 1);
}
const accounts = JSON.parse(fs.readFileSync(path.join(runtime, "private/accounts.json"), "utf8"));
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
  const out = execFileSync("docker", ["exec", "datn-repro-bitcoin-core", "/opt/bitcoin-31.1/bin/bitcoin-cli", "-regtest", `-rpcuser=${process.env.BITCOIN_RPC_USER}`, `-rpcpassword=${process.env.BITCOIN_RPC_PASSWORD}`, "getrawtransaction", txid, "true"], { encoding: "utf8" });
  return JSON.parse(out).confirmations || 0;
}
const checker = await login(accounts.checker);
const maker = await login(accounts.maker);
const student = await login(accounts.student);
const studentTwin = await login(accounts.studentTwin);
const issueStart = Date.now();
const business = {
  degreeName: "Bằng tốt nghiệp đại học",
  major: "An Toàn Thông Tin",
  educationLevel: "Đại học",
  graduationRank: "Giỏi",
  graduationYear: 2026,
  issueDate: "2026-09-21",
  diplomaNumber: `KMA-E2E-${Date.now()}`,
  trainingMode: "Chính quy",
};
const request = await call("/api/issue/request", { method: "POST", token: maker, body: { studentCode: accounts.student.studentCode, pubkey: process.env.ISSUING_ADDRESS, identity: `e2e-${accounts.runId}@example.invalid`, ...business } });
assert(request.status === 201 && request.body?.id, `Maker lập phiếu lỗi ${request.status}`);
const id = request.body.id;
const otherMakerAccount = {
  username: `maker-other-${Date.now()}`,
  password: `Local-E2E-${Date.now()}!`,
  role: "maker",
};
const createOtherMaker = await call("/api/admin/users", { method: "POST", token: checker, body: otherMakerAccount });
assert(createOtherMaker.status === 201, `Tạo Maker B lỗi ${createOtherMaker.status}`);
const otherMaker = await login(otherMakerAccount);
const otherMakerList = await call("/api/issue", { token: otherMaker });
assert(otherMakerList.status === 200 && Array.isArray(otherMakerList.body) && !otherMakerList.body.some((x) => x.id === id), "Maker B liệt kê được yêu cầu của Maker A");
const otherMakerRead = await call(`/api/issue/${id}`, { token: otherMaker });
assert(otherMakerRead.status === 404, `Maker B đọc trực tiếp yêu cầu Maker A phải 404, nhận ${otherMakerRead.status}`);
const otherMakerAudit = await call("/api/audit", { token: otherMaker });
assert(otherMakerAudit.status === 200 && Array.isArray(otherMakerAudit.body) && !otherMakerAudit.body.some((x) => x.targetId === id), "Maker B đọc được audit của yêu cầu Maker A");
const makerAuditOwn = await call("/api/audit", { token: maker });
assert(makerAuditOwn.status === 200 && Array.isArray(makerAuditOwn.body) && makerAuditOwn.body.some((x) => x.targetId === id && x.action === "request"), "Maker A không thấy audit request của mình");
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
const certPath = path.join(runtime, "project/blockcerts/cert-issuer/blockchain_certificates", `${row.certUid}.json`);
assert(fs.existsSync(certPath), "Không tìm thấy JSON chứng thư đã phát hành");
const certificate = JSON.parse(fs.readFileSync(certPath, "utf8"));
assert(certificate.proof?.verificationMethod === `${base}/api/blockcerts/issuers/kma/profile.json`, "verificationMethod chưa dùng Issuer Profile ổn định");
assert(certificate.issuer === `${base}/api/blockcerts/issuers/kma/profile.json`, "issuer chưa dùng Issuer Profile ổn định");
for (const [key, value] of Object.entries(business)) assert(String(certificate.credentialSubject?.[key]) === String(value), `Credential sai trường ${key}`);
assert(certificate.credentialSubject?.studentCode === accounts.student.studentCode, "Credential sai studentCode snapshot");
const original = await call("/api/verify", { method: "POST", body: { certificate } });
assert(original.status === 200 && original.body?.status === "VALID", `Chứng thư gốc không VALID: ${original.body?.status}`);
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
  assert(r.body?.status === "INVALID", `Bản sửa ${name} phải INVALID, nhận ${tampered[name]}`);
}
const holder = await call("/api/issue/holder/certificates", { token: student });
assert(holder.status === 200 && Array.isArray(holder.body) && holder.body.some((x) => x.id === id), "Holder không thấy chứng thư của mình");
const holderRow = holder.body.find((x) => x.id === id);
assert(holderRow.diplomaNumber === business.diplomaNumber && holderRow.studentCode === accounts.student.studentCode, "Holder thiếu dữ liệu nghiệp vụ hoặc sai chủ sở hữu");
const twinHolder = await call("/api/issue/holder/certificates", { token: studentTwin });
assert(twinHolder.status === 200 && Array.isArray(twinHolder.body) && !twinHolder.body.some((x) => x.id === id), "Student trùng họ tên nhìn thấy nhầm chứng thư");
const studentRevoke = await call(`/api/revoke/${id}`, { method: "POST", token: student, body: { reason: "RBAC test" } });
const makerRevoke = await call(`/api/revoke/${id}`, { method: "POST", token: maker, body: { reason: "RBAC test" } });
assert(studentRevoke.status === 403 && makerRevoke.status === 403, `RBAC revoke sai: student=${studentRevoke.status}, maker=${makerRevoke.status}`);
const revoked = await call(`/api/revoke/${id}`, { method: "POST", token: checker, body: { reason: "Thu hồi trong kiểm thử E2E B12" } });
assert(revoked.status === 201 && revoked.body?.status === "revoked", `Checker thu hồi lỗi ${revoked.status}`);
const revokeConfirmations = await confirmations(revoked.body.revocationTxid);
assert(revokeConfirmations >= 1, `Giao dịch thu hồi chưa xác nhận: ${revokeConfirmations}`);
const afterRevoke = await call("/api/verify", { method: "POST", body: { certificate } });
assert(afterRevoke.status === 200 && afterRevoke.body?.status === "REVOKED", `Sau thu hồi không REVOKED: ${afterRevoke.body?.status}`);
const revocationList = await call("/api/blockcerts/issuers/kma/revocation-list.json");
const publicRevocation = revocationList.body.revokedAssertions.find((x) => x.id.includes(row.certUid));
assert(revocationList.status === 200 && publicRevocation, "Revocation List chưa có chứng thư vừa thu hồi");
assert(publicRevocation.revocationReason === "Chứng thư đã bị thu hồi", "Revocation List làm lộ lý do nội bộ");
const audit = await call("/api/audit", { token: checker });
assert(audit.status === 200 && Array.isArray(audit.body), `Đọc audit lỗi ${audit.status}`);
const related = audit.body.filter((x) => x.targetId === id);
for (const action of ["request", "approve", "issue", "revoke"]) assert(related.some((x) => x.action === action), `Audit thiếu ${action}`);
assert(related.find((x) => x.action === "request")?.actorRole === "maker", "Audit request sai role");
for (const action of ["approve", "issue", "revoke"]) assert(related.find((x) => x.action === action)?.actorRole === "checker", `Audit ${action} sai role`);
const db = new Client({ host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT), database: process.env.POSTGRES_DB, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD });
await db.connect();
let verificationLogs;
try {
  verificationLogs = (await db.query('select raw, "certificateVerification", "anchorVerification" from verification_logs where "certId" = $1', [row.certUid])).rows;
} finally { await db.end(); }
assert(verificationLogs.length >= 1, "Không có verification log cho chứng thư E2E");
const serializedLogs = JSON.stringify(verificationLogs);
for (const sensitive of [certificate.credentialSubject?.name, certificate.credentialSubject?.email, certificate.credentialSubject?.studentCode].filter(Boolean)) {
  assert(!serializedLogs.includes(String(sensitive)), `Verification log làm lộ dữ liệu cá nhân: ${sensitive}`);
}
const certificateMode = fs.statSync(certPath).mode & 0o777;
assert(certificateMode === 0o600, `Quyền tệp chứng thư phải 600, nhận ${certificateMode.toString(8)}`);
const batchManifestPath = path.join(runtime, "project/backend/.batch-work", approved.body.batchId, "manifest.json");
assert(fs.existsSync(batchManifestPath), "Thiếu batch manifest E2E");
const batchManifest = JSON.parse(fs.readFileSync(batchManifestPath, "utf8"));
assert(batchManifest.schema === "datn-batch-manifest-v1" && batchManifest.certificateFiles?.some((x) => x.certUid === row.certUid), "Batch manifest thiếu checksum chứng thư");
const manifestDir = path.join(runtime, "results/manifests"); fs.mkdirSync(manifestDir, { recursive: true });
fs.copyFileSync(batchManifestPath, path.join(manifestDir, `functional-${id}.json`));
const result = {
  kind: "B12_E2E_PREFLIGHT",
  runId: accounts.runId,
  startedAt: startedAt.toISOString(),
  completedAt: new Date().toISOString(),
  issuance: { id, certUid: row.certUid, txid: row.txid, merkleRoot: row.merkleRoot, seconds: issueSeconds, confirmations: await confirmations(row.txid), profile: certificate.proof.verificationMethod },
  rbac: { makerSelfApprove: makerApprove.status, otherMakerListVisible: otherMakerList.body.some((x) => x.id === id), otherMakerRead: otherMakerRead.status, otherMakerAuditVisible: otherMakerAudit.body.some((x) => x.targetId === id), studentRevoke: studentRevoke.status, makerRevoke: makerRevoke.status, checkerRevoke: revoked.status },
  verification: { original: original.body.status, tampered, afterRevoke: afterRevoke.body.status },
  revocation: { txid: revoked.body.revocationTxid, confirmations: revokeConfirmations, listed: true, publicReasonIsGeneric: true },
  holder: { visible: true, returnedCount: holder.body.length, sameNameIsolation: true, twinReturnedCount: twinHolder.body.length },
  privacy: { verificationLogsSanitized: true, certificateFileMode: certificateMode.toString(8) },
  audit: related.map(({ action, actor, actorRole, targetId, txid, createdAt }) => ({ action, actor, actorRole, targetId, txid, createdAt })),
  passed: true,
};
const out = path.join(runtime, "results/functional-e2e.json");
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ passed: true, id, issueSeconds, original: result.verification.original, tampered, afterRevoke: result.verification.afterRevoke, rbac: result.rbac, sameNameIsolation: result.holder.sameNameIsolation, auditActions: result.audit.map((x) => x.action) }));
