jest.mock('@nestjs/bullmq', () => ({ InjectQueue: () => () => undefined }));

import { issuanceJobOptions, IssuanceDispatcher } from './issuance.dispatcher';

describe('IssuanceDispatcher outbox', () => {
  it('dùng jobId ổn định, retry hữu hạn và exponential backoff', () => {
    expect(issuanceJobOptions('issuance-batch-1')).toEqual(
      expect.objectContaining({
        jobId: 'issuance-batch-1',
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: false,
        removeOnFail: false,
      }),
    );
  });

  it('enqueue lỗi vẫn giữ outbox pending để dispatcher thử lại', async () => {
    const queue = { add: jest.fn().mockRejectedValue(new Error('redis down')) };
    const outbox = {
      findOne: jest.fn().mockResolvedValue({
        id: 'outbox-1',
        batchId: 'batch-1',
        status: 'pending',
        payload: { ids: ['id-1'], batchId: 'batch-1' },
      }),
      update: jest.fn(),
    };
    const batches = {
      findOneByOrFail: jest
        .fn()
        .mockResolvedValue({ batchId: 'batch-1', jobId: 'issuance-batch-1' }),
    };
    const dataSource = { transaction: jest.fn() };
    const dispatcher = new IssuanceDispatcher(
      queue as never,
      outbox as never,
      batches as never,
      dataSource as never,
    );
    await expect(dispatcher.dispatchBatch('batch-1')).rejects.toThrow(
      'redis down',
    );
    expect(outbox.update).toHaveBeenCalledWith(
      'outbox-1',
      expect.objectContaining({ lastError: 'redis down' }),
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('retry thủ công dùng lại job cũ thay vì tạo jobId mới', async () => {
    const job = {
      isFailed: jest.fn().mockResolvedValue(true),
      isCompleted: jest.fn(),
      remove: jest.fn(),
    };
    const queue = { getJob: jest.fn().mockResolvedValue(job), add: jest.fn() };
    const batches = {
      findOneByOrFail: jest.fn().mockResolvedValue({
        batchId: 'batch-1',
        jobId: 'issuance-batch-1',
        certificateIds: ['id-1'],
      }),
    };
    const dispatcher = new IssuanceDispatcher(
      queue as never,
      {} as never,
      batches as never,
      {} as never,
    );
    await dispatcher.retryBatch('batch-1');
    expect(job.remove).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      'issue-batch',
      { ids: ['id-1'], batchId: 'batch-1' },
      expect.objectContaining({ jobId: 'issuance-batch-1', attempts: 5 }),
    );
  });
});
