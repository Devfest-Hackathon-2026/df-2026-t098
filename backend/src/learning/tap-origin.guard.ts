import { ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthOriginGuard } from '../auth/guards/origin.guard';

@Injectable()
export class TapOriginGuard extends AuthOriginGuard {
  override canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      request.headers.origin === undefined &&
      request.headers.cookie === undefined &&
      request.headers.authorization === undefined &&
      request.headers['sec-fetch-site'] === undefined &&
      Object.keys(request.cookies ?? {}).length === 0
    ) return true;
    return super.canActivate(context);
  }
}
