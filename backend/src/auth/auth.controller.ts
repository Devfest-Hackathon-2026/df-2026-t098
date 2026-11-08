import {
  BadRequestException,
  ForbiddenException,
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
import { isNativeAppOrigin, webOrigin } from './allowed-origins';
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
  async login(
    @Body('code') code: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (typeof code !== 'string' || code.trim().length === 0) {
      throw new BadRequestException('Google authorization code is required');
    }

    return this.startSession(req, res, await this.authService.login(code));
  }

  @Post('google/native')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @UseGuards(AuthOriginGuard, JsonBodyGuard, ThrottlerGuard)
  async nativeGoogleLogin(
    @Body('idToken') idToken: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (req.headers.origin === webOrigin() || !isNativeAppOrigin(req.headers.origin)) {
      throw new ForbiddenException('Request origin is not allowed');
    }
    if (typeof idToken !== 'string' || !idToken.trim() || idToken.length > 16384) {
      throw new BadRequestException('Google ID token is required');
    }
    return this.startSession(req, res, await this.authService.loginNative(idToken));
  }

  @Post('signup')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthOriginGuard, JsonBodyGuard, ThrottlerGuard)
  @UsePipes(bodyValidation)
  async signup(
    @Body() data: SignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.startSession(req, res, await this.authService.signup(data));
  }

  @Post('password/login')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @UseGuards(AuthOriginGuard, JsonBodyGuard, ThrottlerGuard)
  @UsePipes(bodyValidation)
  async passwordLogin(
    @Body() data: PasswordLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.startSession(req, res, await this.authService.passwordLogin(data));
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

  /**
   * Web: the session is an HttpOnly cookie that scripts never read. A native shell (an origin listed
   * in NATIVE_APP_ORIGINS) is cross-origin, so a SameSite cookie does not follow its requests; it
   * receives the token in the body, keeps it in the platform keystore, and sends it as a Bearer
   * header. The web origin never receives the token in the body.
   */
  private startSession(
    req: Request,
    res: Response,
    result: { message: string; token: string },
  ): { message: string; token?: string } {
    const origin = req.headers?.origin;
    if (origin !== webOrigin() && isNativeAppOrigin(origin))
      return { message: result.message, token: result.token };
    this.setAuthCookie(res, result.token);
    return { message: result.message };
  }

  private setAuthCookie(res: Response, token: string): void {
    res.cookie('access_token', token, { ...COOKIE_OPTIONS, maxAge: SESSION_LIFETIME_MS });
  }
}
