import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import type { Request, Response } from 'express';
import { SignupDto } from './dto/signup.dto';
import { PasswordLoginDto } from './dto/password-login.dto';
import { UsernameDto } from './dto/username.dto';
import { DatabaseErrorFilter } from './filters/database-error.filter';
import { AuthOriginGuard } from './guards/origin.guard';
import { JsonBodyGuard } from './guards/json-body.guard';
import { JwtGuard } from './jwt/jwt.guard';
import { extractToken } from './jwt/jwt-token';
import { SESSION_LIFETIME_MS } from './sessions/sessions.service';
import type { AuthenticatedRequest } from './jwt/jwt.dto';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
};

const bodyValidation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('auth')
@UseFilters(DatabaseErrorFilter)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthOriginGuard, JsonBodyGuard, ThrottlerGuard)
  async login(@Body('code') code: unknown, @Res({ passthrough: true }) res: Response) {
    if (typeof code !== 'string' || code.trim().length === 0) {
      throw new BadRequestException('Google authorization code is required');
    }

    return this.startSession(res, await this.authService.login(code));
  }

  @Post('signup')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthOriginGuard, JsonBodyGuard, ThrottlerGuard)
  @UsePipes(bodyValidation)
  async signup(@Body() data: SignupDto, @Res({ passthrough: true }) res: Response) {
    return this.startSession(res, await this.authService.signup(data));
  }

  @Post('password/login')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @UseGuards(AuthOriginGuard, JsonBodyGuard, ThrottlerGuard)
  @UsePipes(bodyValidation)
  async passwordLogin(
    @Body() data: PasswordLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.startSession(res, await this.authService.passwordLogin(data));
  }

  @Post('logout')
  @Header('Cache-Control', 'no-store')
  @HttpCode(204)
  @UseGuards(AuthOriginGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.authService.logout(extractToken(req));
    res.clearCookie('access_token', COOKIE_OPTIONS);
  }

  @UseGuards(JwtGuard)
  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@Req() req: AuthenticatedRequest) {
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated');
    }

    return this.authService.getCurrentUser(req.user.sub);
  }

  @Patch('me/username')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtGuard, AuthOriginGuard, JsonBodyGuard, ThrottlerGuard)
  @UsePipes(bodyValidation)
  setUsername(@Req() req: AuthenticatedRequest, @Body() data: UsernameDto) {
    if (!req.user) throw new UnauthorizedException('User not authenticated');
    return this.authService.setUsername(req.user.sub, data.username);
  }

  private startSession(res: Response, { message, token }: { message: string; token: string }) {
    res.cookie('access_token', token, { ...COOKIE_OPTIONS, maxAge: SESSION_LIFETIME_MS });
    return { message };
  }
}
