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
import { Transform, TransformFnParams, Type } from 'class-transformer';

export class IssueRequestDto {
  @Transform((params: TransformFnParams): unknown => {
    const input: unknown = params.value;
    return typeof input === 'string' ? input.trim().toUpperCase() : input;
  })
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9._-]{1,49}$/, {
    message:
      'studentCode chỉ gồm 2-50 ký tự chữ, số, dấu chấm, gạch dưới hoặc gạch ngang',
  })
  studentCode: string;

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
