import { createHash } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

type AuditRow = {
  id: string;
  action: string;
  actor: string | null;
  actorRole: string | null;
  targetId: string | null;
  detail: string | null;
  txid: string | null;
  createdAt: Date | string;
};

function hashRow(row: AuditRow, previousHash: string | null): string {
  const canonical = JSON.stringify([
    row.id,
    row.action,
    row.actor,
    row.actorRole,
    row.targetId,
    row.detail,
    row.txid,
    new Date(row.createdAt).toISOString(),
    previousHash,
  ]);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export class AuditHashChain1790200001000 implements MigrationInterface {
  name = 'AuditHashChain1790200001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN "previousHash" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN "entryHash" character varying(64)`);
    const rows = (await queryRunner.query(`
      SELECT id, action, actor, "actorRole", "targetId", detail, txid, "createdAt"
      FROM "audit_logs"
      ORDER BY "createdAt" ASC, id ASC
    `)) as AuditRow[];
    let previousHash: string | null = null;
    for (const row of rows) {
      const entryHash = hashRow(row, previousHash);
      await queryRunner.query(
        `UPDATE "audit_logs" SET "previousHash" = $1, "entryHash" = $2 WHERE id = $3`,
        [previousHash, entryHash, row.id],
      );
      previousHash = entryHash;
    }
    await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "entryHash" SET NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_audit_logs_entry_hash" ON "audit_logs" ("entryHash")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_entry_hash"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "entryHash"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "previousHash"`);
  }
}
