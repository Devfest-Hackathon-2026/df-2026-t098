import { Transform } from 'class-transformer';
import { IsDefined, IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

export class PasswordLoginDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  identifier!: string;

  @IsDefined()
  @IsString()
  @Length(1, 128)
  password!: string;
}
