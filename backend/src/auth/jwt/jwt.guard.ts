import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedRequest } from './jwt.dto';
import { extractToken, verifyToken } from './jwt-token';
import { SessionsService } from '../sessions/sessions.service';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly sessionsService: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token Invalid');
    }

    const payload = await verifyToken(this.jwtService, token);
    if (!payload || !(await this.sessionsService.isActive(payload.sid, payload.sub))) {
      throw new UnauthorizedException('Token Invalid');
    }

    request.user = payload;
    return true;
  }
}
