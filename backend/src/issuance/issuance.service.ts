import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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

@Injectable()
export class IssuanceService {
  constructor(
    @InjectQueue('issuance') private readonly queue: Queue,
    @InjectRepository(IssuedCertificate)
    private readonly repo: Repository<IssuedCertificate>,
    private readonly audit: AuditService,
  ) {}

  // Maker lập một phiếu, chưa phát hành.
  async request(dto: IssueRequestDto, requestedBy: string) {
    const row = this.repo.create({
      recipientName: dto.recipientName,
      pubkey: dto.pubkey,
      identity: dto.identity ?? undefined,
      requestedBy,
      status: 'pending_approval',
    });
    const saved = await this.repo.save(row);
    await this.audit.log({
      action: 'request',
      actor: requestedBy,
      actorRole: 'maker',
      targetId: saved.id,
      detail: saved.recipientName,
    });
    return { id: saved.id, status: saved.status };
  }

  // Maker lập lô tối đa 500 phiếu trong một lần gọi API.
  async requestBatch(items: IssueRequestDto[], requestedBy: string) {
    const batchId = crypto.randomUUID();
    const rows = items.map((dto) =>
      this.repo.create({
        recipientName: dto.recipientName,
        pubkey: dto.pubkey,
        identity: dto.identity ?? undefined,
        requestedBy,
        batchId,
        status: 'pending_approval' as IssuanceStatus,
      }),
    );
    const saved = await this.repo.save(rows, { chunk: 100 });
    await this.audit.logMany(
      saved.map((row) => ({
        action: 'request' as const,
        actor: requestedBy,
        actorRole: 'maker',
        targetId: row.id,
        detail: `batch:${row.recipientName}`,
      })),
    );
    return {
      batchId,
      count: saved.length,
      status: 'pending_approval',
      ids: saved.map((row) => row.id),
    };
  }

  // Checker duyệt một phiếu.
  async approve(id: string, _dto: ApproveDto, approvedBy: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy phiếu');
    if (row.status !== 'pending_approval') {
      throw new BadRequestException(
        `Chỉ duyệt được phiếu đang chờ (hiện tại: ${row.status})`,
      );
    }
    row.status = 'queued';
    row.approvedBy = approvedBy;
    await this.repo.save(row);
    await this.audit.log({
      action: 'approve',
      actor: approvedBy,
      actorRole: 'checker',
      targetId: row.id,
    });
    await this.queue.add(
      'issue',
      { id: row.id },
      {
        attempts: 1,
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
    return { id, status: 'queued' };
  }

  // Checker duyệt cả lô; worker nhận đúng một job chứa nhiều id.
  async approveBatch(dto: BatchApproveDto, approvedBy: string) {
    const ids = [...new Set(dto.ids)];
    const rows = await this.repo.find({ where: { id: In(ids) } });
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
      existingBatchIds.length === 1
        ? existingBatchIds[0]!
        : crypto.randomUUID();
    for (const row of rows) {
      row.status = 'queued';
      row.approvedBy = approvedBy;
      row.batchId = batchId;
    }
    await this.repo.save(rows, { chunk: 100 });
    await this.audit.logMany(
      rows.map((row) => ({
        action: 'approve' as const,
        actor: approvedBy,
        actorRole: 'checker',
        targetId: row.id,
        detail: 'batch',
      })),
    );
    const job = await this.queue.add(
      'issue-batch',
      {
        ids: rows.map((row) => row.id),
        batchId,
      },
      {
        attempts: 1,
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
    return {
      jobId: String(job.id),
      batchId,
      count: rows.length,
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

  async holderCertificates(recipientName: string) {
    if (!recipientName) return [];
    const rows = await this.repo.find({
      where: {
        recipientName,
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
      let certificate: any = null;
      if (row.certUid) {
        const fp = path.join(certDir, `${row.certUid}.json`);
        if (fs.existsSync(fp)) {
          try {
            certificate = JSON.parse(fs.readFileSync(fp, 'utf8'));
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
    if (status) where.status = status as IssuanceStatus;
    if (batchId) where.batchId = batchId;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }
}
