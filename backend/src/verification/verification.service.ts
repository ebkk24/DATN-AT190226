import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VerifyCertificateDto } from './dto/verify-certificate.dto';
import { VerificationLog } from './entities/verification-log.entity';
import { RevocationService } from '../revocation/revocation.service';
import { AuditService } from '../audit/audit.service';

const execFileAsync = promisify(execFile);

/**
 * Goi Verification Service (Docker) da xay o phase truoc de xac minh chung thu.
 * Chung ta ghi chung thu ra file tam, mount vao container verifier-service,
 * roi chay lenh va doc ket qua JSON tren stdout.
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  constructor(
    @InjectRepository(VerificationLog)
    private readonly logRepo: Repository<VerificationLog>,
    private readonly revocation: RevocationService,
    private readonly audit: AuditService,
  ) {}
  private projectRoot() {
    return process.env.DATN_ROOT || path.resolve(process.cwd(), '..');
  }

  async verify(dto: VerifyCertificateDto): Promise<Record<string, any>> {
    const subjectId = String(dto.certificate?.credentialSubject?.id || '');
    if (
      !/^ecdsa-koblitz-pubkey:[mn2][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(subjectId)
    ) {
      const invalid = {
        status: 'INVALID',
        certificateVerification: {
          status: 'INVALID',
          error: 'credentialSubject.id không phải URI khóa P2PKH hợp lệ',
        },
        anchorVerification: null,
      };
      await this.persist(dto, invalid);
      return invalid;
    }
    const projectRoot = this.projectRoot();
    const tmpDir = `${projectRoot}/backend/.verify-tmp`;
    await fs.mkdir(tmpDir, { recursive: true });
    const fileName = `${randomUUID()}.json`;
    const hostPath = `${tmpDir}/${fileName}`;
    const inContainer = `/workspace/${fileName}`;

    await fs.writeFile(hostPath, JSON.stringify(dto.certificate), 'utf-8');
    try {
      const { stdout } = await execFileAsync(
        'docker',
        [
          'compose',
          '--profile',
          'tools',
          'run',
          '--rm',
          '-v',
          `${hostPath}:${inContainer}:ro`,
          'verifier-service',
          inContainer,
        ],
        { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 },
      );
      const result = JSON.parse(stdout.trim());
      // Kiem tra thu hoi tren blockchain (OP_RETURN REVOKE:<certUid>) chi khi VALID
      if (result.status === 'VALID' || result.status === 'valid') {
        const cid = this.extractCertId(dto.certificate);
        if (cid) {
          const rev = await this.revocation.isRevoked(cid);
          if (rev.revoked) {
            this.logger.warn(`Certificate ${cid} DA THU HOI (tx ${rev.txid})`);
            const revokedResult = {
              status: 'REVOKED',
              revoked: true,
              revocationTxid: rev.txid,
              message: 'Chung thu nay da bi thu hoi',
              certificateVerification: result.certificateVerification || null,
              anchorVerification: result.anchorVerification || null,
            };
            await this.persist(dto, revokedResult);
            return revokedResult;
          }
        }
      }
      this.logger.log(`Verify done -> ${result.status}`);
      await this.persist(dto, result);
      return result;
    } catch (err: any) {
      // docker tra loi error tren stderr; ta van thu parse stdout neu co
      const out = err?.stdout?.toString?.() || '';
      if (out.trim()) {
        try {
          return JSON.parse(out.trim());
        } catch {
          /* ignore */
        }
      }
      this.logger.error(`Verify failed: ${err?.message || err}`);
      const fallback = {
        status: 'INDETERMINATE',
        error: 'Khong the goi Verification Service',
        detail: err?.message || String(err),
      };
      await this.persist(dto, fallback);
      return fallback;
    } finally {
      await fs.rm(hostPath, { force: true });
    }
  }

  private extractCertId(cert: Record<string, any>): string | null {
    const id = cert?.['@id'] || cert?.id;
    if (!id) return null;
    const m = String(id).match(/([0-9a-fA-F-]{36,})/);
    return m ? m[1] : String(id).slice(0, 64);
  }

  private async persist(
    dto: VerifyCertificateDto,
    result: Record<string, any>,
  ) {
    try {
      await this.logRepo.save({
        certId: this.extractCertId(dto.certificate),
        status: result.status || 'INDETERMINATE',
        certificateVerification: result.certificateVerification || null,
        anchorVerification: result.anchorVerification || null,
        confirmations: result.confirmations ?? null,
        raw: result,
      });
      await this.audit.log({
        action: 'verify',
        targetId: this.extractCertId(dto.certificate),
        detail: result.status,
      });
    } catch (e) {
      this.logger.error(`Persist verify log failed: ${(e as Error)?.message}`);
    }
  }
}
