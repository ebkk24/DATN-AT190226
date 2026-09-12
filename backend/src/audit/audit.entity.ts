import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

export type AuditAction =
  | 'register'
  | 'login'
  | 'request'
  | 'approve'
  | 'reject'
  | 'issue'
  | 'revoke'
  | 'verify'
  | 'repair';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  action: AuditAction;

  @Column({ type: 'varchar', length: 100, nullable: true })
  actor?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  actorRole?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  targetId?: string | null;

  @Column({ type: 'text', nullable: true })
  detail?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  txid?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
