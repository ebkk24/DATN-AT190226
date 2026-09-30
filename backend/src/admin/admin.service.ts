import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/user.entity';
import { UpdateStudentProfileDto } from '../auth/auth.dto';
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

  async updateStudentProfile(
    id: string,
    dto: UpdateStudentProfileDto,
    updatedBy: string,
  ) {
    const student = await this.users.findOne({
      where: { id, role: 'student' },
    });
    if (!student)
      throw new ConflictException('Không tìm thấy tài khoản Student');
    if (dto.recipientName !== undefined)
      student.recipientName = dto.recipientName.trim();
    if (dto.dateOfBirth !== undefined) student.dateOfBirth = dto.dateOfBirth;
    if (dto.email !== undefined) student.email = dto.email.trim().toLowerCase();
    if (dto.cohort !== undefined) student.cohort = dto.cohort.trim();
    const saved = await this.users.save(student);
    await this.audit.log({
      action: 'update_profile',
      actor: updatedBy,
      actorRole: 'checker',
      targetId: saved.id,
      detail: 'student-profile-updated',
    });
    return {
      id: saved.id,
      recipientName: saved.recipientName,
      studentCode: saved.studentCode,
      dateOfBirth: saved.dateOfBirth,
      email: saved.email,
      cohort: saved.cohort,
    };
  }
}
