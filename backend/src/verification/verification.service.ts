import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { VerifyCertificateDto } from './dto/verify-certificate.dto';
import { VerificationLog } from './entities/verification-log.entity';
import { RevocationService } from '../revocation/revocation.service';
import { AuditService } from '../audit/audit.service';

const execFileAsync = promisify(execFile);
const ALLOWED_STATUSES = new Set(['VALID', 'INVALID', 'INDETERMINATE', 'REVOKED']);

/**
 * Ghi credential vào tệp tạm quyền 0600, gọi verifier container có timeout,
 * rồi hợp nhất kết quả kiểm tra thu hồi trước khi trả cho cổng Verify.
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private lastRetentionSweep = 0;

  constructor(
    @InjectRepository(VerificationLog)
    private readonly logRepo: Repository<VerificationLog>,
    private readonly revocation: RevocationService,
    private readonly audit: AuditService,
  ) {}

  private projectRoot() {
    return process.env.DATN_ROOT || path.resolve(process.cwd(), '..');
  }

  private timeoutMs(): number {
    const value = Number(process.env.VERIFY_TIMEOUT_MS || 120_000);
    return Number.isFinite(value) && value >= 1_000 && value <= 300_000
      ? Math.trunc(value)
      : 120_000;
  }

  async verify(dto: VerifyCertificateDto): Promise<Record<string, any>> {
    const businessData = this.businessData(dto.certificate);
    const subjectId = String(dto.certificate?.credentialSubject?.id || '');
    if (!/^ecdsa-koblitz-pubkey:[mn2][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(subjectId)) {
      return this.finish(dto, {
        status: 'INVALID',
        certificateVerification: {
          status: 'INVALID',
          error: 'credentialSubject.id không phải URI khóa P2PKH hợp lệ',
        },
        anchorVerification: null,
      }, businessData);
    }

    const projectRoot = this.projectRoot();
    const tmpDir = path.join(projectRoot, 'backend', '.verify-tmp');
    await fs.mkdir(tmpDir, { recursive: true, mode: 0o700 });
    await fs.chmod(tmpDir, 0o700);
    const fileName = `${randomUUID()}.json`;
    const hostPath = path.join(tmpDir, fileName);
    const inContainer = `/workspace/${fileName}`;

    await fs.writeFile(hostPath, JSON.stringify(dto.certificate), {
      encoding: 'utf8',
      mode: 0o600,
    });
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
        {
          cwd: projectRoot,
          maxBuffer: 10 * 1024 * 1024,
          timeout: this.timeoutMs(),
          killSignal: 'SIGKILL',
        },
      );
      const verified = await this.applyRevocationState(
        dto.certificate,
        JSON.parse(stdout.trim()),
      );
      this.logger.log(`Verify done -> ${verified.status}`);
      return this.finish(dto, verified, businessData);
    } catch (err: any) {
      // Docker có thể thoát khác 0 nhưng vẫn trả JSON phân loại hợp lệ trên stdout.
      const out = err?.stdout?.toString?.() || '';
      if (out.trim()) {
        try {
          const verified = await this.applyRevocationState(
            dto.certificate,
            JSON.parse(out.trim()),
          );
          return this.finish(dto, verified, businessData);
        } catch {
          // Không dùng stdout không phải JSON; xử lý như lỗi hạ tầng bên dưới.
        }
      }
      this.logger.error(`Verify failed: ${err?.message || err}`);
      return this.finish(dto, {
        status: 'INDETERMINATE',
        error: 'Không thể hoàn tất xác minh do lỗi hạ tầng',
      }, businessData);
    } finally {
      await fs.rm(hostPath, { force: true });
    }
  }

  private async applyRevocationState(
    certificate: Record<string, any>,
    result: Record<string, any>,
  ): Promise<Record<string, any>> {
    const normalized = String(result?.status || '').toUpperCase();
    const base = {
      ...result,
      status: ALLOWED_STATUSES.has(normalized) ? normalized : 'INDETERMINATE',
    };
    if (base.status !== 'VALID') return base;

    const certUid = this.extractCertId(certificate);
    if (!certUid) return base;
    const revocation = await this.revocation.isRevoked(certUid);
    if (revocation.revoked) {
      this.logger.warn(`Certificate ${certUid} đã thu hồi (tx ${revocation.txid})`);
      return {
        ...base,
        status: 'REVOKED',
        revoked: true,
        revocationTxid: revocation.txid,
        message: 'Chứng thư này đã bị thu hồi',
      };
    }
    if (revocation.pending) {
      this.logger.warn(`Certificate ${certUid} đang đối soát trạng thái thu hồi`);
      return {
        ...base,
        status: 'INDETERMINATE',
        revocationPending: true,
        message: 'Trạng thái thu hồi đang được đối soát; chưa thể kết luận chứng thư hợp lệ',
      };
    }
    return base;
  }

  private async finish(
    dto: VerifyCertificateDto,
    result: Record<string, any>,
    businessData: Record<string, any>,
  ): Promise<Record<string, any>> {
    const enriched = { ...result, ...businessData };
    await this.persist(dto, enriched);
    return enriched;
  }

  private businessData(cert: Record<string, any>): Record<string, any> {
    const subject = cert?.credentialSubject || {};
    const certId = String(cert?.id || cert?.['@id'] || '');
    return {
      recipientName: subject.name,
      certUid: certId.startsWith('urn:uuid:') ? certId.slice(9) : certId || undefined,
      studentCode: subject.studentCode,
      dateOfBirth: subject.dateOfBirth,
      email: subject.email,
      cohort: subject.cohort,
      degreeName: subject.degreeName,
      major: subject.major,
      educationLevel: subject.educationLevel,
      graduationRank: subject.graduationRank,
      graduationYear: subject.graduationYear,
      issueDate: subject.issueDate,
      diplomaNumber: subject.diplomaNumber,
      trainingMode: subject.trainingMode,
    };
  }

  private extractCertId(cert: Record<string, any>): string | null {
    const id = cert?.['@id'] || cert?.id;
    if (!id) return null;
    const match = String(id).match(/([0-9a-fA-F-]{36,})/);
    return match ? match[1] : String(id).slice(0, 64);
  }

  /** Chỉ giữ dữ liệu kỹ thuật cần cho đối soát; không lưu PII từ credentialSubject. */
  private safeComponent(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null;
    const source = value as Record<string, unknown>;
    const allowed = [
      'status',
      'valid',
      'error',
      'errors',
      'txid',
      'confirmations',
      'expectedMerkleRoot',
      'actualMerkleRoot',
    ];
    return Object.fromEntries(
      allowed
        .filter((key) => source[key] !== undefined)
        .map((key) => [key, source[key]]),
    );
  }

  private async enforceRetention(): Promise<void> {
    const now = Date.now();
    if (now - this.lastRetentionSweep < 60 * 60 * 1000) return;
    this.lastRetentionSweep = now;
    const configured = Number(process.env.VERIFICATION_LOG_RETENTION_DAYS || 90);
    const days = Number.isFinite(configured) && configured >= 1 && configured <= 3650
      ? Math.trunc(configured)
      : 90;
    if (typeof (this.logRepo as any).delete !== 'function') return;
    const cutoff = new Date(now - days * 24 * 60 * 60 * 1000);
    await this.logRepo.delete({ createdAt: LessThan(cutoff) });
  }

  private async persist(
    dto: VerifyCertificateDto,
    result: Record<string, any>,
  ) {
    try {
      const certificateVerification = this.safeComponent(result.certificateVerification);
      const anchorVerification = this.safeComponent(result.anchorVerification);
      const safeRaw = {
        status: result.status || 'INDETERMINATE',
        revoked: result.revoked === true,
        revocationPending: result.revocationPending === true,
        revocationTxid: result.revocationTxid || null,
        certificateVerification,
        anchorVerification,
        confirmations: result.confirmations ?? null,
        error: typeof result.error === 'string' ? result.error.slice(0, 500) : null,
      };
      await this.logRepo.save({
        certId: this.extractCertId(dto.certificate),
        status: safeRaw.status,
        certificateVerification,
        anchorVerification,
        confirmations: safeRaw.confirmations,
        raw: safeRaw,
      });
      await this.audit.log({
        action: 'verify',
        targetId: this.extractCertId(dto.certificate),
        detail: safeRaw.status,
      });
      await this.enforceRetention();
    } catch (error) {
      this.logger.error(`Persist verify log failed: ${(error as Error)?.message}`);
    }
  }
}
