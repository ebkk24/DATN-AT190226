import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IssuedCertificate } from "../issuance/issuance.entity";
import { RevocationService } from "./revocation.service";
import { RevocationController } from "./revocation.controller";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [TypeOrmModule.forFeature([IssuedCertificate]), AuthModule, AuditModule],
  controllers: [RevocationController],
  providers: [RevocationService],
  exports: [RevocationService],
})
export class RevocationModule {}
