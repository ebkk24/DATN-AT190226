import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { AuditService } from "./audit.service";

@Controller("api/audit")
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("maker", "checker")
  @Get()
  list() {
    return this.svc.list();
  }
}
