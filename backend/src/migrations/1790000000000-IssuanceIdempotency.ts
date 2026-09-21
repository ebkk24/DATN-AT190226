import { MigrationInterface, QueryRunner } from 'typeorm';

export class IssuanceIdempotency1790000000000 implements MigrationInterface {
  name = 'IssuanceIdempotency1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "issuance_batches" (
        "batchId" character varying(100) NOT NULL,
        "jobId" character varying(140) NOT NULL,
        "status" character varying(40) NOT NULL,
        "certificateIds" jsonb NOT NULL,
        "merkleRoot" character varying(64),
        "anchorTxid" character varying(64),
        "rawTransaction" text,
        "attemptCount" integer NOT NULL DEFAULT 0,
        "lastError" text,
        "enqueuedAt" TIMESTAMP WITH TIME ZONE,
        "processingStartedAt" TIMESTAMP WITH TIME ZONE,
        "anchorPreparedAt" TIMESTAMP WITH TIME ZONE,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_issuance_batches_batchId" PRIMARY KEY ("batchId"),
        CONSTRAINT "UQ_issuance_batches_jobId" UNIQUE ("jobId"),
        CONSTRAINT "UQ_issuance_batches_anchorTxid" UNIQUE ("anchorTxid"),
        CONSTRAINT "CHK_issuance_batches_status" CHECK (
          "status" IN (
            'pending_enqueue', 'queued', 'processing', 'anchor_prepared',
            'reconciliation_required', 'completed', 'failed'
          )
        ),
        CONSTRAINT "CHK_issuance_batches_anchor_complete" CHECK (
          "anchorTxid" IS NULL OR ("merkleRoot" IS NOT NULL AND "rawTransaction" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_issuance_batches_status_updatedAt"
      ON "issuance_batches" ("status", "updatedAt")
    `);
    await queryRunner.query(`
      CREATE TABLE "issuance_outbox" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "batchId" character varying(100) NOT NULL,
        "payload" jsonb NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "attemptCount" integer NOT NULL DEFAULT 0,
        "lastError" text,
        "dispatchedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_issuance_outbox_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_issuance_outbox_batchId" UNIQUE ("batchId"),
        CONSTRAINT "CHK_issuance_outbox_status" CHECK ("status" IN ('pending', 'dispatched')),
        CONSTRAINT "FK_issuance_outbox_batchId" FOREIGN KEY ("batchId")
          REFERENCES "issuance_batches"("batchId") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_issuance_outbox_status_updatedAt"
      ON "issuance_outbox" ("status", "updatedAt")
    `);

    // Gắn khóa idempotency ổn định cho phiếu đơn cũ trước khi tạo batch.
    await queryRunner.query(`
      UPDATE "issued_certificates"
      SET "batchId" = 'single-' || id::text
      WHERE "batchId" IS NULL AND status IN ('queued', 'processing', 'failed')
    `);

    // Bảo toàn phiếu đang dở; phiếu đã failed chỉ được retry thủ công.
    await queryRunner.query(`
      INSERT INTO "issuance_batches" (
        "batchId", "jobId", "status", "certificateIds", "attemptCount"
      )
      SELECT
        grouped."stableBatchId",
        'issuance-' || grouped."stableBatchId",
        grouped."initialStatus",
        grouped.ids,
        0
      FROM (
        SELECT
          COALESCE("batchId", 'single-' || id::text) AS "stableBatchId",
          jsonb_agg(id ORDER BY id) AS ids,
          CASE WHEN bool_and(status = 'failed') THEN 'failed' ELSE 'pending_enqueue' END AS "initialStatus"
        FROM "issued_certificates"
        WHERE status IN ('queued', 'processing', 'failed')
        GROUP BY COALESCE("batchId", 'single-' || id::text)
      ) grouped
      ON CONFLICT ("batchId") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "issuance_outbox" ("batchId", "payload", "status")
      SELECT
        "batchId",
        jsonb_build_object('batchId', "batchId", 'ids', "certificateIds"),
        'pending'
      FROM "issuance_batches"
      WHERE "status" = 'pending_enqueue'
      ON CONFLICT ("batchId") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "issuance_outbox"');
    await queryRunner.query('DROP TABLE "issuance_batches"');
  }
}
