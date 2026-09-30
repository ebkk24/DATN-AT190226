import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { VerificationService } from './verification.service';
import { VerifyCertificateDto } from './dto/verify-certificate.dto';

@Controller('api/verify')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  // Trạng thái nghiệp vụ nằm trong body; endpoint xử lý thành công luôn trả HTTP 200.
  @Post()
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifyCertificateDto) {
    return this.verification.verify(dto);
  }
}
