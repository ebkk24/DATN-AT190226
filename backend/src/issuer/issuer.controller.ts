import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IssuerService } from './issuer.service';

@ApiTags('Blockcerts issuer')
@Controller('api/blockcerts/issuers/kma')
export class IssuerController {
  constructor(private readonly issuer: IssuerService) {}

  @Get('profile.json')
  @Header('Cache-Control', 'public, max-age=300')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Hồ sơ công khai của đơn vị phát hành' })
  profile() {
    return this.issuer.profile();
  }

  @Get('revocation-list.json')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Danh sách văn bằng đã thu hồi' })
  revocationList() {
    return this.issuer.revocationList();
  }
}
