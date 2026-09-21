import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IssuedCertificate, IssuanceStatus } from './issuance.entity';
import {
  ApproveDto,
  BatchApproveDto,
  IssueRequestDto,
  RejectDto,
} from './issue.dto';
import { AuditService } from '../audit/audit.service';
import { User } from '../auth/user.entity';
import { IssuanceBatch } from './issuance-batch.entity';
import { IssuanceOutbox } from './issuance-outbox.entity';
import { IssuanceDispatcher } from './issuance.dispatcher';

@Injectable()
export class IssuanceService {
  constructor(
    @InjectRepository(IssuedCertificate)
    private readonly repo: Repository<IssuedCertificate>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
    private readonly dispatcher: IssuanceDispatcher,
  ) {}

  private normalizeStudentCode(value: string) {
    return value.trim().toUpperCase();
  }

  private async studentByCode(studentCode: string) {
    const normalized = this.normalizeStudentCode(studentCode);
    const student = await this.users.findOne({
      where: { studentCode: normalized, role: 'student' },
    });
    if (!student || !student.recipientName) {
      throw new NotFoundException(`Không tìm thấy Student có mã ${normalized}`);
    }
    return student;
  }

  // Maker chỉ cung cấp mã sinh viên; backend tự lấy đúng chủ thể từ DB.
  async request(dto: IssueRequestDto, requestedBy: string) {
    const student = await this.studentByCode(dto.studentCode);
    const row = this.repo.create({
      studentId: student.id,
      recipientName: student.recipientName!,
      pubkey: dto.pubkey,
      identity: dto.identity?.trim() || student.studentCode!,
      requestedBy,
      status: 'pending_approval',
    });
    const saved = await this.repo.save(row);
    await this.audit.log({
      action: 'request',
      actor: requestedBy,
      actorRole: 'maker',
      targetId: saved.id,
      detail: `${student.studentCode}:${saved.recipientName}`,
    });
    return {
      id: saved.id,
      status: saved.status,
      studentCode: student.studentCode,
      recipientName: saved.recipientName,
    };
  }

  // Maker lập lô tối đa 500 phiếu trong một lần gọi API.
  async requestBatch(items: IssueRequestDto[], requestedBy: string) {
    const codes = [
      ...new Set(
        items.map((item) => this.normalizeStudentCode(item.studentCode)),
      ),
    ];
    const students = await this.users.find({
      where: { studentCode: In(codes), role: 'student' },
    });
    const byCode = new Map(
      students
        .filter((student) => student.studentCode && student.recipientName)
        .map((student) => [student.studentCode!, student]),
    );
    const missing = codes.filter((code) => !byCode.has(code));
    if (missing.length) {
      throw new NotFoundException(
        `Không tìm thấy Student: ${missing.slice(0, 10).join(', ')}`,
      );
    }

    const batchId = crypto.randomUUID();
    const rows = items.map((dto) => {
      const student = byCode.get(this.normalizeStudentCode(dto.studentCode))!;
      return this.repo.create({
        studentId: student.id,
        recipientName: student.recipientName!,
        pubkey: dto.pubkey,
        identity: dto.identity?.trim() || student.studentCode!,
        requestedBy,
        batchId,
        status: 'pending_approval' as IssuanceStatus,
      });
    });
    const saved = await this.repo.save(rows, { chunk: 100 });
    await this.audit.logMany(
      saved.map((row) => ({
        action: 'request' as const,
        actor: requestedBy,
        actorRole: 'maker',
        targetId: row.id,
        detail: `batch:${row.studentId}:${row.recipientName}`,
      })),
    );
    return {
      batchId,
      count: saved.length,
      status: 'pending_approval',
      ids: saved.map((row) => row.id),
    };
  }

  private async approveIds(
    ids: string[],
    approvedBy: string,
    preferredBatchId?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager
        .getRepository(IssuedCertificate)
        .createQueryBuilder('certificate')
        .setLock('pessimistic_write')
        .where('certificate.id IN (:...ids)', { ids })
        .orderBy('certificate.id', 'ASC')
        .getMany();
      if (rows.length !== ids.length) {
        throw new NotFoundException('Có phiếu trong lô không tồn tại');
      }
      const invalid = rows.filter((row) => row.status !== 'pending_approval');
      if (invalid.length) {
        throw new BadRequestException(
          `Có ${invalid.length} phiếu không ở trạng thái chờ duyệt`,
        );
      }
      const existingBatchIds = [
        ...new Set(rows.map((row) => row.batchId).filter(Boolean)),
      ];
      const batchId =
        preferredBatchId ||
        (existingBatchIds.length === 1
          ? existingBatchIds[0]!
          : crypto.randomUUID());
      const jobId = `issuance-${batchId}`;
      for (const row of rows) {
        row.status = 'queued';
        row.approvedBy = approvedBy;
        row.batchId = batchId;
      }
      await manager.save(IssuedCertificate, rows, { chunk: 100 });
      await manager.save(
        IssuanceBatch,
        manager.create(IssuanceBatch, {
          batchId,
          jobId,
          status: 'pending_enqueue',
          certificateIds: rows.map((row) => row.id),
          attemptCount: 0,
        }),
      );
      await manager.save(
        IssuanceOutbox,
        manager.create(IssuanceOutbox, {
          batchId,
          payload: { ids: rows.map((row) => row.id), batchId },
          status: 'pending',
          attemptCount: 0,
        }),
      );
      return { rows, batchId, jobId };
    });
  }

  // Checker duyệt một phiếu; trạng thái và outbox được commit nguyên tử.
  async approve(id: string, _dto: ApproveDto, approvedBy: string) {
    const result = await this.approveIds([id], approvedBy, `single-${id}`);
    await this.audit.log({
      action: 'approve',
      actor: approvedBy,
      actorRole: 'checker',
      targetId: id,
    });
    try {
      await this.dispatcher.dispatchBatch(result.batchId);
    } catch {
      // Outbox vẫn ở pending; dispatcher nền sẽ thử lại.
    }
    return {
      id,
      jobId: result.jobId,
      batchId: result.batchId,
      status: 'queued',
    };
  }

  // Checker duyệt cả lô; worker nhận đúng một job có jobId ổn định.
  async approveBatch(dto: BatchApproveDto, approvedBy: string) {
    const ids = [...new Set(dto.ids)];
    const result = await this.approveIds(ids, approvedBy);
    await this.audit.logMany(
      result.rows.map((row) => ({
        action: 'approve' as const,
        actor: approvedBy,
        actorRole: 'checker',
        targetId: row.id,
        detail: 'batch',
      })),
    );
    try {
      await this.dispatcher.dispatchBatch(result.batchId);
    } catch {
      // Outbox vẫn ở pending; dispatcher nền sẽ thử lại.
    }
    return {
      jobId: result.jobId,
      batchId: result.batchId,
      count: result.rows.length,
      status: 'queued',
    };
  }

  async reject(id: string, dto: RejectDto, rejectedBy: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy phiếu');
    if (row.status !== 'pending_approval') {
      throw new BadRequestException(
        `Chỉ từ chối được phiếu đang chờ (hiện tại: ${row.status})`,
      );
    }
    row.status = 'rejected';
    row.rejectedBy = rejectedBy;
    row.rejectReason = dto.reason ?? null;
    await this.repo.save(row);
    await this.audit.log({
      action: 'reject',
      actor: rejectedBy,
      actorRole: 'checker',
      targetId: row.id,
      detail: dto.reason ?? null,
    });
    return { id, status: 'rejected' };
  }

  async getStatus(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  async retryBatch(batchId: string) {
    const batch = await this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .getRepository(IssuanceBatch)
        .createQueryBuilder('batch')
        .setLock('pessimistic_write')
        .where('batch.batchId = :batchId', { batchId })
        .getOne();
      if (!locked) throw new NotFoundException('Không tìm thấy batch');
      if (locked.status === 'completed') return locked;
      if (
        ![
          'failed',
          'reconciliation_required',
          'processing',
          'anchor_prepared',
          'queued',
        ].includes(locked.status)
      ) {
        throw new BadRequestException(
          `Không thể retry batch ở trạng thái ${locked.status}`,
        );
      }
      locked.status = locked.anchorTxid ? 'reconciliation_required' : 'queued';
      locked.lastError = null;
      await manager.save(IssuanceBatch, locked);
      await manager
        .createQueryBuilder()
        .update(IssuedCertificate)
        .set({ status: 'queued', errorMessage: null })
        .where('id IN (:...ids)', { ids: locked.certificateIds })
        .andWhere('status IN (:...statuses)', {
          statuses: ['failed', 'processing', 'queued'],
        })
        .execute();
      return locked;
    });
    if (batch.status !== 'completed') await this.dispatcher.retryBatch(batchId);
    return { batchId, jobId: batch.jobId, status: batch.status };
  }

  async holderCertificates(studentId: string) {
    if (!studentId) return [];
    const rows = await this.repo.find({
      where: {
        studentId,
        status: In(['issued', 'revoked'] as IssuanceStatus[]),
      },
      order: { createdAt: 'DESC' },
    });
    const datnRoot = process.env.DATN_ROOT || path.resolve(process.cwd(), '..');
    const certDir = path.join(
      datnRoot,
      'blockcerts/cert-issuer/blockchain_certificates',
    );
    return rows.map((row) => {
      let certificate: unknown = null;
      if (row.certUid) {
        const fp = path.join(certDir, `${row.certUid}.json`);
        if (fs.existsSync(fp)) {
          try {
            certificate = JSON.parse(fs.readFileSync(fp, 'utf8')) as unknown;
          } catch {
            certificate = null;
          }
        }
      }
      return {
        id: row.id,
        recipientName: row.recipientName,
        certUid: row.certUid,
        status: row.status,
        txid: row.txid,
        merkleRoot: row.merkleRoot,
        createdAt: row.createdAt,
        revokedAt: row.revokedAt ?? null,
        revocationTxid: row.revocationTxid ?? null,
        certificate,
      };
    });
  }

  async list(status?: string, batchId?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (batchId) where.batchId = batchId;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }
}
