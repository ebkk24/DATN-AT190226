import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IssuedCertificate } from '../issuance/issuance.entity';
import { IssuerController } from './issuer.controller';
import { IssuerService } from './issuer.service';

@Module({
  imports: [TypeOrmModule.forFeature([IssuedCertificate])],
  controllers: [IssuerController],
  providers: [IssuerService],
  exports: [IssuerService],
})
export class IssuerModule {}
