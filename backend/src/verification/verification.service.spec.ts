import { VerificationService } from './verification.service';

describe('VerificationService semantic validation', () => {
  it('từ chối credentialSubject.id là địa chỉ Bitcoin trần', async () => {
    const logRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const revocation = { isRevoked: jest.fn() };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new VerificationService(
      logRepo as any,
      revocation as any,
      audit as any,
    );
    const result = await service.verify({
      certificate: {
        id: 'urn:uuid:00000000-0000-4000-8000-000000000001',
        credentialSubject: { id: 'mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT' },
      },
    } as any);
    expect(result.status).toBe('INVALID');
    expect(result.certificateVerification.error).toContain('URI khóa P2PKH');
    expect(logRepo.save).toHaveBeenCalled();
  });
});
