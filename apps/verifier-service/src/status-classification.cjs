function classifyAnchorAdapterFailure(errorText) {
  const text = String(errorText || '');

  // Các lỗi này được tạo bởi chính nội dung chứng thư/anchor. Khi Bitcoin Core
  // phản hồi rõ giao dịch được tham chiếu không tồn tại, hệ thống đã đủ căn cứ
  // kết luận bằng chứng sai thay vì coi đó là lỗi hạ tầng.
  const deterministicInvalidPatterns = [
    /proof\.proofValue/i,
    /decodeMerkleProof2019/i,
    /encoded data was not valid for encoding utf-8/i,
    /ERR_ENCODING_INVALID_ENCODED_DATA/i,
    /@blockcerts\/lds-merkle-proof-2019/i,
    /cbor\/lib\/decoder/i,
    /không tìm thấy thông tin giao dịch Bitcoin trong bằng chứng/i,
    /mã giao dịch Bitcoin không đúng định dạng/i,
    /Bitcoin Core báo lỗi:.*(?:No such mempool|No such transaction|Invalid or non-wallet transaction id)/i,
  ];

  return deterministicInvalidPatterns.some((pattern) => pattern.test(text))
    ? 'INVALID'
    : 'INDETERMINATE';
}

module.exports = { classifyAnchorAdapterFailure };
