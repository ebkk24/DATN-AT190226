import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IssuanceController } from "./issuance.controller";
import { IssuanceService } from "./issuance.service";
import { IssuanceProcessor } from "./issuance.processor";
import { IssuedCertificate } from "./issuance.entity";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [
    BullModule.registerQueue({ name: "issuance" }),
    TypeOrmModule.forFeature([IssuedCertificate]),
    AuditModule,
  ],
  controllers: [IssuanceController],
  providers: [IssuanceService, IssuanceProcessor],
})
export class IssuanceModule {}
