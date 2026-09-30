import { calculateAuditHash, AuditService } from './audit.service';

function row(id: string, previousHash: string | null, detail = 'ok'): any {
  const value: any = {
    id,
    action: 'LOGIN_SUCCESS',
    actor: 'maker1',
    actorRole: 'maker',
    targetId: null,
    detail,
    txid: null,
    createdAt: new Date(`2026-09-21T00:00:0${id}.000Z`),
    previousHash,
  };
  value.entryHash = calculateAuditHash(value);
  return value;
}

describe('AuditService hash chain', () => {
  it('xác nhận chuỗi hợp lệ và trả head hash', async () => {
    const first = row('1', null);
    const second = row('2', first.entryHash);
    const repo = { find: jest.fn(async () => [first, second]) };
    const service = new AuditService(repo as any, {} as any);
    await expect(service.verifyIntegrity()).resolves.toEqual({
      valid: true,
      count: 2,
      headHash: second.entryHash,
    });
  });

  it('phát hiện nội dung bị sửa', async () => {
    const first = row('1', null);
    const second = row('2', first.entryHash);
    second.detail = 'đã bị sửa';
    const repo = { find: jest.fn(async () => [first, second]) };
    const service = new AuditService(repo as any, {} as any);
    const result = await service.verifyIntegrity();
    expect(result.valid).toBe(false);
    expect(result.brokenAtId).toBe('2');
  });
  it('lọc nhật ký theo Maker và các yêu cầu do Maker tạo', async () => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [{ actor: 'maker-a' }]),
    };
    const repo = { createQueryBuilder: jest.fn(() => qb), find: jest.fn() };
    const service = new AuditService(repo as any, {} as any);
    await expect(service.list(200, 'maker-a', 'maker')).resolves.toEqual([
      { actor: 'maker-a' },
    ]);
    expect(qb.where).toHaveBeenCalledWith('audit.actor = :username', {
      username: 'maker-a',
    });
    expect(qb.orWhere).toHaveBeenCalledWith(
      expect.stringContaining('issued_certificates'),
      { username: 'maker-a' },
    );
    expect(repo.find).not.toHaveBeenCalled();
  });

  it('giữ phạm vi toàn hệ thống cho Checker', async () => {
    const rows = [{ actor: 'maker-a' }];
    const repo = { find: jest.fn(async () => rows) };
    const service = new AuditService(repo as any, {} as any);
    await expect(service.list(200, 'checker-a', 'checker')).resolves.toBe(rows);
    expect(repo.find).toHaveBeenCalledWith({
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 200,
    });
  });

  it('nối bản ghi mới vào đầu chuỗi trong transaction', async () => {
    const saved: any[] = [];
    const manager = {
      query: jest.fn(async () => undefined),
      find: jest.fn(async () => []),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (value) => {
        saved.push(value);
        return value;
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const service = new AuditService({} as any, dataSource as any);
    await service.log({
      action: 'LOGIN_SUCCESS',
      actor: 'maker1',
      actorRole: 'maker',
    });
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
    );
    expect(manager.find).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ take: 1 }),
    );
    expect(saved).toHaveLength(1);
    expect(saved[0].previousHash).toBeNull();
    expect(saved[0].entryHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
