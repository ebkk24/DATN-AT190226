import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  ValidateIf,
  IsOptional,
  Length,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';

export class RegisterDto {
  @IsString()
  @Length(3, 64)
  username: string;

  @IsString()
  @Length(12, 128, { message: 'password phải có từ 12 đến 128 ký tự' })
  password: string;

  @IsIn(['maker', 'checker', 'student'])
  role: 'maker' | 'checker' | 'student';

  @ValidateIf((value: RegisterDto) => value.role === 'student')
  @IsString()
  @IsNotEmpty()
  recipientName?: string;

  @ValidateIf((value: RegisterDto) => value.role === 'student')
  @Transform((params: TransformFnParams): unknown => {
    const input: unknown = params.value;
    return typeof input === 'string' ? input.trim().toUpperCase() : input;
  })
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9._-]{1,49}$/, {
    message:
      'studentCode chỉ gồm 2-50 ký tự chữ, số, dấu chấm, gạch dưới hoặc gạch ngang',
  })
  studentCode?: string;

  @ValidateIf((value: RegisterDto) => value.role === 'student')
  @IsDateString({ strict: true }, { message: 'dateOfBirth phải là ngày ISO hợp lệ dạng YYYY-MM-DD' })
  dateOfBirth?: string;

  @ValidateIf((value: RegisterDto) => value.role === 'student')
  @IsEmail() @Length(3, 255)
  email?: string;

  @ValidateIf((value: RegisterDto) => value.role === 'student')
  @IsString() @Matches(/^\d{4} - \d{4}$/, { message: 'cohort phải có dạng 2022 - 2027' })
  cohort?: string;
}

export class UpdateStudentProfileDto {
  @IsOptional() @IsString() @IsNotEmpty() recipientName?: string;
  @IsOptional() @IsDateString({ strict: true }, { message: 'dateOfBirth phải là ngày ISO hợp lệ dạng YYYY-MM-DD' }) dateOfBirth?: string;
  @IsOptional() @IsEmail() @Length(3, 255) email?: string;
  @IsOptional() @IsString() @Matches(/^\d{4} - \d{4}$/) cohort?: string;
}

export class LoginDto {
  @IsString()
  @Length(3, 64)
  username: string;

  @IsString()
  @Length(1, 128)
  password: string;
}
