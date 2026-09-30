import { VerificationService } from './verification.service';

function makeService(revocationResult: Record<string, any> = { revoked: false }) {
  const logRepo = {
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const revocation = {
    isRevoked: jest.fn().mockResolvedValue(revocationResult),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new VerificationService(logRepo as any, revocation as any, audit as any),
    logRepo,
    revocation,
  };
}

const certificate = {
  id: 'urn:uuid:00000000-0000-4000-8000-000000000001',
  credentialSubject: {
    id: 'ecdsa-koblitz-pubkey:mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT',
    name: 'Nguyễn Văn Riêng',
    email: 'private@example.test',
    dateOfBirth: '2000-01-01',
  },
};

describe('VerificationService semantic validation', () => {
  it('từ chối credentialSubject.id là địa chỉ Bitcoin trần', async () => {
    const { service, logRepo } = makeService();
    const result = await service.verify({
      certificate: {
        ...certificate,
        credentialSubject: { id: 'mmtMJVNrauBfzn8sr8E6DXEeLVp6WVg1kT' },
      },
    } as any);
    expect(result.status).toBe('INVALID');
    expect(result.certificateVerification.error).toContain('URI khóa P2PKH');
    expect(logRepo.save).toHaveBeenCalled();
  });

  it('không kết luận VALID khi trạng thái thu hồi đang chờ đối soát', async () => {
    const { service } = makeService({ revoked: false, pending: true });
    const result = await (service as any).applyRevocationState(certificate, {
      status: 'VALID',
    });
    expect(result).toMatchObject({
      status: 'INDETERMINATE',
      revocationPending: true,
    });
  });

  it('ưu tiên REVOKED khi có bằng chứng thu hồi trong PostgreSQL', async () => {
    const { service } = makeService({ revoked: true, txid: 'tx-revoke-1' });
    const result = await (service as any).applyRevocationState(certificate, {
      status: 'VALID',
    });
    expect(result).toMatchObject({
      status: 'REVOKED',
      revoked: true,
      revocationTxid: 'tx-revoke-1',
    });
  });

  it('không ghi PII của credentialSubject vào verification_logs', async () => {
    const { service, logRepo } = makeService();
    await (service as any).finish(
      { certificate },
      {
        status: 'VALID',
        certificateVerification: { status: 'VALID', subject: certificate.credentialSubject },
        anchorVerification: { status: 'VALID', txid: 'tx-1' },
      },
      (service as any).businessData(certificate),
    );
    const saved = logRepo.save.mock.calls[0][0];
    expect(JSON.stringify(saved)).not.toContain('Nguyễn Văn Riêng');
    expect(JSON.stringify(saved)).not.toContain('private@example.test');
    expect(JSON.stringify(saved)).not.toContain('2000-01-01');
    expect(saved.raw).toMatchObject({ status: 'VALID' });
  });
});
