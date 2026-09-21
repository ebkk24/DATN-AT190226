import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type IssuanceBatchStatus =
  | 'pending_enqueue'
  | 'queued'
  | 'processing'
  | 'anchor_prepared'
  | 'reconciliation_required'
  | 'completed'
  | 'failed';

@Entity('issuance_batches')
export class IssuanceBatch {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  batchId: string;

  @Column({ type: 'varchar', length: 140, unique: true })
  jobId: string;

  @Column({ type: 'varchar', length: 40, default: 'pending_enqueue' })
  status: IssuanceBatchStatus;

  @Column({ type: 'jsonb' })
  certificateIds: string[];

  @Column({ type: 'varchar', length: 64, nullable: true })
  anchorTxid?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  merkleRoot?: string | null;

  @Column({ type: 'text', nullable: true })
  rawTransaction?: string | null;

  @Column({ type: 'integer', default: 0 })
  attemptCount: number;

  @Column({ type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  enqueuedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  processingStartedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  anchorPreparedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
