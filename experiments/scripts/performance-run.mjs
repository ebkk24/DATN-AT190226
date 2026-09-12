import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("="); if (!(line.slice(0, i) in process.env)) process.env[line.slice(0, i)] = line.slice(i + 1);
}
const args = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, "").split("=")));
const size = Number(args.size); const repeat = Number(args.repeat);
if (![10, 100, 500].includes(size) || ![1, 2, 3].includes(repeat)) throw new Error("Dùng --size=10|100|500 --repeat=1|2|3");
const accounts = JSON.parse(fs.readFileSync(path.join(root, "experiments/private/current-accounts.json"), "utf8"));
const base = accounts.baseUrl; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (v, m) => { if (!v) throw new Error(m); };
async function call(url, { method = "GET", token, body } = {}) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const headers = {}; if (token) headers.Authorization = `Bearer ${token}`; if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text(); let payload; try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
    if (response.status !== 429) return { status: response.status, body: payload };
    await sleep(2100);
  }
  throw new Error("Rate limit không phục hồi");
}
async function login(a) { const r = await call("/api/auth/login", { method: "POST", body: { username: a.username, password: a.password } }); assert(r.status === 201 && r.body?.token, `Login ${a.role} lỗi ${r.status}`); return r.body.token; }
const bcli = (method, params = []) => JSON.parse(execFileSync("docker", ["exec", "datn-bitcoin-core", "bitcoin-cli", "-regtest", `-rpcuser=${process.env.BITCOIN_RPC_USER}`, `-rpcpassword=${process.env.BITCOIN_RPC_PASSWORD}`, method, ...params.map(String)], { encoding: "utf8" }));
function cpuSnapshot() { const a = fs.readFileSync("/proc/stat", "utf8").split("\n")[0].trim().split(/\s+/).slice(1).map(Number); return { total: a.reduce((x, y) => x + y, 0), idle: a[3] + (a[4] || 0) }; }
function memorySnapshot() { const m = Object.fromEntries(fs.readFileSync("/proc/meminfo", "utf8").split("\n").filter(Boolean).map((l) => { const [k, v] = l.split(/:\s+/); return [k, Number(v.split(/\s+/)[0]) * 1024]; })); return { usedMb: (m.MemTotal - m.MemAvailable) / 1048576 }; }
function backendRssMb() { try { const pid = execFileSync("systemctl", ["--user", "show", "datn-blockcerts-backend.service", "-p", "MainPID", "--value"], { encoding: "utf8" }).trim(); const line = fs.readFileSync(`/proc/${pid}/status`, "utf8").split("\n").find((x) => x.startsWith("VmRSS:")); return Number(line.split(/\s+/)[1]) / 1024; } catch { return null; } }
let prevCpu = cpuSnapshot(); const samples = [];
function sample() { const cur = cpuSnapshot(); const dt = cur.total - prevCpu.total; const di = cur.idle - prevCpu.idle; prevCpu = cur; const mem = memorySnapshot(); samples.push({ at: new Date().toISOString(), cpuPercent: dt ? ((dt - di) * 100) / dt : 0, memoryUsedMb: mem.usedMb, backendRssMb: backendRssMb(), load1: os.loadavg()[0] }); }
const resultPath = path.join(root, "experiments/results/performance-raw.json");
let report = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, "utf8")) : { kind: "OFFICIAL_BATCH_PERFORMANCE", sourceTag: "b12-frozen-20260912-r2", sourceCommit: execFileSync("git", ["rev-parse", "b12-frozen-20260912-r2^{}"], { cwd: root, encoding: "utf8" }).trim(), startedAt: new Date().toISOString(), repetitions: 3, sizes: [10, 100, 500], runs: [] };
if (report.runs.some((x) => x.size === size && x.repeat === repeat && x.passed)) { console.log(JSON.stringify({ skipped: true, size, repeat })); process.exit(0); }
const maker = await login(accounts.maker); const checker = await login(accounts.checker);
const code = `official-${accounts.runId}-n${size}-r${repeat}`;
const recipients = Array.from({ length: size }, (_, i) => ({ recipientName: `${code}-SV-${String(i + 1).padStart(4, "0")}`, pubkey: process.env.ISSUING_ADDRESS, identity: `${code}-${i + 1}@example.invalid` }));
const blockBefore = bcli("getblockcount"); const totalStart = Date.now(); sample(); const timer = setInterval(sample, 1000);
let run;
try {
  const requestStart = Date.now(); const requested = await call("/api/issue/batch/request", { method: "POST", token: maker, body: { recipients } }); const requestSeconds = (Date.now() - requestStart) / 1000;
  assert(requested.status === 201 && requested.body?.count === size && requested.body?.ids?.length === size && requested.body?.batchId, `Request batch lỗi ${requested.status}`);
  const batchId = requested.body.batchId; const approvalStart = Date.now(); const approved = await call("/api/issue/batch/approve", { method: "POST", token: checker, body: { ids: requested.body.ids } });
  assert(approved.status === 201 && approved.body?.count === size && approved.body?.batchId === batchId, `Approve batch lỗi ${approved.status}`);
  let rows = [];
  for (let i = 0; i < 240; i++) { const q = await call(`/api/issue?batchId=${encodeURIComponent(batchId)}`, { token: checker }); assert(q.status === 200 && Array.isArray(q.body), `Poll lỗi ${q.status}`); rows = q.body; if (rows.length === size && rows.every((x) => ["issued", "failed"].includes(x.status))) break; await sleep(2000); }
  const approvalToIssuedSeconds = (Date.now() - approvalStart) / 1000; const endToEndSeconds = (Date.now() - totalStart) / 1000;
  const issued = rows.filter((x) => x.status === "issued"); const failed = rows.filter((x) => x.status === "failed"); assert(rows.length === size && issued.length === size && failed.length === 0, `Kết quả ${issued.length}/${size}, failed=${failed.length}`);
  const txids = [...new Set(issued.map((x) => x.txid))]; const roots = [...new Set(issued.map((x) => x.merkleRoot))]; const certIds = new Set(issued.map((x) => x.certUid)); assert(txids.length === 1 && roots.length === 1 && certIds.size === size, `Batch không đạt 1 tx/1 root/UID riêng: ${txids.length}/${roots.length}/${certIds.size}`);
  const blockAfter = bcli("getblockcount"); assert(blockAfter - blockBefore === 1, `Block delta phải 1, nhận ${blockAfter - blockBefore}`);
  const transaction = bcli("getrawtransaction", [txids[0], true]); assert((transaction.confirmations || 0) >= 1, "Anchor chưa có confirmation");
  clearInterval(timer); sample();
  const positions = [...new Set([0, Math.floor(size / 2), size - 1])]; const verificationSamples = [];
  for (const index of positions) { const row = issued[index]; const cert = JSON.parse(fs.readFileSync(path.join(root, "blockcerts/cert-issuer/blockchain_certificates", `${row.certUid}.json`), "utf8")); assert(cert.issuer === `${base}/api/blockcerts/issuers/kma/profile.json`, "Issuer URL sai"); assert(String(cert.credentialSubject?.id || "").startsWith("ecdsa-koblitz-pubkey:"), "Subject URI sai"); const v = await call("/api/verify", { method: "POST", body: { certificate: cert } }); assert(v.status === 201 && v.body?.status === "VALID", `Mẫu ${index} không VALID: ${v.body?.status}`); verificationSamples.push({ index, certUid: row.certUid, status: v.body.status }); }
  const cpu = samples.map((x) => x.cpuPercent); const mem = samples.map((x) => x.memoryUsedMb); const rss = samples.map((x) => x.backendRssMb).filter((x) => x !== null);
  run = { code, size, repeat, batchId, jobId: approved.body.jobId, startedAt: new Date(totalStart).toISOString(), completedAt: new Date().toISOString(), requestSeconds, approvalToIssuedSeconds, endToEndSeconds, secondsPerCertificate: approvalToIssuedSeconds / size, throughputCertificatesPerSecond: size / approvalToIssuedSeconds, successRatePercent: (issued.length * 100) / size, issued: issued.length, failed: failed.length, transactionCount: txids.length, txid: txids[0], merkleRoot: roots[0], uniqueCertificateIds: certIds.size, blockBefore, blockAfter, blockDelta: blockAfter - blockBefore, confirmations: transaction.confirmations || 0, samplesCount: samples.length, cpuAveragePercent: cpu.reduce((a, b) => a + b, 0) / cpu.length, cpuMaxPercent: Math.max(...cpu), memoryUsedAverageMb: mem.reduce((a, b) => a + b, 0) / mem.length, memoryUsedMaxMb: Math.max(...mem), backendRssAverageMb: rss.reduce((a, b) => a + b, 0) / rss.length, backendRssMaxMb: Math.max(...rss), verificationSamples, passed: true };
  const manifestPath = path.join(root, "backend/.batch-work", batchId, "manifest.json"); assert(fs.existsSync(manifestPath), "Thiếu manifest worker"); const manifests = path.join(root, "experiments/results/manifests"); fs.mkdirSync(manifests, { recursive: true }); fs.copyFileSync(manifestPath, path.join(manifests, `${code}.json`));
} catch (error) { clearInterval(timer); run = { code, size, repeat, completedAt: new Date().toISOString(), error: error.message, passed: false }; }
report.runs = report.runs.filter((x) => !(x.size === size && x.repeat === repeat)); report.runs.push(run); report.runs.sort((a, b) => a.size - b.size || a.repeat - b.repeat); report.updatedAt = new Date().toISOString(); report.complete = report.runs.filter((x) => x.passed).length === 9; fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(run)); if (!run.passed) process.exit(1);
