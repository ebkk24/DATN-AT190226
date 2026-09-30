const fs = require('node:fs');
const path = require('node:path');
const { createSafeFetch } = require('/app/verifier-service/src/safe-fetch.cjs');
const listPath = process.argv[2];
if (!listPath) throw new Error('Thiếu danh sách chứng thư');
const entries = JSON.parse(fs.readFileSync(listPath, 'utf8'));
const profileText = fs.readFileSync('/workspace/blockcerts/issuer/profile.json', 'utf8');
const revocationText = fs.readFileSync('/workspace/blockcerts/issuer/revocation-list.json', 'utf8');
const profile = JSON.parse(profileText);
const nativeFetch = globalThis.fetch;
const normalizedUrl = (value) => { const url = new URL(value); url.hash = ''; return url.href; };
const httpsVersion = (url) => url.startsWith('http://') ? 'https://' + url.slice(7) : url;
const allowedProfileUrls = new Set([profile.id, httpsVersion(profile.id)].map(normalizedUrl));
const allowedRevocationUrls = [profile.revocationList, httpsVersion(profile.revocationList)].map((value) => new URL(value));
const safeRemoteFetch = createSafeFetch({ maxBytes: 1024 * 1024, timeoutMs: 5000, maxRedirects: 3 });
function isAllowedRevocationUrl(value) { const candidate = new URL(value); if (candidate.username || candidate.password) return false; return allowedRevocationUrls.some((base) => { const basePath = base.pathname.replace(/\/$/, ''); return candidate.origin === base.origin && (candidate.pathname === base.pathname || candidate.pathname.startsWith(basePath + '/')); }); }
globalThis.fetch = async (input, options) => { const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url; if (allowedProfileUrls.has(normalizedUrl(url))) return new Response(profileText, { status: 200, headers: { 'content-type': 'application/json' } }); if (isAllowedRevocationUrl(url)) return new Response(revocationText, { status: 200, headers: { 'content-type': 'application/json' } }); return safeRemoteFetch(input, options); };
const rpcUrl = process.env.BITCOIN_RPC_URL; const rpcUser = process.env.BITCOIN_RPC_USER; const rpcPassword = process.env.BITCOIN_RPC_PASSWORD;
async function rpc(method, params) { const auth = Buffer.from(rpcUser + ':' + rpcPassword).toString('base64'); const response = await nativeFetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Basic ' + auth }, body: JSON.stringify({ jsonrpc: '1.0', id: 'full-audit', method, params }) }); const body = await response.json(); if (!response.ok || body.error) throw new Error(body.error?.message || `RPC HTTP ${response.status}`); return body.result; }
async function explorer(api) { const tx = await rpc('getrawtransaction', [api.transactionId, true]); const output = (tx.vout || []).find((x) => x.scriptPubKey?.type === 'nulldata'); const match = (output?.scriptPubKey?.asm || '').match(/^OP_RETURN\s+([0-9a-f]{64})$/i); if (!match) throw new Error('Không có Merkle root'); const input = (tx.vin || []).find((x) => x.txid); const previous = await rpc('getrawtransaction', [input.txid, true]); const issuingAddress = previous.vout?.[input.vout]?.scriptPubKey?.address; if (!issuingAddress) throw new Error('Không có địa chỉ phát hành'); return { remoteHash: match[1].toLowerCase(), issuingAddress, time: new Date(Number(tx.blocktime) * 1000), revokedAddresses: [] }; }
const { Certificate } = require(process.env.CERT_VERIFIER_JS_PATH || '/opt/cert-verifier-js/verifier-node/index.js');
(async () => {
const original = { log: console.log, warn: console.warn, error: console.error }; console.log = console.warn = console.error = () => {};
let valid = 0; const failures = [];
for (const entry of entries) {
  try { const text = fs.readFileSync(path.join('/workspace/blockcerts/cert-issuer/blockchain_certificates', `${entry.uid}.json`), 'utf8'); const cert = new Certificate(text, { locale: 'en-US', explorerAPIs: [{ apiType: 'rpc', priority: 0, parsingFunction: explorer }] }); await cert.init(); const result = await cert.verifier.verify(); if (result.status === 'success') valid += 1; else failures.push({ uid: entry.uid, status: result.status }); }
  catch (error) { failures.push({ uid: entry.uid, error: error.message }); }
}
original.log(JSON.stringify({ total: entries.length, valid, failures, passed: entries.length === 1830 && valid === 1830 && failures.length === 0 }));
if (failures.length) process.exitCode = 1;
})();
