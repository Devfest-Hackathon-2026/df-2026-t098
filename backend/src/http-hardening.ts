import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Reject prototype keys before the parsed body reaches the API.
export function rejectPollutionKeys(key: string, value: unknown): unknown {
  if (FORBIDDEN_KEYS.has(key)) throw new SyntaxError('Forbidden JSON key');
  return value;
}

/**
 * The page's Content Security Policy, sent with the Angular shell and every API response.
 *
 * Scripts: only our own bundle. The production build no longer inlines critical CSS (that
 * added an inline loader script), so no 'unsafe-inline' or nonce is needed for scripts.
 * Styles: Angular injects component styles at runtime, which needs 'unsafe-inline' for
 * style-src; that cannot run script. Fonts come from Google Fonts; avatars from Google.
 * Sign-in with Google is a top-level redirect, so it needs no frame or connect allowance.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://*.googleusercontent.com",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

export function securityHeaders(
  _request: Request,
  response: Response,
  next: NextFunction,
) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  response.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
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
