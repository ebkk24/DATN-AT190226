import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudentCertificateIdentity1789900000000 implements MigrationInterface {
  name = 'StudentCertificateIdentity1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "studentCode" character varying(50)`,
    );
    // Dữ liệu Student cũ nhận một mã LEGACY ổn định, không làm mất tài khoản.
    await queryRunner.query(`
      UPDATE "users"
      SET "studentCode" = 'LEGACY-' || UPPER(REPLACE(id::text, '-', ''))
      WHERE role = 'student' AND "studentCode" IS NULL
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_users_student_code" ON "users" ("studentCode") WHERE "studentCode" IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "issued_certificates" ADD COLUMN "studentId" uuid`,
    );
    // Chỉ tự động nối dữ liệu cũ khi họ tên ánh xạ duy nhất tới một Student.
    await queryRunner.query(`
      WITH unique_students AS (
        SELECT "recipientName", (array_agg(id))[1] AS id
        FROM "users"
        WHERE role = 'student' AND "recipientName" IS NOT NULL
        GROUP BY "recipientName"
        HAVING COUNT(*) = 1
      )
      UPDATE "issued_certificates" certificate
      SET "studentId" = student.id
      FROM unique_students student
      WHERE certificate."recipientName" = student."recipientName"
        AND certificate."studentId" IS NULL
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_issued_certificates_student_id" ON "issued_certificates" ("studentId")`,
    );
    await queryRunner.query(`
      ALTER TABLE "issued_certificates"
      ADD CONSTRAINT "FK_issued_certificates_student"
      FOREIGN KEY ("studentId") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "issued_certificates" DROP CONSTRAINT "FK_issued_certificates_student"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_issued_certificates_student_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "issued_certificates" DROP COLUMN "studentId"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_users_student_code"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "studentCode"`);
  }
}
