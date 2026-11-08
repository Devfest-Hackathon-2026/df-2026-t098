import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

const PROBE_TIMEOUT_MS = 2_000;
const RESULT_TTL_MS = 2_000;

/**
 * Probes for the load balancer and uptime checks. They are public, so they return a fixed
 * body and never include configuration or error text.
 *
 *   GET /api/v1/health        the process is up (no database access)
 *   GET /api/v1/health/ready  the database answers; 503 otherwise
 */
@Controller('health')
export class HealthController {
  private checkedAt = 0;
  private lastReachable = false;
  private pending: Promise<boolean> | null = null;

  constructor(private readonly database: DataSource) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    if (!(await this.databaseReachable()))
      throw new ServiceUnavailableException({ status: 'unavailable' });
    return { status: 'ok' };
  }

  /** Shares one probe between concurrent callers and remembers the answer briefly. */
  private databaseReachable(): Promise<boolean> {
    if (Date.now() - this.checkedAt < RESULT_TTL_MS)
      return Promise.resolve(this.lastReachable);
    this.pending ??= this.probe().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async probe(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.database.query('SELECT 1'),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Database probe timed out')),
            PROBE_TIMEOUT_MS,
          );
        }),
      ]);
      this.lastReachable = true;
    } catch {
      this.lastReachable = false;
    } finally {
      clearTimeout(timer);
      this.checkedAt = Date.now();
    }
    return this.lastReachable;
  }
}
