import { Body, Controller, Post } from "@nestjs/common";
import { VerificationService } from "./verification.service";
import { VerifyCertificateDto } from "./dto/verify-certificate.dto";

@Controller("api/verify")
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Post()
  async verify(@Body() dto: VerifyCertificateDto) {
    const result = await this.verification.verify(dto);
    const httpStatus =
      result.status === "VALID" ? 200 :
      result.status === "INDETERMINATE" ? 200 : 422;
    return result;
  }
}
