import { MigrationInterface, QueryRunner } from 'typeorm';

export class RevocationIdempotency1790200000000 implements MigrationInterface {
  name = 'RevocationIdempotency1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "revocationIntentTxid" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "revocationRawTransaction" text`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "revocationPreparedAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "revocationAttemptCount" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "revocationError" text`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_issued_certificates_revocation_intent_txid" ON "issued_certificates" ("revocationIntentTxid") WHERE "revocationIntentTxid" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_issued_certificates_revocation_reconcile" ON "issued_certificates" (status, "revocationPreparedAt") WHERE status IN ('revocation_pending', 'revocation_reconciliation_required')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_issued_certificates_revocation_reconcile"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_issued_certificates_revocation_intent_txid"`);
    for (const column of ['revocationError', 'revocationAttemptCount', 'revocationPreparedAt', 'revocationRawTransaction', 'revocationIntentTxid']) {
      await queryRunner.query(`ALTER TABLE "issued_certificates" DROP COLUMN "${column}"`);
    }
  }
}
