import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tách nhóm yêu cầu của Maker khỏi từng lần phát hành của Checker. */
export class SeparateRequestAndIssuanceBatch1790300000000 implements MigrationInterface {
  name = 'SeparateRequestAndIssuanceBatch1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "issued_certificates" ADD COLUMN "requestBatchId" character varying(100)`,
    );
    // batchId cũ là nhóm yêu cầu đối với phiếu chờ, đồng thời là lô phát hành
    // đối với phiếu đã được duyệt. Sao chép trước để không mất quan hệ nhóm.
    await queryRunner.query(
      `UPDATE "issued_certificates" SET "requestBatchId" = "batchId" WHERE "batchId" IS NOT NULL`,
    );
    // Phiếu chưa được duyệt chưa thuộc bất kỳ lần phát hành nào.
    await queryRunner.query(
      `UPDATE "issued_certificates" SET "batchId" = NULL WHERE status IN ('pending_approval', 'rejected')`,
    );
    await queryRunner.query(
      `ALTER TABLE "issued_certificates" RENAME COLUMN "batchId" TO "issuanceBatchId"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issued_batch"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_issued_request_batch" ON "issued_certificates" ("requestBatchId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_issued_issuance_batch" ON "issued_certificates" ("issuanceBatchId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_issued_issuance_batch"`);
    await queryRunner.query(`DROP INDEX "IDX_issued_request_batch"`);
    await queryRunner.query(
      `ALTER TABLE "issued_certificates" RENAME COLUMN "issuanceBatchId" TO "batchId"`,
    );
    // Khi hạ phiên bản, giữ ID phát hành nếu có; nếu chưa phát hành dùng ID nhóm yêu cầu.
    await queryRunner.query(
      `UPDATE "issued_certificates" SET "batchId" = COALESCE("batchId", "requestBatchId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "issued_certificates" DROP COLUMN "requestBatchId"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_issued_batch" ON "issued_certificates" ("batchId")`,
    );
  }
}
