import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

const serverOf = (application: { getHttpServer(): unknown }): Server =>
  application.getHttpServer() as Server;

async function appWith(query: jest.Mock) {
  const module = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: DataSource, useValue: { query } }],
  }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();
  return app;
}

describe('HealthController', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    await app?.close();
    app = undefined;
  });

  it('reports liveness without touching the database', async () => {
    const query = jest.fn();
    app = await appWith(query);
    const response = await request(serverOf(app))
      .get('/api/v1/health')
      .expect(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(query).not.toHaveBeenCalled();
  });

  it('reports readiness when the database answers', async () => {
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    app = await appWith(query);
    const response = await request(serverOf(app))
      .get('/api/v1/health/ready')
      .expect(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns 503 without error details when the database fails', async () => {
    const query = jest
      .fn()
      .mockRejectedValue(new Error('password authentication failed for user'));
    app = await appWith(query);
    const response = await request(serverOf(app))
      .get('/api/v1/health/ready')
      .expect(503);
    expect(response.body).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(response.body)).not.toContain('password');
  });

  it('shares the database probe between repeated requests', async () => {
    const query = jest.fn().mockResolvedValue([]);
    app = await appWith(query);
    const server = serverOf(app);
    await Promise.all([
      request(server).get('/api/v1/health/ready').expect(200),
      request(server).get('/api/v1/health/ready').expect(200),
      request(server).get('/api/v1/health/ready').expect(200),
    ]);
    await request(server).get('/api/v1/health/ready').expect(200);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('probes again after the cached answer expires and recovers', async () => {
    const query = jest
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue([]);
    app = await appWith(query);
    const server = serverOf(app);
    await request(server).get('/api/v1/health/ready').expect(503);
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 3_000);
    await request(server).get('/api/v1/health/ready').expect(200);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('treats a database that never answers as unavailable', async () => {
    jest.useFakeTimers();
    const controller = new HealthController({
      query: () => new Promise(() => undefined),
    } as unknown as DataSource);
    const outcome = controller.ready().then(
      () => 'ready',
      (error: { getStatus(): number }) => error.getStatus(),
    );
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(outcome).resolves.toBe(503);
  });
});
