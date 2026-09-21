import { MigrationInterface, QueryRunner } from 'typeorm';

export class RevocationStatusConstraint1790200002000 implements MigrationInterface {
  name = 'RevocationStatusConstraint1790200002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "issued_certificates" DROP CONSTRAINT IF EXISTS "CHK_issued_status"`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD CONSTRAINT "CHK_issued_status" CHECK ("status" IN ('pending_approval','approved','queued','processing','issued','revocation_pending','revocation_reconciliation_required','revoked','rejected','failed'))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "issued_certificates" DROP CONSTRAINT IF EXISTS "CHK_issued_status"`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD CONSTRAINT "CHK_issued_status" CHECK ("status" IN ('pending_approval','approved','queued','processing','issued','revoked','rejected','failed'))`);
  }
}
