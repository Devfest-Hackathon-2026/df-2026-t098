import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
/** 32 random bytes in base64url: exactly 43 URL-safe characters. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export class EmailTokenDto {
  @IsDefined()
  @IsString()
  @Matches(TOKEN)
  token!: string;
}

export class ForgotPasswordDto {
  @Transform(trim)
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  identifier!: string;
}

export class ResetPasswordDto {
  @IsDefined()
  @IsString()
  @Matches(TOKEN)
  token!: string;

  @IsDefined()
  @IsString()
  @Length(15, 128)
  password!: string;
}
