/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => undefined,
  WorkerHost: class {},
}));
jest.mock('jsonld-signatures-merkleproof2019', () => ({
  LDMerkleProof2019: { decodeMerkleProof2019: jest.fn() },
}));

import { IssuanceProcessor } from './issuance.processor';

const checkpoint = {
  version: 1,
  anchorTxid: 'a'.repeat(64),
  merkleRoot: 'b'.repeat(64),
  rawTransaction: '00',
};
const anchoredTransaction = {
  txid: checkpoint.anchorTxid,
  confirmations: 1,
  vout: [{ scriptPubKey: { hex: `6a20${checkpoint.merkleRoot}` } }],
};

function setup(lockResult = true) {
  const query = jest
    .fn()
    .mockResolvedValueOnce([{ locked: lockResult }])
    .mockResolvedValueOnce([]);
  const runner = { connect: jest.fn(), query, release: jest.fn() };
  const dataSource = { createQueryRunner: jest.fn(() => runner) };
  const processor = new IssuanceProcessor(
    {} as never,
    {} as never,
    dataSource as never,
    {} as never,
  );
  return { processor: processor as any, runner };
}

describe('IssuanceProcessor idempotency', () => {
  it('duplicate Worker không vào processBatch khi advisory lock đang bị giữ', async () => {
    const { processor, runner } = setup(false);
    const processBatch = jest.spyOn(processor, 'processBatch');
    await expect(
      processor.process({ data: { ids: ['id-1'], batchId: 'batch-1' } }),
    ).resolves.toEqual({
      batchId: 'batch-1',
      status: 'locked_by_another_worker',
    });
    expect(processBatch).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalled();
  });

  it('khi txid đã thấy trên chain thì không gọi sendrawtransaction', async () => {
    const { processor } = setup();
    const transactionInfo = jest
      .spyOn(processor, 'transactionInfo')
      .mockResolvedValue(anchoredTransaction);
    const rpc = jest.spyOn(processor, 'bitcoinRpc');
    await expect(processor.ensureExactTransaction(checkpoint)).resolves.toEqual(
      expect.objectContaining({ txid: checkpoint.anchorTxid }),
    );
    expect(transactionInfo).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('RPC mơ hồ chỉ rebroadcast raw transaction cũ rồi reconcile đúng txid', async () => {
    const { processor } = setup();
    jest
      .spyOn(processor, 'transactionInfo')
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ ...anchoredTransaction, confirmations: 0 });
    const rpc = jest
      .spyOn(processor, 'bitcoinRpc')
      .mockRejectedValueOnce(new Error('timeout'));
    await expect(processor.ensureExactTransaction(checkpoint)).resolves.toEqual(
      expect.objectContaining({ txid: checkpoint.anchorTxid }),
    );
    expect(rpc).toHaveBeenCalledWith('sendrawtransaction', [
      checkpoint.rawTransaction,
    ]);
  });

  it('từ chối checkpoint khác anchorTxid đã lưu', async () => {
    const { processor } = setup();
    processor.batches = {
      findOneByOrFail: jest
        .fn()
        .mockResolvedValue({ anchorTxid: 'c'.repeat(64) }),
      update: jest.fn(),
    };
    await expect(
      processor.persistCheckpoint('batch-1', checkpoint, 'anchor_prepared'),
    ).rejects.toThrow('xung đột');
    expect(processor.batches.update).not.toHaveBeenCalled();
  });
  it('từ chối transaction tồn tại nhưng OP_RETURN không khớp checkpoint', async () => {
    const { processor } = setup();
    jest.spyOn(processor, 'transactionInfo').mockResolvedValue({
      ...anchoredTransaction,
      vout: [{ scriptPubKey: { hex: `6a20${'c'.repeat(64)}` } }],
    });
    await expect(processor.ensureExactTransaction(checkpoint)).rejects.toThrow(
      'OP_RETURN không khớp',
    );
  });
});
