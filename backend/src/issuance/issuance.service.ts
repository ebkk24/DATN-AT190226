import {
  BadRequestException,
  ConflictException,
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

  async studentProfile(studentCode: string) {
    const student = await this.studentByCode(studentCode);
    return {
      studentCode: student.studentCode,
      recipientName: student.recipientName,
      dateOfBirth: student.dateOfBirth ?? null,
      email: student.email ?? null,
      cohort: student.cohort ?? null,
    };
  }

  private assertCompleteStudent(student: User) {
    if (!student.dateOfBirth || !student.email || !student.cohort) {
      throw new BadRequestException(
        `Hồ sơ Student ${student.studentCode} thiếu ngày sinh, email hoặc niên khóa`,
      );
    }
  }

  private certificateValues(dto: IssueRequestDto, student: User) {
    this.assertCompleteStudent(student);
    const issueDate = new Date(`${dto.issueDate}T00:00:00Z`);
    if (
      Number.isNaN(issueDate.getTime()) ||
      issueDate.toISOString().slice(0, 10) !== dto.issueDate
    ) {
      throw new BadRequestException('Ngày cấp không hợp lệ');
    }
    if (dto.graduationYear > issueDate.getUTCFullYear()) {
      throw new BadRequestException('Năm tốt nghiệp không được sau năm cấp');
    }
    return {
      studentId: student.id,
      studentCode: student.studentCode!,
      recipientName: student.recipientName!,
      studentDateOfBirth: student.dateOfBirth!,
      studentEmail: student.email!,
      cohort: student.cohort!,
      pubkey: dto.pubkey,
      identity: dto.identity?.trim() || student.studentCode!,
      degreeName: dto.degreeName,
      major: dto.major,
      educationLevel: dto.educationLevel,
      graduationRank: dto.graduationRank,
      graduationYear: dto.graduationYear,
      issueDate: dto.issueDate,
      diplomaNumber: dto.diplomaNumber,
      trainingMode: dto.trainingMode,
    };
  }

  // Maker chỉ cung cấp mã sinh viên và dữ liệu văn bằng; backend chụp hồ sơ từ DB.
  async request(dto: IssueRequestDto, requestedBy: string) {
    const student = await this.studentByCode(dto.studentCode);
    const duplicate = await this.repo.findOne({
      where: { diplomaNumber: dto.diplomaNumber },
    });
    if (duplicate) throw new ConflictException('Số hiệu văn bằng đã tồn tại');
    const row = this.repo.create({
      ...this.certificateValues(dto, student),
      requestedBy,
      status: 'pending_approval',
    });
    const saved = await this.repo.save(row);
    await this.audit.log({
      action: 'request',
      actor: requestedBy,
      actorRole: 'maker',
      targetId: saved.id,
      detail: `student:${student.id}`,
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

    const diplomaNumbers = items.map((item) => item.diplomaNumber);
    if (new Set(diplomaNumbers).size !== diplomaNumbers.length) {
      throw new ConflictException('Lô có số hiệu văn bằng bị trùng');
    }
    const existing = await this.repo.find({
      where: { diplomaNumber: In(diplomaNumbers) },
    });
    if (existing.length) {
      throw new ConflictException(
        `Số hiệu văn bằng đã tồn tại: ${existing
          .slice(0, 10)
          .map((row) => row.diplomaNumber)
          .join(', ')}`,
      );
    }
    const requestBatchId = crypto.randomUUID();
    const rows = items.map((dto) => {
      const student = byCode.get(this.normalizeStudentCode(dto.studentCode))!;
      return this.repo.create({
        ...this.certificateValues(dto, student),
        requestedBy,
        requestBatchId,
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
        detail: `batch:student:${row.studentId}`,
      })),
    );
    return {
      requestBatchId,
      // Tương thích API cũ; batchId ở kết quả lập lô là ID nhóm yêu cầu.
      batchId: requestBatchId,
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
      // Không tái sử dụng requestBatchId: một nhóm yêu cầu có thể được duyệt
      // thành nhiều lần phát hành độc lập. issuanceBatchId vẫn là khóa
      // idempotency ổn định của đúng lần duyệt này.
      const batchId = preferredBatchId || crypto.randomUUID();
      const jobId = `issuance-${batchId}`;
      for (const row of rows) {
        row.status = 'queued';
        row.approvedBy = approvedBy;
        row.issuanceBatchId = batchId;
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
      const requestBatchIds = [
        ...new Set(rows.map((row) => row.requestBatchId).filter(Boolean)),
      ];
      return { rows, batchId, jobId, requestBatchIds };
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
      issuanceBatchId: result.batchId,
      requestBatchIds: result.requestBatchIds,
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
      // batchId được giữ làm bí danh tương thích API cũ; trường chuẩn là issuanceBatchId.
      batchId: result.batchId,
      issuanceBatchId: result.batchId,
      requestBatchIds: result.requestBatchIds,
      count: result.rows.length,
      status: 'queued',
    };
  }

  async reject(id: string, dto: RejectDto, rejectedBy: string) {
    // Cập nhật có điều kiện giúp reject không thể ghi đè approve vừa commit.
    const result = await this.repo.update(
      { id, status: 'pending_approval' },
      {
        status: 'rejected',
        rejectedBy,
        rejectReason: dto.reason ?? null,
      },
    );
    if (result.affected !== 1) {
      const current = await this.repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy phiếu');
      throw new BadRequestException(
        `Chỉ từ chối được phiếu đang chờ (hiện tại: ${current.status})`,
      );
    }
    await this.audit.log({
      action: 'reject',
      actor: rejectedBy,
      actorRole: 'checker',
      targetId: id,
      detail: dto.reason ?? null,
    });
    return { id, status: 'rejected' };
  }

  async getStatus(id: string, username: string, role: string) {
    const where: Record<string, unknown> = { id };
    if (role === 'maker') where.requestedBy = username;
    const row = await this.repo.findOne({ where });
    if (!row) throw new NotFoundException('Không tìm thấy phiếu');
    return row;
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
        studentCode: row.studentCode,
        studentDateOfBirth: row.studentDateOfBirth,
        studentEmail: row.studentEmail,
        degreeName: row.degreeName,
        major: row.major,
        educationLevel: row.educationLevel,
        graduationRank: row.graduationRank,
        graduationYear: row.graduationYear,
        issueDate: row.issueDate,
        diplomaNumber: row.diplomaNumber,
        trainingMode: row.trainingMode,
        cohort: row.cohort,
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

  async list(
    status: string | undefined,
    batchId: string | undefined,
    username: string,
    role: string,
  ) {
    const where: Record<string, unknown> = {};
    if (role === 'maker') where.requestedBy = username;
    if (status) where.status = status;
    if (batchId) where.requestBatchId = batchId;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }
}
