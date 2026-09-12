import { MigrationInterface, QueryRunner } from 'typeorm';

export class B12BaselineAndBatch1789198969070 implements MigrationInterface {
  name = 'B12BaselineAndBatch1789198969070';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "users" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "username" varchar(100) NOT NULL,
      "passwordHash" varchar(255) NOT NULL,
      "role" varchar(20) NOT NULL,
      "recipientName" varchar(255),
      "createdAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "PK_users" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_users_username" UNIQUE ("username")
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "issued_certificates" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "recipientName" varchar(255) NOT NULL,
      "pubkey" varchar(255),
      "identity" varchar(255),
      "certUid" varchar(64),
      "txid" varchar(64),
      "merkleRoot" varchar(64),
      "requestedBy" varchar(255),
      "approvedBy" varchar(255),
      "rejectedBy" varchar(255),
      "rejectReason" text,
      "status" varchar(32) NOT NULL DEFAULT 'pending_approval',
      "errorMessage" text,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "revocationTxid" varchar(64),
      "revokedBy" varchar(255),
      "revokeReason" text,
      "revokedAt" timestamp,
      "batchId" varchar(100),
      CONSTRAINT "PK_issued_certificates" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "verification_logs" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "certId" varchar,
      "status" varchar(32) NOT NULL,
      "certificateVerification" jsonb,
      "anchorVerification" jsonb,
      "confirmations" integer,
      "raw" jsonb,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "PK_verification_logs" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "audit_logs" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "action" varchar(20) NOT NULL,
      "actor" varchar(100),
      "actorRole" varchar(20),
      "targetId" varchar(100),
      "detail" text,
      "txid" varchar(64),
      "createdAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `ALTER TABLE "issued_certificates" ADD COLUMN IF NOT EXISTS "batchId" varchar(100)`,
    );
    await queryRunner.query(
      `UPDATE "issued_certificates" SET "status"='failed', "errorMessage"=COALESCE("errorMessage", 'Chuẩn hóa B12: dữ liệu issued thiếu blockchain anchor.') WHERE "status"='issued' AND ("certUid" IS NULL OR "txid" IS NULL OR "merkleRoot" IS NULL)`,
    );
    await queryRunner.query(
      `UPDATE "issued_certificates" i SET "batchId"='legacy-' || substring(i."txid" from 1 for 12) WHERE i."batchId" IS NULL AND i."txid" IN (SELECT "txid" FROM "issued_certificates" WHERE "txid" IS NOT NULL GROUP BY "txid" HAVING count(*) > 1)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_issued_status" ON "issued_certificates" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_issued_batch" ON "issued_certificates" ("batchId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_issued_cert_uid" ON "issued_certificates" ("certUid")`,
    );
    await queryRunner.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='CHK_issued_status') THEN ALTER TABLE "issued_certificates" ADD CONSTRAINT "CHK_issued_status" CHECK ("status" IN ('pending_approval','approved','rejected','queued','processing','issued','revoked','failed')); END IF; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='CHK_issued_anchor') THEN ALTER TABLE "issued_certificates" ADD CONSTRAINT "CHK_issued_anchor" CHECK ("status" NOT IN ('issued','revoked') OR ("certUid" IS NOT NULL AND "txid" IS NOT NULL AND "merkleRoot" IS NOT NULL)); END IF; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='CHK_users_role') THEN ALTER TABLE "users" ADD CONSTRAINT "CHK_users_role" CHECK ("role" IN ('maker','checker','student')); END IF; END $$`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "CHK_users_role"`,
    );
    await queryRunner.query(
      `ALTER TABLE "issued_certificates" DROP CONSTRAINT IF EXISTS "CHK_issued_anchor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "issued_certificates" DROP CONSTRAINT IF EXISTS "CHK_issued_status"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issued_cert_uid"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issued_batch"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issued_status"`);
    await queryRunner.query(
      `ALTER TABLE "issued_certificates" DROP COLUMN IF EXISTS "batchId"`,
    );
  }
}
