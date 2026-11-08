import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

/** Build output names such as main-VXWMTSH3.js carry a content hash, so they never change. */
const HASHED_ASSET = /-[A-Za-z0-9_-]{8}\.(?:js|css|woff2?)$/;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

/**
 * Where the built Angular app lives, from FRONTEND_DIST. Unset means the API runs alone
 * (local development serves the app with `ng serve`). A set but wrong path throws so a
 * broken image cannot start and serve 404s for every page.
 */
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

/** Hashed files at the top of the build are cached for a year; everything else revalidates. */
export function cacheControlFor(pathInsideBuild: string): string {
  const topLevel =
    !pathInsideBuild.includes(sep) && !pathInsideBuild.includes('/');
  return topLevel && HASHED_ASSET.test(pathInsideBuild)
    ? IMMUTABLE
    : REVALIDATE;
}

/**
 * True for a browser navigation that the Angular router should answer: a GET/HEAD that
 * accepts HTML, is not under /api, and does not name a file. A missing script or image
 * stays a 404 instead of becoming index.html.
 */
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

/**
 * Serves the Angular build from the API's own origin. The session cookie is SameSite=Lax and
 * the app calls a relative /api, so the page and the API must share an origin.
 */
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
