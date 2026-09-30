import { createHash, randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditAction, AuditLog } from './audit.entity';

export type AuditInput = {
  action: AuditAction;
  actor?: string | null;
  actorRole?: string | null;
  targetId?: string | null;
  detail?: string | null;
  txid?: string | null;
};

export function calculateAuditHash(row: {
  id: string;
  action: string;
  actor?: string | null;
  actorRole?: string | null;
  targetId?: string | null;
  detail?: string | null;
  txid?: string | null;
  createdAt: Date;
  previousHash?: string | null;
}): string {
  const canonical = JSON.stringify([
    row.id,
    row.action,
    row.actor ?? null,
    row.actorRole ?? null,
    row.targetId ?? null,
    row.detail ?? null,
    row.txid ?? null,
    row.createdAt.toISOString(),
    row.previousHash ?? null,
  ]);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
    private readonly dataSource: DataSource,
  ) {}

  private async append(
    manager: EntityManager,
    input: AuditInput,
    previous: AuditLog | null,
    createdAt: Date,
  ) {
    const row = manager.create(AuditLog, {
      id: randomUUID(),
      action: input.action,
      actor: input.actor ?? null,
      actorRole: input.actorRole ?? null,
      targetId: input.targetId ?? null,
      detail: input.detail ?? null,
      txid: input.txid ?? null,
      previousHash: previous?.entryHash ?? null,
      createdAt,
      entryHash: '',
    });
    row.entryHash = calculateAuditHash(row);
    return manager.save(row);
  }

  async log(input: AuditInput) {
    return this.logMany([input]);
  }

  async logMany(items: AuditInput[]) {
    if (!items.length) return;
    try {
      await this.dataSource.transaction(async (manager) => {
        // Tuần tự hóa đầu chuỗi trên mọi tiến trình backend.
        await manager.query(
          `SELECT pg_advisory_xact_lock(hashtext('datn-audit-chain'))`,
        );
        const latest = await manager.find(AuditLog, {
          order: { createdAt: 'DESC', id: 'DESC' },
          take: 1,
        });
        let previous = latest[0] ?? null;
        let timestamp = Math.max(
          Date.now(),
          previous ? previous.createdAt.getTime() + 1 : 0,
        );
        for (const input of items) {
          previous = await this.append(
            manager,
            input,
            previous,
            new Date(timestamp),
          );
          timestamp += 1;
        }
      });
    } catch (error: any) {
      // Không chặn nghiệp vụ chính, nhưng không được thất bại âm thầm.
      this.logger.error(`AUDIT_WRITE_FAILED: ${error?.message || error}`);
    }
  }

  async list(limit = 200, username?: string, role?: string) {
    if (role !== 'maker' || !username) {
      return this.repo.find({
        order: { createdAt: 'DESC', id: 'DESC' },
        take: limit,
      });
    }
    return this.repo
      .createQueryBuilder('audit')
      .where('audit.actor = :username', { username })
      .orWhere(
        `audit."targetId" IN (SELECT certificate.id::text FROM issued_certificates certificate WHERE certificate."requestedBy" = :username)`,
        { username },
      )
      .orderBy('audit.createdAt', 'DESC')
      .addOrderBy('audit.id', 'DESC')
      .take(limit)
      .getMany();
  }

  async verifyIntegrity() {
    const rows = await this.repo.find({
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    let previousHash: string | null = null;
    for (const row of rows) {
      const expected = calculateAuditHash({ ...row, previousHash });
      if (row.previousHash !== previousHash || row.entryHash !== expected) {
        return {
          valid: false,
          count: rows.length,
          brokenAtId: row.id,
          headHash: previousHash,
        };
      }
      previousHash = row.entryHash;
    }
    return { valid: true, count: rows.length, headHash: previousHash };
  }
}
