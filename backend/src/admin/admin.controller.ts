import { Controller, Get, Post, Body, UseGuards, Req } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles, RolesGuard } from "../auth/roles.guard";
import type { Request } from "express";
import { AdminService } from "./admin.service";
import { RegisterDto } from "../auth/auth.dto";

type AuthUser = { userId: string; username: string; role: string };

@Controller("api/admin")
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  // Chi Checker (hoac admin tong the) moi quan ly nguoi dung
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("checker")
  @Get("users")
  list() {
    return this.svc.list();
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("checker")
  @Post("users")
  create(@Body() dto: RegisterDto, @Req() req: Request) {
    const user = req.user as AuthUser;
    return this.svc.create(dto, user.username);
  }
}
