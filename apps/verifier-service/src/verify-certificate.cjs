const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const certificateArgument = process.argv[2];
if (!certificateArgument) {
  console.error('Thiếu đường dẫn chứng thư.');
  process.exit(2);
}
const certificatePath = path.resolve(root, certificateArgument);
const profilePath = path.resolve(root, 'blockcerts/issuer/profile.json');
const revocationPath = path.resolve(root, 'blockcerts/issuer/revocation-list.json');
const adapterPath =
  process.env.REGTEST_ANCHOR_ADAPTER_PATH ||
  path.resolve(
    root,
    'adapters/regtest-anchor-adapter/src/verify-anchor.mjs'
  );
const verifierPath = process.env.CERT_VERIFIER_JS_PATH || '/tmp/cert-verifier-js/dist/verifier-node/index.js';

const certificateText = fs.readFileSync(certificatePath, 'utf8');
const profileText = fs.readFileSync(profilePath, 'utf8');
const revocationText = fs.readFileSync(revocationPath, 'utf8');
const profile = JSON.parse(profileText);
const nativeFetch = globalThis.fetch;

function httpsVersion(url) {
  return url.startsWith('http://') ? 'https://' + url.slice(7) : url;
}
const allowedProfileUrls = new Set([profile.id, httpsVersion(profile.id)]);
const allowedRevocationUrls = [profile.revocationList, httpsVersion(profile.revocationList)];

globalThis.fetch = async function (input, options) {
  const url = typeof input === 'string' ? input : input.url;
  if (allowedProfileUrls.has(url)) {
    return new Response(profileText, { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (allowedRevocationUrls.some(function (base) { return url.startsWith(base); })) {
    return new Response(revocationText, { status: 200, headers: { 'content-type': 'application/json' } });
  }
  const parsed = new URL(url);
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
    throw new Error('Từ chối truy cập địa chỉ nội bộ không nằm trong danh sách cho phép.');
  }
  return nativeFetch(input, options);
};

const rpcUrl = process.env.BITCOIN_RPC_URL || 'http://127.0.0.1:18443';
const rpcUser = process.env.BITCOIN_RPC_USER;
const rpcPassword = process.env.BITCOIN_RPC_PASSWORD;

async function callBitcoinCore(method, parameters) {
  if (!rpcUser || !rpcPassword) throw new Error('Thiếu thông tin đăng nhập Bitcoin Core.');
  const credential = Buffer.from(rpcUser + ':' + rpcPassword).toString('base64');
  const response = await nativeFetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': 'Basic ' + credential },
    body: JSON.stringify({ jsonrpc: '1.0', id: 'verification-service', method, params: parameters || [] })
  });
  if (!response.ok) throw new Error('Bitcoin Core trả mã HTTP ' + response.status + '.');
  const body = await response.json();
  if (body.error) throw new Error('Bitcoin Core báo lỗi: ' + body.error.message);
  return body.result;
}

async function customRegtestExplorer(api) {
  const transaction = await callBitcoinCore('getrawtransaction', [api.transactionId, true]);
  const output = (transaction.vout || []).find(function (item) {
    return item.scriptPubKey && item.scriptPubKey.type === 'nulldata';
  });
  const match = (output && output.scriptPubKey.asm || '').match(/^OP_RETURN\s+([0-9a-f]{64})$/i);
  if (!match) throw new Error('Giao dịch không có Merkle root trong OP_RETURN.');
  const input = (transaction.vin || []).find(function (item) { return item.txid; });
  if (!input) throw new Error('Không tìm thấy đầu vào giao dịch.');
  const previousTransaction = await callBitcoinCore('getrawtransaction', [input.txid, true]);
  const previousOutput = previousTransaction.vout && previousTransaction.vout[input.vout];
  const issuingAddress = previousOutput && previousOutput.scriptPubKey && previousOutput.scriptPubKey.address;
  if (!issuingAddress) throw new Error('Không tìm thấy địa chỉ phát hành.');
  return {
    remoteHash: match[1].toLowerCase(),
    issuingAddress,
    time: new Date(Number(transaction.blocktime) * 1000),
    revokedAddresses: []
  };
}

function runAnchorAdapter() {
  const execution = spawnSync(process.execPath, [adapterPath, certificatePath, profilePath], {
    cwd: root, env: process.env, encoding: 'utf8'
  });
  try {
    const details = JSON.parse(execution.stdout);
    return {
      status: details.status === 'ANCHOR_VALID' ? 'VALID' : 'INVALID',
      details
    };
  } catch (error) {
    return {
      status: 'INDETERMINATE',
      error: (execution.stderr || execution.stdout || error.message).trim()
    };
  }
}

async function runCertificateVerifier() {
  const savedLog = console.log;
  const savedWarn = console.warn;
  const savedError = console.error;
  console.log = function () {};
  console.warn = function () {};
  console.error = function () {};
  try {
    const { Certificate } = require(verifierPath);
    const certificate = new Certificate(certificateText, {
      locale: 'en-US',
      explorerAPIs: [{ apiType: 'rpc', priority: 0, parsingFunction: customRegtestExplorer }]
    });
    await certificate.init();
    const steps = [];
    const result = await certificate.verifier.verify(function (step) {
      steps.push({ code: step.code, status: step.status, errorMessage: step.errorMessage || null });
    });
    const failedStep = steps.find(function (step) { return step.status === 'failure'; });
    let status = result.status === 'success' ? 'VALID' : 'INVALID';
    if (failedStep && failedStep.code === 'checkRevokedStatus') status = 'REVOKED';
    if (failedStep && failedStep.code === 'fetchRemoteHash') status = 'INDETERMINATE';
    return { status, result, failedStep: failedStep || null, steps };
  } finally {
    console.log = savedLog;
    console.warn = savedWarn;
    console.error = savedError;
  }
}

(async function () {
  const anchor = runAnchorAdapter();
  let certificateVerification;
  try {
    certificateVerification = await runCertificateVerifier();
  } catch (error) {
    certificateVerification = { status: 'INDETERMINATE', error: error.message };
  }
  let finalStatus = 'INDETERMINATE';
  if (certificateVerification.status === 'REVOKED') finalStatus = 'REVOKED';
  else if (certificateVerification.status === 'INVALID' || anchor.status === 'INVALID') finalStatus = 'INVALID';
  else if (certificateVerification.status === 'VALID' && anchor.status === 'VALID') finalStatus = 'VALID';
  const output = {
    status: finalStatus,
    certificateId: JSON.parse(certificateText).id || null,
    certificateVerification,
    anchorVerification: anchor
  };
  console.log(JSON.stringify(output, null, 2));
  if (finalStatus !== 'VALID') process.exitCode = 1;
})();
