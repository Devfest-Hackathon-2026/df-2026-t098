import { ArgumentsHost } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { DatabaseErrorFilter } from './database-error.filter';

describe('DatabaseErrorFilter', () => {
  it('returns a sanitized 503 without logging query details or parameters', () => {
    const sentinel = 'test-only-sensitive-hash-sentinel';
    const exception = new QueryFailedError(
      `INSERT INTO fixture VALUES ('${sentinel}')`,
      [sentinel],
      new Error(`fixture driver failure: ${sentinel}`),
    );
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;

    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const output: string[] = [];
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });

    try {
      new DatabaseErrorFilter().catch(exception, host);
      expect(response.status).toHaveBeenCalledWith(503);
      expect(response.json).toHaveBeenCalledWith({
        statusCode: 503,
        message: 'Database temporarily unavailable',
      });
      const captured = JSON.stringify({
        response: response.json.mock.calls,
        log: consoleLog.mock.calls,
        warn: consoleWarn.mock.calls,
        error: consoleError.mock.calls,
        output,
      });
      expect(captured).not.toContain(sentinel);
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
      consoleLog.mockRestore();
      consoleWarn.mockRestore();
      consoleError.mockRestore();
    }
  });
});
