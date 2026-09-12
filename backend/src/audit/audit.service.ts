import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuditLog, AuditAction } from "./audit.entity";

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private repo: Repository<AuditLog>) {}

  async log(p: {
    action: AuditAction;
    actor?: string | null;
    actorRole?: string | null;
    targetId?: string | null;
    detail?: string | null;
    txid?: string | null;
  }) {
    try {
      await this.repo.save(this.repo.create({
        action: p.action,
        actor: p.actor ?? null,
        actorRole: p.actorRole ?? null,
        targetId: p.targetId ?? null,
        detail: p.detail ?? null,
        txid: p.txid ?? null,
      }));
    } catch (e) {
      // ghi log that bai khong duoc phep lam ngung luong chinh
    }
  }

  async logMany(items: Array<{
    action: AuditAction;
    actor?: string | null;
    actorRole?: string | null;
    targetId?: string | null;
    detail?: string | null;
    txid?: string | null;
  }>) {
    if (!items.length) return;
    try {
      const rows = items.map((p) => this.repo.create({
        action: p.action,
        actor: p.actor ?? null,
        actorRole: p.actorRole ?? null,
        targetId: p.targetId ?? null,
        detail: p.detail ?? null,
        txid: p.txid ?? null,
      }));
      await this.repo.save(rows, { chunk: 100 });
    } catch {
      // Audit không làm gián đoạn luồng nghiệp vụ chính.
    }
  }

  async list(limit = 200) {
    return this.repo.find({ order: { createdAt: "DESC" }, take: limit });
  }
}
