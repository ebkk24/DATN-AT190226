import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

export type IssuanceStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'queued'
  | 'processing'
  | 'issued'
  | 'revoked'
  | 'failed';

@Entity('issued_certificates')
export class IssuedCertificate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  recipientName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pubkey?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  identity?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  certUid?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  txid?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  merkleRoot?: string | null;

  // Mã lô bền vững để truy vấn, thống kê và tái hiện thực nghiệm.
  @Column({ type: 'varchar', length: 100, nullable: true })
  batchId?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  requestedBy?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  approvedBy?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  rejectedBy?: string | null;

  @Column({ type: 'text', nullable: true })
  rejectReason?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'pending_approval' })
  status: IssuanceStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  // --- Thu hoi (Revocation) ---
  @Column({ type: 'varchar', length: 64, nullable: true })
  revocationTxid?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  revokedBy?: string | null;

  @Column({ type: 'text', nullable: true })
  revokeReason?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt?: Date | null;
}
