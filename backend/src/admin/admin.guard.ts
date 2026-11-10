import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt/jwt.dto';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const allowed = (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean);
    if (!request.user || !allowed.includes(request.user.sub.toLowerCase()))
      throw new ForbiddenException('Admin access required');
    return true;
  }
}
