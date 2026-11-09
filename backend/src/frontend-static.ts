import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

const HASHED_ASSET = /-[A-Za-z0-9_-]{8}\.(?:js|css|woff2?)$/;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

export function frontendDirectory(
  value: string | undefined = process.env.FRONTEND_DIST,
): string | null {
  const configured = value?.trim();
  if (!configured) return null;
  const directory = resolve(configured);
  if (!existsSync(join(directory, 'index.html')))
    throw new Error(
      `FRONTEND_DIST must contain the built Angular app (no index.html in ${directory})`,
    );
  return directory;
}

export function cacheControlFor(pathInsideBuild: string): string {
  const topLevel =
    !pathInsideBuild.includes(sep) && !pathInsideBuild.includes('/');
  return topLevel && HASHED_ASSET.test(pathInsideBuild)
    ? IMMUTABLE
    : REVALIDATE;
}

export function isDocumentRequest(
  method: string,
  path: string,
  accept: string | undefined,
): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (path === '/api' || path.startsWith('/api/')) return false;
  const lastSegment = path.slice(path.lastIndexOf('/') + 1);
  if (/\.[A-Za-z0-9]+$/.test(lastSegment)) return false;
  return typeof accept === 'string' && accept.includes('text/html');
}

export function serveFrontend(
  app: NestExpressApplication,
  directory: string,
): void {
  if (!isAbsolute(directory))
    throw new Error('Frontend directory must be absolute');
  const indexFile = join(directory, 'index.html');
  app.useStaticAssets(directory, {
    index: false,
    setHeaders: (response: Response, filePath: string) => {
      response.setHeader(
        'Cache-Control',
        cacheControlFor(relative(directory, filePath)),
      );
    },
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (
      !isDocumentRequest(request.method, request.path, request.headers.accept)
    )
      return next();
    response.setHeader('Cache-Control', REVALIDATE);
    response.sendFile(indexFile, (error) => {
      if (error) next(error);
    });
  });
}
