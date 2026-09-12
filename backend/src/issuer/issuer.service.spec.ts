import { Repository } from 'typeorm';
import { IssuedCertificate } from '../issuance/issuance.entity';
import { IssuerService } from './issuer.service';

describe('IssuerService', () => {
  const originalBase = process.env.PUBLIC_BASE_URL;
  const originalAddress = process.env.ISSUING_ADDRESS;

  beforeEach(() => {
    process.env.PUBLIC_BASE_URL = 'https://issuer.example';
    process.env.ISSUING_ADDRESS = 'mTestPublicAddress';
  });

  afterAll(() => {
    process.env.PUBLIC_BASE_URL = originalBase;
    process.env.ISSUING_ADDRESS = originalAddress;
  });

  it('trả hồ sơ issuer bằng URL ổn định', () => {
    const repo = {
      find: jest.fn(),
    } as unknown as Repository<IssuedCertificate>;
    const profile = new IssuerService(repo).profile();
    expect(profile.id).toBe(
      'https://issuer.example/api/blockcerts/issuers/kma/profile.json',
    );
    expect(profile.publicKey[0].id).toContain('mTestPublicAddress');
    expect(profile.revocationList).toContain('revocation-list.json');
  });

  it('trả danh sách thu hồi từ DB', async () => {
    const repo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'row-1',
          certUid: 'cert-1',
          revokeReason: 'Sai thông tin',
          revokedAt: new Date('2026-09-12T00:00:00Z'),
          revocationTxid: 'tx-1',
        },
      ]),
    } as unknown as Repository<IssuedCertificate>;
    const list = await new IssuerService(repo).revocationList();
    expect(list.revokedAssertions).toHaveLength(1);
    expect(list.revokedAssertions[0]).toMatchObject({
      id: 'urn:uuid:cert-1',
      revocationReason: 'Sai thông tin',
      revocationTxid: 'tx-1',
    });
  });
});
