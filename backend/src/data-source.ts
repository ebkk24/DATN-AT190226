import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { User } from './auth/user.entity';
import { IssuedCertificate } from './issuance/issuance.entity';
import { VerificationLog } from './verification/entities/verification-log.entity';
import { AuditLog } from './audit/audit.entity';

dotenv.config({
  path: process.env.DATN_ENV_FILE || path.resolve(process.cwd(), '../.env'),
});
dotenv.config({ quiet: true });

export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: Number(process.env.POSTGRES_PORT || 5432),
  username: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  database: process.env.POSTGRES_DB || 'datn',
  synchronize: false,
  logging: false,
  entities: [User, IssuedCertificate, VerificationLog, AuditLog],
  migrations: [path.join(__dirname, 'migrations', '*.{js,ts}')],
  migrationsTableName: 'typeorm_migrations',
});
