import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  Matches,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class IssueRequestDto {
  @IsString()
  recipientName: string;

  @IsString()
  @Matches(/^[mn2][1-9A-HJ-NP-Za-km-z]{25,34}$/, {
    message: 'pubkey phải là địa chỉ P2PKH hợp lệ trên regtest',
  })
  pubkey: string;

  @IsOptional()
  @IsString()
  identity?: string;
}

export class BatchIssueRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => IssueRequestDto)
  recipients: IssueRequestDto[];
}

export class BatchApproveDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  ids: string[];
}

export class ApproveDto {
  // approvedBy lấy từ JWT.
}

export class RejectDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
