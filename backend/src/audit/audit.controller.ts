import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { AuditService } from "./audit.service";

@Controller("api/audit")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("maker", "checker")
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @Get("integrity")
  integrity() {
    return this.svc.verifyIntegrity();
  }

  @Get()
  list() {
    return this.svc.list();
  }
}
