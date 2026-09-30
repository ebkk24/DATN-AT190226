jest.mock('@nestjs/bullmq', () => ({ InjectQueue: () => () => undefined }));

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-call */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { IssuanceService } from './issuance.service';

describe('IssuanceService student identity mapping', () => {
  const student = {
    id: '3d0dc773-1d70-4ca4-91e4-a7ab1fed85f8',
    role: 'student',
    studentCode: 'AT180001',
    recipientName: 'Nguyễn Văn An',
    dateOfBirth: '2004-03-27',
    email: 'an@example.edu.vn',
    cohort: '2022 - 2027',
  };

  function setup() {
    const dataSource = { transaction: jest.fn() };
    const dispatcher = { dispatchBatch: jest.fn() };
    const repo = {
      create: jest.fn((value) => ({ id: 'certificate-id', ...value })),
      save: jest.fn(async (value) => value),
      find: jest.fn(async () => []),
      findOne: jest.fn(),
    };
    const users = {
      findOne: jest.fn(async () => student),
      find: jest.fn(async () => [student]),
    };
    const audit = { log: jest.fn(), logMany: jest.fn() };
    const service = new IssuanceService(
      repo as never,
      users as never,
      audit as never,
      dataSource as never,
      dispatcher as never,
    );
    return { service, repo, users, audit, dataSource, dispatcher };
  }

  it('lấy studentId và họ tên từ Student, không tin dữ liệu tên do Maker nhập', async () => {
    const { service, repo } = setup();
    const result = await service.request(
      {
        studentCode: 'at180001',
        pubkey: 'mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT',
        degreeName: 'Bằng tốt nghiệp đại học',
        major: 'An Toàn Thông Tin',
        educationLevel: 'Đại học',
        graduationRank: 'Giỏi',
        graduationYear: 2027,
        issueDate: '2027-06-30',
        diplomaNumber: 'KMA-2027-0001',
        trainingMode: 'Chính quy',
      },
      'maker-a',
    );

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: student.id,
        recipientName: student.recipientName,
        identity: student.studentCode,
        studentCode: student.studentCode,
        studentDateOfBirth: student.dateOfBirth,
        studentEmail: student.email,
        cohort: student.cohort,
        diplomaNumber: 'KMA-2027-0001',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        studentCode: student.studentCode,
        recipientName: student.recipientName,
      }),
    );
  });

  it('từ chối hồ sơ Student chưa đủ dữ liệu bắt buộc', async () => {
    const { service, users } = setup();
    users.findOne.mockResolvedValue({ ...student, email: null });
    await expect(
      service.request(
        {
          studentCode: 'AT180001',
          pubkey: 'mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT',
          degreeName: 'Bằng tốt nghiệp đại học',
          major: 'An Toàn Thông Tin',
          educationLevel: 'Đại học',
          graduationRank: 'Giỏi',
          graduationYear: 2027,
          issueDate: '2027-06-30',
          diplomaNumber: 'KMA-2027-0002',
          trainingMode: 'Chính quy',
        },
        'maker-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('từ chối số hiệu văn bằng đã tồn tại trên toàn hệ thống', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue({ id: 'existing-certificate' });
    await expect(
      service.request(
        {
          studentCode: 'AT180001',
          pubkey: 'mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT',
          degreeName: 'Bằng tốt nghiệp đại học',
          major: 'An Toàn Thông Tin',
          educationLevel: 'Đại học',
          graduationRank: 'Giỏi',
          graduationYear: 2027,
          issueDate: '2027-06-30',
          diplomaNumber: 'KMA-2027-0001',
          trainingMode: 'Chính quy',
        },
        'maker-a',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('truy vấn ví Student bằng userId thay vì recipientName', async () => {
    const { service, repo } = setup();
    await service.holderCertificates(student.id);
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ studentId: student.id }),
      }),
    );
  });

  it('từ chối cả lô nếu có mã sinh viên không tồn tại', async () => {
    const { service, users } = setup();
    users.find.mockResolvedValue([]);
    await expect(
      service.requestBatch(
        [
          {
            studentCode: 'AT999999',
            pubkey: 'mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT',
            degreeName: 'Bằng tốt nghiệp đại học',
            major: 'An Toàn Thông Tin',
            educationLevel: 'Đại học',
            graduationRank: 'Giỏi',
            graduationYear: 2027,
            issueDate: '2027-06-30',
            diplomaNumber: 'KMA-2027-9999',
            trainingMode: 'Chính quy',
          },
        ],
        'maker-a',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('Maker chỉ liệt kê yêu cầu do chính mình tạo', async () => {
    const { service, repo } = setup();
    await service.list(undefined, undefined, 'maker-a', 'maker');
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ requestedBy: 'maker-a' }),
      }),
    );
  });

  it('Checker có thể liệt kê yêu cầu toàn hệ thống', async () => {
    const { service, repo } = setup();
    await service.list('queued', undefined, 'checker-a', 'checker');
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'queued' } }),
    );
  });

  it('Maker không đọc được chi tiết yêu cầu của Maker khác', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(null);
    await expect(
      service.getStatus('request-of-maker-b', 'maker-a', 'maker'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'request-of-maker-b', requestedBy: 'maker-a' },
    });
  });

  it('Checker đọc chi tiết yêu cầu mà không bị lọc theo requestedBy', async () => {
    const { service, repo } = setup();
    const row = { id: 'request-of-maker-b', requestedBy: 'maker-b' };
    repo.findOne.mockResolvedValue(row);
    await expect(
      service.getStatus(row.id, 'checker-a', 'checker'),
    ).resolves.toBe(row);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: row.id } });
  });

  it('không cho reject ghi đè trạng thái queued khi approve thắng cạnh tranh', async () => {
    const databaseRow: any = {
      id: 'race-certificate-id',
      status: 'pending_approval',
      requestBatchId: null,
      issuanceBatchId: null,
      approvedBy: null,
    };
    let releaseRejectSave!: () => void;
    let markRejectSaveStarted!: () => void;
    const rejectSaveStarted = new Promise<void>((resolve) => {
      markRejectSaveStarted = resolve;
    });
    const rejectMaySave = new Promise<void>((resolve) => {
      releaseRejectSave = resolve;
    });
    const repo = {
      findOne: jest.fn(async () => ({ ...databaseRow })),
      update: jest.fn(async (criteria, changes) => {
        markRejectSaveStarted();
        await rejectMaySave;
        if (
          databaseRow.id !== criteria.id ||
          databaseRow.status !== criteria.status
        ) {
          return { affected: 0 };
        }
        Object.assign(databaseRow, changes);
        return { affected: 1 };
      }),
      save: jest.fn(),
    };
    const qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [{ ...databaseRow }]),
    };
    const manager = {
      getRepository: jest.fn(() => ({ createQueryBuilder: () => qb })),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (entity, value) => {
        if (Array.isArray(value)) Object.assign(databaseRow, value[0]);
        return value;
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const audit = { log: jest.fn(), logMany: jest.fn() };
    const dispatcher = { dispatchBatch: jest.fn() };
    const service = new IssuanceService(
      repo as never,
      {} as never,
      audit as never,
      dataSource as never,
      dispatcher as never,
    );

    const rejecting = service.reject(
      databaseRow.id,
      { reason: 'Không đạt' },
      'checker-reject',
    );
    await rejectSaveStarted;
    await service.approve(databaseRow.id, {}, 'checker-approve');
    expect(databaseRow.status).toBe('queued');
    releaseRejectSave();

    await expect(rejecting).rejects.toBeInstanceOf(BadRequestException);
    expect(databaseRow.status).toBe('queued');
  });

  it('commit trạng thái và outbox trước; Redis lỗi không làm mất batch', async () => {
    const row = {
      id: 'certificate-id',
      status: 'pending_approval',
      requestBatchId: null,
      issuanceBatchId: null,
      approvedBy: null,
    };
    const qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([row]),
    };
    const manager = {
      getRepository: jest.fn(() => ({ createQueryBuilder: () => qb })),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (_entity, value) => value),
    };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const dispatcher = {
      dispatchBatch: jest.fn().mockRejectedValue(new Error('redis down')),
    };
    const audit = { log: jest.fn(), logMany: jest.fn() };
    const service = new IssuanceService(
      {} as never,
      {} as never,
      audit as never,
      dataSource as never,
      dispatcher as never,
    );

    await expect(
      service.approve('certificate-id', {}, 'checker-a'),
    ).resolves.toEqual(
      expect.objectContaining({
        batchId: 'single-certificate-id',
        jobId: 'issuance-single-certificate-id',
        status: 'queued',
      }),
    );
    expect(row.status).toBe('queued');
    expect(manager.create).toHaveBeenCalledTimes(2);
    expect(dispatcher.dispatchBatch).toHaveBeenCalledWith(
      'single-certificate-id',
    );
  });
  it('duyệt từng phần của cùng nhóm yêu cầu tạo các lô phát hành độc lập', async () => {
    const requestBatchId = 'request-batch-shared';
    const queuedRows: any[] = [];
    const createdBatches: any[] = [];
    let currentRows: any[] = [];
    const qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => currentRows),
    };
    const manager = {
      getRepository: jest.fn(() => ({ createQueryBuilder: () => qb })),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (entity, value) => {
        if (Array.isArray(value))
          queuedRows.push(...value.map((row) => ({ ...row })));
        else if (value?.jobId) createdBatches.push({ ...value });
        return value;
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const dispatcher = { dispatchBatch: jest.fn() };
    const audit = { log: jest.fn(), logMany: jest.fn() };
    const service = new IssuanceService(
      {} as never,
      {} as never,
      audit as never,
      dataSource as never,
      dispatcher as never,
    );

    currentRows = [
      {
        id: 'certificate-a',
        status: 'pending_approval',
        requestBatchId,
        issuanceBatchId: null,
      },
    ];
    const first = await service.approveBatch(
      { ids: ['certificate-a'] },
      'checker-a',
    );
    currentRows = [
      {
        id: 'certificate-b',
        status: 'pending_approval',
        requestBatchId,
        issuanceBatchId: null,
      },
    ];
    const second = await service.approveBatch(
      { ids: ['certificate-b'] },
      'checker-a',
    );

    expect(first.batchId).not.toBe(second.batchId);
    expect(createdBatches.map((batch) => batch.batchId)).toEqual([
      first.batchId,
      second.batchId,
    ]);
    expect(queuedRows).toEqual([
      expect.objectContaining({
        id: 'certificate-a',
        requestBatchId,
        issuanceBatchId: first.batchId,
      }),
      expect.objectContaining({
        id: 'certificate-b',
        requestBatchId,
        issuanceBatchId: second.batchId,
      }),
    ]);
  });
});
