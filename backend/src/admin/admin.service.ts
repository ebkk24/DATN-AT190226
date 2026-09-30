import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../auth/user.entity';
import { RegisterDto, UpdateStudentProfileDto } from '../auth/auth.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.users.find({ order: { createdAt: 'DESC' } });
    return rows.map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role,
      recipientName: user.recipientName ?? null,
      studentCode: user.studentCode ?? null,
      dateOfBirth: user.dateOfBirth ?? null,
      email: user.email ?? null,
      cohort: user.cohort ?? null,
      createdAt: user.createdAt,
    }));
  }

  async updateStudentProfile(id: string, dto: UpdateStudentProfileDto, updatedBy: string) {
    const student = await this.users.findOne({ where: { id, role: 'student' } });
    if (!student) throw new ConflictException('Không tìm thấy tài khoản Student');
    if (dto.recipientName !== undefined) student.recipientName = dto.recipientName.trim();
    if (dto.dateOfBirth !== undefined) student.dateOfBirth = dto.dateOfBirth;
    if (dto.email !== undefined) student.email = dto.email.trim().toLowerCase();
    if (dto.cohort !== undefined) student.cohort = dto.cohort.trim();
    const saved = await this.users.save(student);
    await this.audit.log({ action: 'update_profile', actor: updatedBy, actorRole: 'checker', targetId: saved.id, detail: 'student-profile-updated' });
    return { id: saved.id, recipientName: saved.recipientName, studentCode: saved.studentCode, dateOfBirth: saved.dateOfBirth, email: saved.email, cohort: saved.cohort };
  }

  async create(dto: RegisterDto, createdBy: string) {
    const studentCode =
      dto.role === 'student' ? dto.studentCode?.trim().toUpperCase() : null;
    const exist = await this.users.findOne({
      where: [
        { username: dto.username },
        ...(studentCode ? [{ studentCode }] : []),
      ],
    });
    if (exist?.username === dto.username) {
      throw new ConflictException('Tên đăng nhập đã tồn tại');
    }
    if (exist?.studentCode === studentCode) {
      throw new ConflictException('Mã sinh viên đã tồn tại');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.users.create({
      username: dto.username.trim(),
      passwordHash,
      role: dto.role,
      recipientName:
        dto.role === 'student' ? dto.recipientName?.trim() || null : null,
      studentCode: studentCode || null,
      dateOfBirth: dto.role === 'student' ? dto.dateOfBirth : null,
      email: dto.role === 'student' ? dto.email?.trim().toLowerCase() : null,
      cohort: dto.role === 'student' ? dto.cohort?.trim() : null,
    });
    const saved = await this.users.save(user);
    await this.audit.log({
      action: 'register',
      actor: createdBy,
      actorRole: 'checker',
      targetId: saved.id,
      detail: `${saved.username}:${saved.role}`,
    });
    return {
      id: saved.id,
      username: saved.username,
      role: saved.role,
      recipientName: saved.recipientName,
      studentCode: saved.studentCode,
      dateOfBirth: saved.dateOfBirth,
      email: saved.email,
      cohort: saved.cohort,
    };
  }
}
