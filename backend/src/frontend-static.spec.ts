import type { Server } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  cacheControlFor,
  frontendDirectory,
  isDocumentRequest,
  serveFrontend,
} from './frontend-static';
import { HealthController } from './health.controller';

const serverOf = (application: { getHttpServer(): unknown }): Server =>
  application.getHttpServer() as Server;

const HTML = 'text/html';

describe('frontendDirectory', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'whylint-site-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('is off when FRONTEND_DIST is not set, so local development is unchanged', () => {
    expect(frontendDirectory(undefined)).toBeNull();
    expect(frontendDirectory('')).toBeNull();
    expect(frontendDirectory('   ')).toBeNull();
  });

  it('fails fast when the directory has no built app', () => {
    expect(() => frontendDirectory(root)).toThrow('FRONTEND_DIST must contain');
    expect(() => frontendDirectory(join(root, 'missing'))).toThrow(
      'FRONTEND_DIST must contain',
    );
  });

  it('returns the absolute directory when index.html exists', () => {
    writeFileSync(join(root, 'index.html'), '<app-root></app-root>');
    expect(frontendDirectory(root)).toBe(root);
  });
});

describe('cacheControlFor', () => {
  it('caches content-hashed build files for a year', () => {
    for (const name of [
      'main-VXWMTSH3.js',
      'styles-QRSMI67T.css',
      'chunk-DNNLTKm-.js',
      'chunk-DoXM_N54.js',
    ])
      expect(cacheControlFor(name)).toContain('immutable');
  });

  it('revalidates files whose names can be reused', () => {
    for (const name of [
      'index.html',
      'favicon.ico',
      'main.js',
      'media/logo-ABCDEFGH.js',
      'robots.txt',
    ])
      expect(cacheControlFor(name)).toBe('no-cache');
  });
});

describe('isDocumentRequest', () => {
  it.each([
    ['GET', '/', HTML, true],
    ['GET', '/login', 'text/html,application/xhtml+xml,*/*;q=0.8', true],
    ['HEAD', '/questions/abc', HTML, true],
    ['GET', '/login', undefined, false],
    ['GET', '/login', 'application/json', false],
    ['GET', '/login', '*/*', false],
    ['POST', '/login', HTML, false],
    ['GET', '/api', HTML, false],
    ['GET', '/api/v1/learning/daily', HTML, false],
    ['GET', '/main-ABCD1234.js', HTML, false],
    ['GET', '/assets/logo.png', HTML, false],
    ['GET', '/api-docs', HTML, true],
  ])('%s %s accept=%s -> %s', (method, path, accept, expected) => {
    expect(isDocumentRequest(method, path, accept)).toBe(expected);
  });
});

describe('serveFrontend', () => {
  let root: string;
  let app: NestExpressApplication;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'whylint-site-'));
    const site = join(root, 'site');
    mkdirSync(site);
    writeFileSync(join(site, 'index.html'), '<app-root>whylint</app-root>');
    writeFileSync(join(site, 'main-ABCD1234.js'), 'console.log("app")');
    writeFileSync(join(site, 'favicon.ico'), 'icon');
    writeFileSync(join(root, 'secret.txt'), 'outside the site');

    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DataSource, useValue: { query: jest.fn() } }],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api/v1');
    serveFrontend(app, site);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('serves index.html at the root and revalidates it', async () => {
    const response = await request(serverOf(app))
      .get('/')
      .set('Accept', HTML)
      .expect(200);
    expect(response.text).toContain('<app-root>');
    expect(response.headers['content-type']).toContain(HTML);
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('lets the Angular router answer deep links', async () => {
    const response = await request(serverOf(app))
      .get('/login')
      .set('Accept', HTML)
      .expect(200);
    expect(response.text).toContain('<app-root>');
  });

  it('serves hashed files as immutable with the right type', async () => {
    const response = await request(serverOf(app))
      .get('/main-ABCD1234.js')
      .expect(200);
    expect(response.headers['cache-control']).toContain('immutable');
    expect(response.headers['content-type']).toContain('javascript');
  });

  it('revalidates unhashed files such as the favicon', async () => {
    const response = await request(serverOf(app))
      .get('/favicon.ico')
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('keeps a missing file a 404 instead of returning the app shell', async () => {
    const response = await request(serverOf(app))
      .get('/chunk-MISSING1.js')
      .set('Accept', HTML)
      .expect(404);
    expect(response.text).not.toContain('<app-root>');
  });

  it('does not answer non-navigation requests with the app shell', async () => {
    await request(serverOf(app)).get('/login').expect(404);
    await request(serverOf(app)).post('/login').set('Accept', HTML).expect(404);
  });

  it('leaves /api to the API, including its 404s', async () => {
    const health = await request(serverOf(app))
      .get('/api/v1/health')
      .set('Accept', HTML)
      .expect(200);
    expect(health.body).toEqual({ status: 'ok' });
    const missing = await request(serverOf(app))
      .get('/api/v1/unknown')
      .set('Accept', HTML)
      .expect(404);
    expect(missing.text).not.toContain('<app-root>');
  });

  it('does not serve files from outside the build directory', async () => {
    for (const path of ['/%2e%2e/secret.txt', '/..%2fsecret.txt']) {
      const response = await request(serverOf(app)).get(path);
      expect(response.text).not.toContain('outside the site');
    }
  });
});
