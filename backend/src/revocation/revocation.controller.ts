import { Controller, Post, Param, Body, UseGuards, Req, HttpException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles, RolesGuard } from "../auth/roles.guard";
import type { Request } from "express";
import { RevocationService } from "./revocation.service";

type AuthUser = { userId: string; username: string; role: string };

@Controller("api/revoke")
export class RevocationController {
  constructor(private readonly svc: RevocationService) {}

  // Kiem tra nhanh (cong khai) mot certUid da bi thu hoi chua - DAT TRUOC :id
  @Post("check")
  check(@Body() body: { certUid: string }) {
    return this.svc.isRevoked(body.certUid);
  }

  // Chi Checker moi duoc thu hoi
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("checker")
  @Post(":id")
  async revoke(@Param("id") id: string, @Body() body: { reason?: string }, @Req() req: Request) {
    try {
      const u = req.user as AuthUser;
      return await this.svc.revoke(id, body?.reason || "", u.username);
    } catch (e: any) {
      console.error("REVOKE HANDLER ERROR:", e?.stack || e?.message || e);
      if (e instanceof HttpException) throw e;
      throw e;
    }
  }
}
