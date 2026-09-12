import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import databaseConfig from './config/database.config';
import { VerificationModule } from './verification/verification.module';
import { AuthModule } from './auth/auth.module';
import { RevocationModule } from './revocation/revocation.module';
import { AuditModule } from './audit/audit.module';
import { AdminModule } from './admin/admin.module';
import { IssuanceModule } from './issuance/issuance.module';
import { HealthController } from './health.controller';
import { IssuerModule } from './issuer/issuer.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      envFilePath: [
        process.env.DATN_ENV_FILE || `${process.cwd()}/../.env`,
        '.env',
      ],
    }),
    TypeOrmModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (cfg: ReturnType<typeof databaseConfig>) => ({
        ...cfg,
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.get('THROTTLE_TTL_MS') || 60000),
          limit: Number(config.get('THROTTLE_LIMIT') || 120),
        },
      ],
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    VerificationModule,
    IssuanceModule,
    AuthModule,
    RevocationModule,
    AuditModule,
    AdminModule,
    IssuerModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
