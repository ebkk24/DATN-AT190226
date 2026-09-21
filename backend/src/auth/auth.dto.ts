import {
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';

export class RegisterDto {
  @IsString()
  username: string;

  @IsString()
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
}

export class LoginDto {
  @IsString()
  username: string;

  @IsString()
  password: string;
}
