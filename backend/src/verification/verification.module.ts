import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { VerificationController } from "./verification.controller";
import { VerificationService } from "./verification.service";
import { VerificationLog } from "./entities/verification-log.entity";
import { AuditModule } from "../audit/audit.module";
import { RevocationModule } from "../revocation/revocation.module";

@Module({
  imports: [TypeOrmModule.forFeature([VerificationLog]), RevocationModule, AuditModule],
  controllers: [VerificationController],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
