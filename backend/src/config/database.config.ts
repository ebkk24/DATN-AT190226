import { registerAs } from '@nestjs/config';

/**
 * Cau hinh ket noi PostgreSQL.
 * Doc tu bien moi truong (process.env). Khi chay local, ban export cac bien
 * tu file .env hoac truyen truc tiep.
 */
export default registerAs('database', () => ({
  type: 'postgres' as const,
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  database: process.env.POSTGRES_DB || 'datn',
  // Schema chỉ thay đổi qua migration để bảo toàn dữ liệu và có thể rollback.
  synchronize: false,
  autoLoadEntities: true,
  logging: false,
}));
