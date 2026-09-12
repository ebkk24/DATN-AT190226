import { ConflictException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import { User } from "../auth/user.entity";
import { RegisterDto } from "../auth/auth.dto";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.users.find({ order: { createdAt: "DESC" } });
    return rows.map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role,
      recipientName: user.recipientName ?? null,
      createdAt: user.createdAt,
    }));
  }

  async create(dto: RegisterDto, createdBy: string) {
    const exist = await this.users.findOne({ where: { username: dto.username } });
    if (exist) throw new ConflictException("Tên đăng nhập đã tồn tại");
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.users.create({
      username: dto.username,
      passwordHash,
      role: dto.role,
      recipientName: dto.recipientName ?? null,
    });
    const saved = await this.users.save(user);
    await this.audit.log({
      action: "register",
      actor: createdBy,
      actorRole: "checker",
      targetId: saved.id,
      detail: `${saved.username}:${saved.role}`,
    });
    return { id: saved.id, username: saved.username, role: saved.role };
  }
}
