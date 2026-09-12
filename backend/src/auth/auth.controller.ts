import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { RegisterDto, LoginDto } from "./auth.dto";
import { Roles, RolesGuard } from "./roles.guard";
import type { Request } from "express";

@Controller("api/auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  // Không cho đăng ký công khai; chỉ Checker được tạo tài khoản.
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("checker")
  @Post("register")
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    const user = req.user as { username: string };
    return this.auth.register(dto, user.username);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
}
