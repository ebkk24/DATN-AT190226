import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional,
  IsString, IsUUID, Length, Matches, Max, Min, ValidateNested,
} from 'class-validator';
import { Transform, TransformFnParams, Type } from 'class-transformer';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export const EDUCATION_LEVELS = ['Đại học', 'Thạc sĩ', 'Tiến sĩ'] as const;
export const GRADUATION_RANKS = ['Xuất sắc', 'Giỏi', 'Khá', 'Trung bình'] as const;
export const TRAINING_MODES = ['Chính quy', 'Vừa làm vừa học', 'Đào tạo từ xa'] as const;
export const MAJORS = ['An Toàn Thông Tin'] as const;

export class IssueRequestDto {
  @Transform(upper) @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9._-]{1,49}$/, { message: 'studentCode chỉ gồm 2-50 ký tự chữ, số, dấu chấm, gạch dưới hoặc gạch ngang' })
  studentCode: string;

  @Transform(trim) @IsString() @Matches(/^[mn2][1-9A-HJ-NP-Za-km-z]{25,34}$/, { message: 'pubkey phải là địa chỉ P2PKH hợp lệ trên regtest' })
  pubkey: string;

  @Transform(trim) @IsString() @Length(2, 255)
  degreeName: string;

  @Transform(trim) @IsIn(MAJORS)
  major: string;

  @Transform(trim) @IsIn(EDUCATION_LEVELS)
  educationLevel: string;

  @Transform(trim) @IsIn(GRADUATION_RANKS)
  graduationRank: string;

  @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  graduationYear: number;

  @Transform(trim) @IsDateString({ strict: true }, { message: 'issueDate phải là ngày ISO hợp lệ dạng YYYY-MM-DD' })
  issueDate: string;

  @Transform(upper) @IsString() @Length(2, 100)
  @Matches(/^[A-Z0-9À-Ỹ._\/-]+(?: [A-Z0-9À-Ỹ._\/-]+)*$/u, { message: 'diplomaNumber có ký tự không hợp lệ' })
  diplomaNumber: string;

  @Transform(trim) @IsIn(TRAINING_MODES)
  trainingMode: string;

  @IsOptional() @Transform(trim) @IsString() identity?: string;
}

export class BatchIssueRequestDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => IssueRequestDto)
  recipients: IssueRequestDto[];
}
export class BatchApproveDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('4', { each: true }) ids: string[];
}
export class ApproveDto {}
export class RejectDto { @IsOptional() @Transform(trim) @IsString() reason?: string; }
