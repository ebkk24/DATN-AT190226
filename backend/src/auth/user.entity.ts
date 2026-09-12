import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from "typeorm";

export type UserRole = "maker" | "checker" | "student";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 100, unique: true })
  username: string;

  // Mat khau da duoc bam (khong luu trang)
  @Column({ type: "varchar", length: 255 })
  passwordHash: string;

  @Column({ type: "varchar", length: 20 })
  role: UserRole;

  // Ten nguoi nhan chung thu (khoa ngoai mem voi issued_certificates.recipientName)
  @Column({ type: "varchar", length: 255, nullable: true })
  recipientName?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
