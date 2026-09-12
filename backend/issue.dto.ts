import { IsString, IsOptional } from "class-validator";

export class IssueCertificateDto {
  @IsString()
  recipientName: string;

  @IsString()
  pubkey: string; // ví dụ: ecdsa-koblitz-pubkey:bcrt1...

  @IsOptional()
  @IsString()
  identity?: string;
}
