import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppController } from '../src/app.controller';

describe('Application routes (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 404 for the unregistered root route', async () => {
    await request(app.getHttpServer()).get('/').expect(404);
  });

  it('returns 404 for an unregistered API route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/not-registered').expect(404);
    expect(response.body.message).toBe('Cannot GET /api/v1/not-registered');
  });
});
