import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  LDMerkleProof2019
} = require('jsonld-signatures-merkleproof2019');

const certificatePath = process.argv[2];

const issuerProfilePath =
  process.argv[3] ||
  'blockcerts/issuer/profile.json';

if (!certificatePath) {

throw new Error(
    'Thiếu đường dẫn tới tệp chứng thư.'
  );
}

const certificateText = fs.readFileSync(
  certificatePath,
  'utf8'
);

const certificate = JSON.parse(
  certificateText
);

const issuerProfileText = fs.readFileSync(
  issuerProfilePath,
  'utf8'
);

const issuerProfile = JSON.parse(
  issuerProfileText
);

const publicKeyPrefix =
  'ecdsa-koblitz-pubkey:';

const issuerPublicKeyIdentifier = (
  issuerProfile.publicKey || []
)
  .map(publicKey => publicKey.id)
  .find(
    identifier =>
      typeof identifier === 'string' &&
      identifier.startsWith(publicKeyPrefix)
  );

if (!issuerPublicKeyIdentifier) {
  throw new Error(
    'Hồ sơ tổ chức không có địa chỉ phát hành hợp lệ.'
  );
}

const profileAddress =
  issuerPublicKeyIdentifier.slice(
    publicKeyPrefix.length
  );

if (!certificate.proof?.proofValue) {
  throw new Error(
    'Chứng thư không có proof.proofValue.'
  );
}

const receipt =
  LDMerkleProof2019.decodeMerkleProof2019(
    certificate.proof
  );

const anchor = receipt.anchors?.find(
  value =>
    typeof value === 'string' &&
    value.startsWith('blink:btc:')
);

if (!anchor) {
  throw new Error(
    'Không tìm thấy thông tin giao dịch Bitcoin trong bằng chứng.'
  );
}

const transactionId =
  anchor.split(':').at(-1);

if (!/^[0-9a-f]{64}$/i.test(transactionId)) {
  throw new Error(
    'Mã giao dịch Bitcoin không đúng định dạng.'
  );
}

const rpcUrl =
  process.env.BITCOIN_RPC_URL ||
  'http://127.0.0.1:18443';

const rpcUser =
  process.env.BITCOIN_RPC_USER;

const rpcPassword =
  process.env.BITCOIN_RPC_PASSWORD;

if (!rpcUser || !rpcPassword) {
  throw new Error(
    'Thiếu tên đăng nhập hoặc mật khẩu Bitcoin RPC.'
  );
}

async function callBitcoinCore(
  method,
  parameters = []
) {
  const credentials = Buffer
    .from(`${rpcUser}:${rpcPassword}`)
    .toString('base64');

  const response = await fetch(
    rpcUrl,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Basic ${credentials}`
      },
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'regtest-anchor-adapter',
        method,
        params: parameters
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Bitcoin Core trả mã HTTP ${response.status}.`
    );
  }

  const responseBody =
    await response.json();

  if (responseBody.error) {
    throw new Error(
      `Bitcoin Core báo lỗi: ${responseBody.error.message}`
    );
  }

  return responseBody.result;
}

const blockchainInformation =
  await callBitcoinCore(
    'getblockchaininfo'
  );

if (blockchainInformation.chain !== 'regtest') {
  throw new Error(
    'Bitcoin Core không chạy đúng mạng regtest.'
  );
}

const transaction =
  await callBitcoinCore(
    'getrawtransaction',
    [transactionId, true]
  );

const inputAddresses = [];

for (
  const transactionInput of transaction.vin || []
) {
  if (
    !transactionInput.txid ||
    !Number.isInteger(transactionInput.vout)
  ) {
    continue;
  }

  const previousTransaction =
    await callBitcoinCore(
      'getrawtransaction',
      [transactionInput.txid, true]
    );

  const previousOutput =
    previousTransaction.vout?.[
      transactionInput.vout
    ];

  const previousOutputAddress =
    previousOutput?.scriptPubKey?.address;

  if (previousOutputAddress) {
    inputAddresses.push(
      previousOutputAddress
    );
  }
}

const uniqueInputAddresses = [
  ...new Set(inputAddresses)
];

const issuingAddressMatches =
  uniqueInputAddresses.includes(
    profileAddress
  );

const opReturnRoots = (
  transaction.vout || []
)
  .filter(
    output =>
      output.scriptPubKey?.type === 'nulldata'
  )
  .map(output => {
    const script =
      output.scriptPubKey?.asm || '';

    const match = script.match(
      /^OP_RETURN\s+([0-9a-f]{64})$/i
    );

    return match?.[1]?.toLowerCase();
  })
  .filter(Boolean);

const merkleRoot =
  String(receipt.merkleRoot || '')
    .toLowerCase();

const merkleRootMatches =
  opReturnRoots.includes(merkleRoot);

const hasEnoughConfirmations =
  Number(transaction.confirmations || 0) >= 1;

const status =
  merkleRootMatches &&
  hasEnoughConfirmations &&
  issuingAddressMatches
    ? 'ANCHOR_VALID'
    : 'ANCHOR_INVALID';

const result = {
  status,
  network: blockchainInformation.chain,
  transactionId,
  blockHash: transaction.blockhash || null,
  confirmations:
    transaction.confirmations || 0,
  merkleRootFromCertificate:
    merkleRoot,
  opReturnRoots,
  merkleRootMatches,
  hasEnoughConfirmations,
  profileAddress,
  inputAddresses:
    uniqueInputAddresses,
  issuingAddressMatches
};

console.log(
  JSON.stringify(result, null, 2)
);

if (status !== 'ANCHOR_VALID') {
  process.exitCode = 1;
}
