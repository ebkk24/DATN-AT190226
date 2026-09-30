import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const runtime = path.join(root, "experiments/repro/runtime");
const results = path.join(runtime, "results");
const require = createRequire(path.join(root, "backend/package.json"));
const { LDMerkleProof2019 } = require("jsonld-signatures-merkleproof2019");
const { Client } = require("pg");
for (const line of fs.readFileSync(path.join(runtime, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
  const at = line.indexOf("="); process.env[line.slice(0, at)] = line.slice(at + 1);
}
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const report = JSON.parse(fs.readFileSync(path.join(results, "benchmark.json"), "utf8"));
assert(report.complete && report.runs.length === 9 && report.runs.every((x) => x.passed), "Benchmark chưa đủ 9 run đạt");
assert(report.runs.reduce((n, x) => n + x.issued, 0) === 1830, "Tổng số chứng thư không phải 1.830");
const db = new Client({ host: process.env.POSTGRES_HOST, port: +process.env.POSTGRES_PORT, database: process.env.POSTGRES_DB, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD });
await db.connect();
const jobs = []; const audits = []; const allTargets = new Set(); const allUids = new Set();
try {
  for (const run of report.runs) {
    const work = path.join(runtime, "project/backend/.batch-work", run.issuanceBatchId || run.batchId);
    const manifestBytes = fs.readFileSync(path.join(work, "manifest.json"));
    const manifest = JSON.parse(manifestBytes);
    assert(crypto.createHash("sha256").update(manifestBytes).digest("hex") === run.batchManifestSha256, `Checksum manifest sai ${run.code}`);
    assert(manifest.batchId === (run.issuanceBatchId || run.batchId) && manifest.count === run.size && manifest.certificateFiles.length === run.size, `Manifest sai ${run.code}`);
    assert(manifest.txid === run.txid && manifest.merkleRoot === run.merkleRoot, `Anchor trong manifest sai ${run.code}`);
    const q = await db.query('SELECT status,count(*)::int AS count,count(DISTINCT txid)::int AS tx_count,count(DISTINCT "merkleRoot")::int AS root_count,count(DISTINCT "certUid")::int AS uid_count,count(DISTINCT "requestBatchId")::int AS request_count FROM issued_certificates WHERE "issuanceBatchId"=$1 GROUP BY status', [run.issuanceBatchId || run.batchId]);
    assert(q.rows.length === 1 && q.rows[0].status === "issued" && q.rows[0].count === run.size && q.rows[0].tx_count === 1 && q.rows[0].root_count === 1 && q.rows[0].uid_count === run.size && q.rows[0].request_count === 1, `DB sai ${run.code}`);
    const tx = JSON.parse(execFileSync("docker", ["exec", "datn-repro-bitcoin-core", "/opt/bitcoin-31.1/bin/bitcoin-cli", "-regtest", `-rpcuser=${process.env.BITCOIN_RPC_USER}`, `-rpcpassword=${process.env.BITCOIN_RPC_PASSWORD}`, "getrawtransaction", run.txid, "true"], { encoding: "utf8" }));
    assert((tx.confirmations || 0) >= 1, `Giao dịch chưa xác nhận ${run.code}`);
    assert(tx.vout.some((v) => String(v.scriptPubKey?.hex || "").includes(run.merkleRoot)), `OP_RETURN không chứa Merkle root ${run.code}`);
    const runTargets = new Set();
    for (const item of manifest.certificateFiles) {
      const certPath = path.join(work, "blockchain", item.filename);
      const bytes = fs.readFileSync(certPath);
      assert(bytes.length === item.bytes && crypto.createHash("sha256").update(bytes).digest("hex") === item.sha256, `Checksum chứng thư sai ${item.certUid}`);
      const cert = JSON.parse(bytes);
      assert(cert.id === `urn:uuid:${item.certUid}`, `UID chứng thư sai ${item.certUid}`);
      assert(cert.issuer === `${process.env.PUBLIC_BASE_URL}/api/blockcerts/issuers/kma/profile.json`, `Issuer sai ${item.certUid}`);
      const proof = LDMerkleProof2019.decodeMerkleProof2019(cert.proof);
      const anchor = proof.anchors.find((x) => x.startsWith("blink:btc:"));
      assert(anchor?.split(":").at(-1) === run.txid && proof.merkleRoot === run.merkleRoot, `Proof anchor sai ${item.certUid}`);
      assert(!runTargets.has(proof.targetHash) && !allTargets.has(proof.targetHash) && !allUids.has(item.certUid), `Định danh/hash trùng ${item.certUid}`);
      runTargets.add(proof.targetHash); allTargets.add(proof.targetHash); allUids.add(item.certUid);
      jobs.push({ code: run.code, uid: item.certUid, cert });
    }
    audits.push({ code: run.code, size: run.size, requestBatchId: run.requestBatchId, issuanceBatchId: run.issuanceBatchId, dbIssued: q.rows[0].count, proofsChecked: runTargets.size, transactionCount: 1, merkleRootCount: 1, bitcoinConfirmed: true, passed: true });
  }
} finally { await db.end(); }
const inputPath = path.join(results, "full-verifier-input.json");
fs.writeFileSync(inputPath, JSON.stringify(jobs.map(({ code, uid }) => ({ code, uid }))));
const verifierScript = path.join(here, "full-verifier-batch.cjs");
const verifierOutput = execFileSync("docker", [
  "compose", "--env-file", path.join(runtime, ".env"), "--profile", "tools",
  "run", "--rm", "--entrypoint", "node",
  "-v", `${verifierScript}:/audit/full-verifier-batch.cjs:ro`,
  "-v", `${inputPath}:/audit/input.json:ro`,
  "verifier-service", "/audit/full-verifier-batch.cjs", "/audit/input.json",
], { cwd: path.join(runtime, "project"), encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
const verification = JSON.parse(verifierOutput.trim().split(/\r?\n/).find((line) => line.trim().startsWith("{")));
const valid = verification.valid;
const failures = verification.failures;
const out = { schema: "datn-benchmark-artifact-audit-v1", completedAt: new Date().toISOString(), sourceCommit: report.sourceCommit, sourceTreeSha256: report.sourceTreeSha256, sourceDirty: report.sourceDirty, runs: audits, totalCertificates: jobs.length, totalProofsChecked: allTargets.size, totalUniqueCertificateIds: allUids.size, fullVerifierValid: valid, fullVerifierFailures: failures, passed: audits.length === 9 && jobs.length === 1830 && valid === 1830 && failures.length === 0 };
fs.writeFileSync(path.join(results, "benchmark-artifact-audit.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ passed: out.passed, runs: audits.length, totalCertificates: jobs.length, totalProofsChecked: out.totalProofsChecked, fullVerifierValid: valid, failures: failures.length }));
if (!out.passed) process.exitCode = 1;
