import { IsString, IsIn, IsOptional } from "class-validator";

export class RegisterDto {
  @IsString()
  username: string;

  @IsString()
  password: string;

  @IsIn(["maker", "checker", "student"])
  role: "maker" | "checker" | "student";

  // Chi can cho student: ten trung voi recipientName cua chung thu
  @IsOptional()
  @IsString()
  recipientName?: string;
}

export class LoginDto {
  @IsString()
  username: string;

  @IsString()
  password: string;
}
