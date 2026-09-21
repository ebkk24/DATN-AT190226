import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IssuanceController } from './issuance.controller';
import { IssuanceService } from './issuance.service';
import { IssuanceProcessor } from './issuance.processor';
import { IssuanceBatch } from './issuance-batch.entity';
import { IssuanceOutbox } from './issuance-outbox.entity';
import { IssuanceDispatcher } from './issuance.dispatcher';
import { IssuedCertificate } from './issuance.entity';
import { AuditModule } from '../audit/audit.module';
import { User } from '../auth/user.entity';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'issuance' }),
    TypeOrmModule.forFeature([
      IssuedCertificate,
      User,
      IssuanceBatch,
      IssuanceOutbox,
    ]),
    AuditModule,
  ],
  controllers: [IssuanceController],
  providers: [IssuanceService, IssuanceProcessor, IssuanceDispatcher],
})
export class IssuanceModule {}
