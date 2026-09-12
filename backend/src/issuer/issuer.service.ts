import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IssuedCertificate } from '../issuance/issuance.entity';

@Injectable()
export class IssuerService {
  constructor(
    @InjectRepository(IssuedCertificate)
    private readonly certificates: Repository<IssuedCertificate>,
  ) {}

  private baseUrl(): string {
    return (process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:4000').replace(
      /\/$/,
      '',
    );
  }

  profile() {
    const base = this.baseUrl();
    const address = process.env.ISSUING_ADDRESS;
    if (!address) throw new Error('Thiếu ISSUING_ADDRESS');
    return {
      '@context': [
        'https://w3id.org/openbadges/v2',
        'https://w3id.org/blockcerts/v2',
      ],
      type: 'Profile',
      id: `${base}/api/blockcerts/issuers/kma/profile.json`,
      name: 'Học viện Kỹ thuật Mật mã',
      url: 'https://actvn.edu.vn/',
      email: 'contact@actvn.edu.vn',
      revocationList: `${base}/api/blockcerts/issuers/kma/revocation-list.json`,
      publicKey: [
        {
          id: `ecdsa-koblitz-pubkey:${address}`,
          created: '2026-08-24T10:04:22.245683Z',
        },
      ],
    };
  }

  async revocationList() {
    const base = this.baseUrl();
    const rows = await this.certificates.find({
      where: { status: 'revoked' },
      order: { revokedAt: 'DESC' },
    });
    return {
      '@context': 'https://w3id.org/openbadges/v2',
      id: `${base}/api/blockcerts/issuers/kma/revocation-list.json`,
      type: 'RevocationList',
      issuer: `${base}/api/blockcerts/issuers/kma/profile.json`,
      revokedAssertions: rows.map((row) => ({
        id: row.certUid ? `urn:uuid:${row.certUid}` : row.id,
        revocationReason: row.revokeReason || 'Thu hồi bởi đơn vị phát hành',
        revokedAt: row.revokedAt?.toISOString() || null,
        revocationTxid: row.revocationTxid || null,
      })),
    };
  }
}
