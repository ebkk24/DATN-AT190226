import { Injectable, UnauthorizedException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import { User } from "./user.entity";
import { RegisterDto, LoginDto } from "./auth.dto";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private users: Repository<User>,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  async register(dto: RegisterDto, createdBy: string) {
    const exist = await this.users.findOne({ where: { username: dto.username } });
    if (exist) throw new ConflictException("Ten dang nhap da ton tai");
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.users.create({
      username: dto.username,
      passwordHash,
      role: dto.role,
      recipientName: dto.recipientName ?? null,
    });
    await this.users.save(user);
    await this.audit.log({ action: "register", actor: createdBy, actorRole: "checker", targetId: user.id, detail: `${user.username}:${user.role}` });
    return { id: user.id, username: user.username, role: user.role };
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { username: dto.username } });
    if (!user) throw new UnauthorizedException("Sai ten dang nhap hoac mat khau");
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Sai ten dang nhap hoac mat khau");
    const payload = { sub: user.id, username: user.username, role: user.role };
    const token = await this.jwt.signAsync(payload);
    await this.audit.log({ action: "login", actor: user.username, actorRole: user.role });
    return { token, role: user.role, username: user.username };
  }
}
