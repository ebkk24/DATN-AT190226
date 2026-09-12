import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

/**
 * Luu lai moi lan goi xac minh.
 * Giup truy vet: ai xac minh, chung thu nao, ket luan gi, luc nao.
 */
@Entity("verification_logs")
export class VerificationLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Ma chung thu (neu trich duoc tu payload)
  @Column({ type: "varchar", nullable: true })
  certId: string | null;

  // Ket luan tong: VALID | INVALID | REVOKED | INDETERMINATE
  @Column({ type: "varchar", length: 32 })
  status: string;

  // Ket qua chi tiet tu cert-verifier-js
  @Column({ type: "jsonb", nullable: true })
  certificateVerification: Record<string, any> | null;

  // Ket qua tu Regtest Anchor Adapter
  @Column({ type: "jsonb", nullable: true })
  anchorVerification: Record<string, any> | null;

  // So block xac nhan tren Bitcoin
  @Column({ type: "integer", nullable: true })
  confirmations: number | null;

  // Toan bo phan hoi JSON de audit
  @Column({ type: "jsonb", nullable: true })
  raw: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
