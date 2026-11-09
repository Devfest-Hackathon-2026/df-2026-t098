import {
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IsDefined, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { PasswordLoginDto } from './dto/password-login.dto';
import { DatabaseErrorFilter } from './filters/database-error.filter';
import { JsonBodyGuard } from './guards/json-body.guard';
import { MobileClientGuard } from './guards/mobile-client.guard';

class GoogleIdentityDto {
  @IsDefined()
  @IsString()
  @MinLength(1)
  @MaxLength(16384)
  idToken!: string;
}

@Controller('auth/mobile')
@UseFilters(DatabaseErrorFilter)
@UseGuards(MobileClientGuard, JsonBodyGuard, ThrottlerGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class MobileAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @Header('Cache-Control', 'no-store')
  signup(@Body() data: SignupDto) {
    return this.auth.signup(data);
  }

  @Post('password/login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  login(@Body() data: PasswordLoginDto) {
    return this.auth.passwordLogin(data);
  }

  @Post('google')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  google(@Body() data: GoogleIdentityDto) {
    return this.auth.mobileGoogleLogin(data.idToken);
  }
}
