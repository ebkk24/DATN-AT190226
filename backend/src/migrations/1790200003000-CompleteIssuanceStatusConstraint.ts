import { MigrationInterface, QueryRunner } from 'typeorm';

/** Giữ trạng thái approved của baseline khi mở rộng state machine thu hồi. */
export class CompleteIssuanceStatusConstraint1790200003000 implements MigrationInterface {
  name = 'CompleteIssuanceStatusConstraint1790200003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "issued_certificates" DROP CONSTRAINT IF EXISTS "CHK_issued_status"`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD CONSTRAINT "CHK_issued_status" CHECK ("status" IN ('pending_approval','approved','queued','processing','issued','revocation_pending','revocation_reconciliation_required','revoked','rejected','failed'))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "issued_certificates" DROP CONSTRAINT IF EXISTS "CHK_issued_status"`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD CONSTRAINT "CHK_issued_status" CHECK ("status" IN ('pending_approval','queued','processing','issued','revocation_pending','revocation_reconciliation_required','revoked','rejected','failed'))`);
  }
}
