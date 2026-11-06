import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { UsernameDto } from './username.dto';

export class SignupDto extends UsernameDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsDefined()
  @IsString()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsDefined()
  @IsString()
  @Length(15, 128)
  password!: string;
}
