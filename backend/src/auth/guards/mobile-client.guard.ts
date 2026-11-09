import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class MobileClientGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      request.headers.origin !== undefined ||
      request.headers.cookie !== undefined ||
      request.headers['sec-fetch-site'] !== undefined ||
      Object.keys(request.cookies ?? {}).length > 0
    ) {
      throw new ForbiddenException('Use browser authentication for browser requests');
    }
    return true;
  }
}
