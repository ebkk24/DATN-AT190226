import { IsObject, IsNotEmpty } from "class-validator";

/**
 * Du lieu dau vao: ca obj JSON cua chung thu Blockcerts.
 * Chung ta khong buoc truong nao cu the vi cau truc chung thu co the thay doi.
 */
export class VerifyCertificateDto {
  @IsObject()
  @IsNotEmpty()
  certificate: Record<string, any>;
}
