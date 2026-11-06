import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppController } from './app.controller';

describe('AppController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 404 for the unregistered root route', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(404);
    expect(response.body.message).toBe('Cannot GET /');
  });
});
