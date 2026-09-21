import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReconcileLegacyIssuanceBatches1790000001000 implements MigrationInterface {
  name = 'ReconcileLegacyIssuanceBatches1790000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "issued_certificates" c
      SET "batchId" = b."batchId"
      FROM "issuance_batches" b
      WHERE c."batchId" IS NULL
        AND b."batchId" = 'single-' || c.id::text
    `);
    await queryRunner.query(`
      UPDATE "issuance_batches" b
      SET status = 'failed',
          "lastError" = COALESCE(b."lastError", 'Legacy failed batch requires manual retry'),
          "updatedAt" = now()
      FROM "issued_certificates" c
      WHERE c."batchId" = b."batchId"
        AND c.status = 'failed'
        AND b.status IN ('pending_enqueue', 'queued', 'processing')
        AND b."anchorTxid" IS NULL
    `);
  }

  public async down(): Promise<void> {
    // Data reconciliation is intentionally not reversed.
  }
}
