import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { webOrigin } from '../allowed-origins';
import type { AuthenticatedRequest } from '../jwt/jwt.dto';

@Injectable()
export class AuthOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const origin = request.headers.origin;
    const expectedOrigin = webOrigin();
    if (!expectedOrigin) throw new ForbiddenException('Request origin is not allowed');

    if (origin === undefined && isBearerOnlyLogout(request)) return true;
    // The JWT guard has already verified the bearer session.
    if (
      origin === undefined && request.user && request.headers.cookie === undefined &&
      Object.keys(request.cookies ?? {}).length === 0 &&
      /^Bearer[ \t]+[^\s]+$/i.test(request.headers.authorization ?? '')
    ) return true;

    if (origin !== expectedOrigin) {
      throw new ForbiddenException('Request origin is not allowed');
    }

    return true;
  }
}

function isBearerOnlyLogout(request: Request): boolean {
  const authorization = request.headers.authorization;
  const rawCookie = request.headers.cookie;
  const hasParsedAccessCookie =
    request.cookies !== null &&
    typeof request.cookies === 'object' &&
    Object.prototype.hasOwnProperty.call(request.cookies, 'access_token');
  const hasRawAccessCookie =
    typeof rawCookie === 'string' && /(?:^|;)\s*access_token(?:\s*=|\s*;|\s*$)/.test(rawCookie);

  return (
    request.method === 'POST' &&
    typeof request.path === 'string' &&
    /(?:^|\/)auth\/logout\/?$/.test(request.path) &&
    typeof authorization === 'string' &&
    /^Bearer\s+\S+$/i.test(authorization) &&
    !hasParsedAccessCookie &&
    !hasRawAccessCookie
  );
}
