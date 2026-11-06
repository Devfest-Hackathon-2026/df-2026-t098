import type { Request } from 'express';

export interface JwtPayload {
  sub: string;
  sid: string;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}
