import { Transform } from 'class-transformer';
import { IsDefined, IsString, Length, Matches } from 'class-validator';

export class UsernameDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsDefined()
  @IsString()
  @Length(3, 32)
  @Matches(/^[\p{L}\p{N}._-]+$/u)
  username!: string;
}
