import { MigrationInterface, QueryRunner } from 'typeorm';

export class DiplomaBusinessData1790100000000 implements MigrationInterface {
  name = 'DiplomaBusinessData1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "dateOfBirth" date`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "email" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "cohort" character varying(100)`);

    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "studentCode" character varying(50)`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "studentDateOfBirth" date`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "studentEmail" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "cohort" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "degreeName" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "major" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "educationLevel" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "graduationRank" character varying(50)`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "graduationYear" smallint`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "issueDate" date`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "diplomaNumber" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "issued_certificates" ADD COLUMN "trainingMode" character varying(100)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_issued_certificates_diploma_number" ON "issued_certificates" ("diplomaNumber") WHERE "diplomaNumber" IS NOT NULL`);
    await queryRunner.query(`UPDATE "issued_certificates" certificate SET "studentCode" = student."studentCode" FROM "users" student WHERE certificate."studentId" = student.id AND certificate."studentCode" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_issued_certificates_diploma_number"`);
    for (const column of ['trainingMode','diplomaNumber','issueDate','graduationYear','graduationRank','educationLevel','major','degreeName','cohort','studentEmail','studentDateOfBirth','studentCode']) {
      await queryRunner.query(`ALTER TABLE "issued_certificates" DROP COLUMN "${column}"`);
    }
    for (const column of ['cohort','email','dateOfBirth']) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "${column}"`);
    }
  }
}
