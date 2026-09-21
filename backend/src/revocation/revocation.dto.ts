import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CheckRevocationDto {
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Za-z0-9:._-]+$/)
  certUid: string;
}

export class RevokeDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
