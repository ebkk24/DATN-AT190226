import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

export type UserRole = 'maker' | 'checker' | 'student';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  username: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 20 })
  role: UserRole;

  // Họ tên chỉ dùng để hiển thị trên chứng thư, không dùng để phân quyền.
  @Column({ type: 'varchar', length: 255, nullable: true })
  recipientName?: string | null;

  // Định danh nghiệp vụ ổn định và duy nhất của Student.
  @Column({ type: 'varchar', length: 50, nullable: true, unique: true })
  studentCode?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
