import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { IssuanceService } from './issuance.service';
import {
  ApproveDto,
  BatchApproveDto,
  BatchIssueRequestDto,
  IssueRequestDto,
  RejectDto,
} from './issue.dto';

class AuthUser {
  userId: string;
  username: string;
  role: string;
  recipientName?: string | null;
}

@Controller('api/issue')
export class IssuanceController {
  constructor(private readonly svc: IssuanceService) {}

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('maker')
  @Post('request')
  request(@Body() dto: IssueRequestDto, @Req() req: Request) {
    const u = req.user as AuthUser;
    return this.svc.request(dto, u.username);
  }

  // Route tĩnh batch phải đặt trước các route :id.
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('maker')
  @Post('batch/request')
  requestBatch(@Body() dto: BatchIssueRequestDto, @Req() req: Request) {
    const u = req.user as AuthUser;
    return this.svc.requestBatch(dto.recipients, u.username);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('checker')
  @Post('batch/approve')
  approveBatch(@Body() dto: BatchApproveDto, @Req() req: Request) {
    const u = req.user as AuthUser;
    return this.svc.approveBatch(dto, u.username);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('checker')
  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveDto,
    @Req() req: Request,
  ) {
    const u = req.user as AuthUser;
    return this.svc.approve(id, dto, u.username);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('checker')
  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectDto, @Req() req: Request) {
    const u = req.user as AuthUser;
    return this.svc.reject(id, dto, u.username);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('student')
  @Get('holder/certificates')
  holderCerts(@Req() req: Request) {
    const u = req.user as AuthUser;
    return this.svc.holderCertificates(u.recipientName || '');
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('maker', 'checker')
  @Get(':id')
  status(@Param('id') id: string) {
    return this.svc.getStatus(id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('maker', 'checker')
  @Get()
  list(@Query('status') status?: string, @Query('batchId') batchId?: string) {
    return this.svc.list(status, batchId);
  }
}
