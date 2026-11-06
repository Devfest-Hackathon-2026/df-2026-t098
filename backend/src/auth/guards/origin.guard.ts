import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class AuthOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    let expectedOrigin: string;

    try {
      const configuredUrl = new URL(process.env.FRONTEND_URL ?? '');
      if (
        configuredUrl.protocol !== 'http:' &&
        configuredUrl.protocol !== 'https:'
      ) {
        throw new Error('Invalid frontend URL');
      }
      expectedOrigin = configuredUrl.origin;
    } catch {
      throw new ForbiddenException('Request origin is not allowed');
    }

    if (origin === undefined && isBearerOnlyLogout(request)) return true;

    if (typeof origin !== 'string' || origin !== expectedOrigin) {
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
    typeof rawCookie === 'string' &&
    /(?:^|;)\s*access_token(?:\s*=|\s*;|\s*$)/.test(rawCookie);

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
