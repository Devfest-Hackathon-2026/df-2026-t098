import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../auth/jwt/jwt.dto';
import { extractToken, verifyToken } from '../auth/jwt/jwt-token';
import { SessionsService } from '../auth/sessions/sessions.service';

@Injectable()
export class OptionalLearningAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractToken(request);
    if (token) {
      const claims = await verifyToken(this.jwt, token);
      if (claims && (await this.sessions.isActive(claims.sid, claims.sub)))
        request.user = claims;
    }
    return true;
  }
}

@Injectable()
export class LearningThrottleGuard extends ThrottlerGuard {
  protected async getTracker(request: Record<string, any>): Promise<string> {
    return request.user?.sub
      ? `learner:${request.user.sub}`
      : super.getTracker(request);
  }
}
