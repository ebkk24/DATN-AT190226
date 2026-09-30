import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './user.entity';
import { RegisterDto, LoginDto } from './auth.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private users: Repository<User>,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  private normalizeStudentCode(value?: string) {
    return value?.trim().toUpperCase() || null;
  }

  async register(dto: RegisterDto, createdBy: string) {
    const studentCode =
      dto.role === 'student'
        ? this.normalizeStudentCode(dto.studentCode)
        : null;
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
      studentCode,
      dateOfBirth: dto.role === 'student' ? dto.dateOfBirth : null,
      email:
        dto.role === 'student' ? dto.email?.trim().toLowerCase() || null : null,
      cohort: dto.role === 'student' ? dto.cohort?.trim() || null : null,
    });
    await this.users.save(user);
    await this.audit.log({
      action: 'register',
      actor: createdBy,
      actorRole: 'checker',
      targetId: user.id,
      detail: `${user.username}:${user.role}`,
    });
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      recipientName: user.recipientName,
      studentCode: user.studentCode,
      dateOfBirth: user.dateOfBirth,
      email: user.email,
      cohort: user.cohort,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOne({
      where: { username: dto.username },
    });
    if (!user) {
      throw new UnauthorizedException('Sai tên đăng nhập hoặc mật khẩu');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Sai tên đăng nhập hoặc mật khẩu');
    }
    const payload = { sub: user.id, username: user.username, role: user.role };
    const token = await this.jwt.signAsync(payload);
    await this.audit.log({
      action: 'login',
      actor: user.username,
      actorRole: user.role,
    });
    return { token, role: user.role, username: user.username };
  }
}
