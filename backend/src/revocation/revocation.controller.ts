import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { CheckRevocationDto, RevokeDto } from './revocation.dto';
import { RevocationService } from './revocation.service';

type AuthUser = { userId: string; username: string; role: string };

@Controller('api/revoke')
export class RevocationController {
  constructor(private readonly svc: RevocationService) {}

  // Tra cứu công khai theo certUid; route tĩnh phải đứng trước :id.
  @Post('check')
  check(@Body() dto: CheckRevocationDto) {
    return this.svc.isRevoked(dto.certUid);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('checker')
  @Post(':id')
  async revoke(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RevokeDto,
    @Req() req: Request,
  ) {
    const user = req.user as AuthUser;
    return this.svc.revoke(id, dto.reason || '', user.username);
  }
}
