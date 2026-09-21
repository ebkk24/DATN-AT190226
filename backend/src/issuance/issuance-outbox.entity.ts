import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('issuance_outbox')
export class IssuanceOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  batchId: string;

  @Column({ type: 'jsonb' })
  payload: { ids: string[]; batchId: string };

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: 'pending' | 'dispatched';

  @Column({ type: 'integer', default: 0 })
  attemptCount: number;

  @Column({ type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  dispatchedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
