import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { JwtPayload } from './jwt.dto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function extractToken(request: Request): string | undefined {
  const cookie = request.cookies?.['access_token'];
  if (typeof cookie === 'string' && cookie) return cookie;

  const header = request.headers.authorization;
  return header?.match(/^Bearer[ \t]+([^\s]+)$/i)?.[1];
}

export async function verifyToken(
  jwtService: JwtService,
  token: string,
): Promise<JwtPayload | null> {
  try {
    const payload: unknown = await jwtService.verifyAsync(token, { algorithms: ['HS256'] });
    if (!payload || typeof payload !== 'object') return null;
    const claims = payload as Record<string, unknown>;
    if (
      typeof claims['sub'] !== 'string' ||
      !UUID_PATTERN.test(claims['sub']) ||
      typeof claims['sid'] !== 'string' ||
      !UUID_PATTERN.test(claims['sid']) ||
      typeof claims['exp'] !== 'number' ||
      !Number.isFinite(claims['exp'])
    ) {
      return null;
    }
    return claims as unknown as JwtPayload;
  } catch {
    return null;
  }
}
