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
  | 'revocation_pending'
  | 'revocation_reconciliation_required'
  | 'revoked'
  | 'failed';

@Entity('issued_certificates')
export class IssuedCertificate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Khóa ngoại thật dùng để xác định chủ sở hữu chứng thư.
  @Column({ type: 'uuid', nullable: true })
  studentId?: string | null;

  // Ảnh chụp họ tên tại thời điểm lập phiếu, chỉ dùng để hiển thị.
  @Column({ type: 'varchar', length: 255 })
  recipientName: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  studentCode?: string | null;

  @Column({ type: 'date', nullable: true })
  studentDateOfBirth?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  studentEmail?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  cohort?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  degreeName?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  major?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  educationLevel?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  graduationRank?: string | null;

  @Column({ type: 'smallint', nullable: true })
  graduationYear?: number | null;

  @Column({ type: 'date', nullable: true })
  issueDate?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  diplomaNumber?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  trainingMode?: string | null;

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

  // Nhóm phiếu do Maker tạo trong cùng một lần requestBatch.
  @Column({ type: 'varchar', length: 100, nullable: true })
  requestBatchId?: string | null;

  // Lần phát hành cụ thể do Checker duyệt; mỗi lần duyệt có một ID riêng.
  @Column({ type: 'varchar', length: 100, nullable: true })
  issuanceBatchId?: string | null;

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
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'varchar', length: 64, nullable: true })
  revocationTxid?: string | null;

  // Checkpoint được lưu trước khi broadcast để retry không tạo giao dịch mới.
  @Column({ type: 'varchar', length: 64, nullable: true })
  revocationIntentTxid?: string | null;

  @Column({ type: 'text', nullable: true })
  revocationRawTransaction?: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  revocationPreparedAt?: Date | null;

  @Column({ type: 'integer', default: 0 })
  revocationAttemptCount: number;

  @Column({ type: 'text', nullable: true })
  revocationError?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  revokedBy?: string | null;

  @Column({ type: 'text', nullable: true })
  revokeReason?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt?: Date | null;
}
