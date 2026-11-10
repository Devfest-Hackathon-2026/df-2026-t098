import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Reject prototype keys before the parsed body reaches the API.
export function rejectPollutionKeys(key: string, value: unknown): unknown {
  if (FORBIDDEN_KEYS.has(key)) throw new SyntaxError('Forbidden JSON key');
  return value;
}

export function securityHeaders(
  _request: Request,
  response: Response,
  next: NextFunction,
) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader(
    'Content-Security-Policy',
    "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
  );
  response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (process.env.NODE_ENV === 'production')
    response.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  next();
}

export function trustProxy(value = process.env.TRUST_PROXY): number | false {
  const hops = Number(value);
  return Number.isInteger(hops) && hops > 0 && hops < 10 ? hops : false;
}

export function hardenHttp(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  const hops = trustProxy();
  if (hops) app.set('trust proxy', hops);
  app.useBodyParser('json', { limit: '100kb', reviver: rejectPollutionKeys });
  app.use(securityHeaders);
}
