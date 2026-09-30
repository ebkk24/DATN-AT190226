import dataSource from '../data-source';

/** Idempotent maintenance step for rows created before log minimization was added. */
async function main() {
  await dataSource.initialize();
  try {
    await dataSource.query(`
      UPDATE verification_logs
      SET
        "certificateVerification" = CASE
          WHEN "certificateVerification" IS NULL THEN NULL
          ELSE jsonb_strip_nulls(jsonb_build_object(
            'status', "certificateVerification"->'status',
            'valid', "certificateVerification"->'valid',
            'error', "certificateVerification"->'error',
            'errors', "certificateVerification"->'errors'
          ))
        END,
        "anchorVerification" = CASE
          WHEN "anchorVerification" IS NULL THEN NULL
          ELSE jsonb_strip_nulls(jsonb_build_object(
            'status', "anchorVerification"->'status',
            'valid', "anchorVerification"->'valid',
            'error', "anchorVerification"->'error',
            'errors', "anchorVerification"->'errors',
            'txid', "anchorVerification"->'txid',
            'confirmations', "anchorVerification"->'confirmations',
            'expectedMerkleRoot', "anchorVerification"->'expectedMerkleRoot',
            'actualMerkleRoot', "anchorVerification"->'actualMerkleRoot'
          ))
        END,
        raw = CASE
          WHEN raw IS NULL THEN NULL
          ELSE jsonb_strip_nulls(jsonb_build_object(
            'status', raw->'status',
            'revoked', raw->'revoked',
            'revocationPending', raw->'revocationPending',
            'revocationTxid', raw->'revocationTxid',
            'confirmations', raw->'confirmations',
            'error', raw->'error',
            'certificateVerification', CASE
              WHEN "certificateVerification" IS NULL THEN NULL
              ELSE jsonb_strip_nulls(jsonb_build_object(
                'status', "certificateVerification"->'status',
                'valid', "certificateVerification"->'valid',
                'error', "certificateVerification"->'error',
                'errors', "certificateVerification"->'errors'
              ))
            END,
            'anchorVerification', CASE
              WHEN "anchorVerification" IS NULL THEN NULL
              ELSE jsonb_strip_nulls(jsonb_build_object(
                'status', "anchorVerification"->'status',
                'valid', "anchorVerification"->'valid',
                'error', "anchorVerification"->'error',
                'errors', "anchorVerification"->'errors',
                'txid', "anchorVerification"->'txid',
                'confirmations', "anchorVerification"->'confirmations',
                'expectedMerkleRoot', "anchorVerification"->'expectedMerkleRoot',
                'actualMerkleRoot', "anchorVerification"->'actualMerkleRoot'
              ))
            END
          ))
        END
    `);
    console.log('Đã tối thiểu hóa dữ liệu verification_logs hiện có');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Không thể tối thiểu hóa verification_logs:', error?.message || error);
  process.exitCode = 1;
});
