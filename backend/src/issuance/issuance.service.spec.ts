jest.mock('@nestjs/bullmq', () => ({ InjectQueue: () => () => undefined }));

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-call */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
  it('commit trạng thái và outbox trước; Redis lỗi không làm mất batch', async () => {
    const row = {
      id: 'certificate-id',
      status: 'pending_approval',
      batchId: null,
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
});
