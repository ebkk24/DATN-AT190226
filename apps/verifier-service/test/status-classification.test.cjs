const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyAnchorAdapterFailure } = require('../src/status-classification.cjs');

test('proof bị hỏng là INVALID', () => {
  assert.equal(
    classifyAnchorAdapterFailure('Error at LDMerkleProof2019.decodeMerkleProof2019'),
    'INVALID'
  );
});

test('TXID sai định dạng là INVALID', () => {
  assert.equal(
    classifyAnchorAdapterFailure('Mã giao dịch Bitcoin không đúng định dạng.'),
    'INVALID'
  );
});

test('TXID không tồn tại nhưng RPC phản hồi được là INVALID', () => {
  assert.equal(
    classifyAnchorAdapterFailure('Bitcoin Core báo lỗi: No such mempool or blockchain transaction.'),
    'INVALID'
  );
});

test('mất kết nối RPC là INDETERMINATE', () => {
  assert.equal(classifyAnchorAdapterFailure('TypeError: fetch failed ECONNREFUSED'), 'INDETERMINATE');
});

test('thiếu credential RPC là INDETERMINATE', () => {
  assert.equal(
    classifyAnchorAdapterFailure('Thiếu tên đăng nhập hoặc mật khẩu Bitcoin RPC.'),
    'INDETERMINATE'
  );
});

test("proofValue hỏng mã hóa UTF-8/CBOR là INVALID", () => {
  assert.equal(
    classifyAnchorAdapterFailure("TypeError: The encoded data was not valid for encoding utf-8 at cbor/lib/decoder.js"),
    "INVALID",
  );
});
