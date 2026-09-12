import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from "typeorm";

export type IssuanceStatus = "queued" | "processing" | "issued" | "failed";

@Entity("issued_certificates")
export class IssuedCertificate {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 255 })
  recipientName: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  identity: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  certUid: string;

  @Column({ type: "varchar", length: 64, nullable: true, unique: true })
  txid: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  merkleRoot: string;

  @Column({ type: "varchar", length: 32, default: "queued" })
  status: IssuanceStatus;

  @Column({ type: "text", nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;
}
