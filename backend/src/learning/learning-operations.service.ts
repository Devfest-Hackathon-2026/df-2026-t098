import { ConflictException, HttpException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { learningDay } from './learning-calendar';

interface Operation {
  id: string;
  user_id: string;
  kind: string;
  fingerprint: string;
  status: string;
  lease: string;
  expires_at: Date;
  result: unknown;
}

export interface OperationClaim {
  id: string;
  lease: string;
  replay: unknown | null;
}

@Injectable()
export class LearningOperationsService {
  constructor(private readonly database: DataSource) {}

  async claim(
    userId: string,
    id: string,
    kind: 'feed' | 'attempt' | 'publish' | 'followup',
    payload: unknown,
    questionId?: string,
  ): Promise<OperationClaim> {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    return this.database.transaction(async (manager) => {
      // Release the lock before calling Gemini.
      await manager.query('SELECT pg_advisory_xact_lock(1101,hashtext($1))', [
        id,
      ]);
      await manager.query('SELECT pg_advisory_xact_lock(1102,hashtext($1))', [
        userId,
      ]);
      const [existing]: Operation[] = await manager.query(
        'SELECT * FROM learning_operations WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (existing) {
        if (
          existing.user_id !== userId ||
          existing.kind !== kind ||
          existing.fingerprint !== fingerprint
        ) {
          throw new ConflictException({
            code: 'REQUEST_MISMATCH',
            message: 'Use a new request ID for different input',
          });
        }
        if (existing.status === 'complete')
          return { id, lease: existing.lease, replay: existing.result };
        if (
          existing.status === 'pending' &&
          existing.expires_at.getTime() > Date.now()
        )
          this.pending();
      }

      const [inFlight] = await manager.query(
        `SELECT count(*)::int AS count FROM learning_operations
        WHERE user_id = $1 AND kind = $2 AND status = 'pending' AND expires_at > now()
        AND ($3::uuid IS NULL OR scope_id = $3) AND id <> $4`,
        [userId, kind, questionId ?? null, id],
      );
      if (inFlight.count > 0) this.pending();

      if (kind === 'attempt') {
        const [attempts] = await manager.query(
          `SELECT count(*)::int AS count FROM learning_attempts
          WHERE user_id = $1 AND question_id = $2 AND day = $3`,
          [userId, questionId, learningDay()],
        );
        if (attempts.count >= 5)
          throw new HttpException(
            {
              code: 'ATTEMPT_LIMIT',
              message: 'Try this question again tomorrow',
            },
            429,
          );
      }
      if (kind === 'followup') {
        const [asked] = await manager.query(
          `SELECT count(*)::int AS count FROM learning_operations
          WHERE user_id = $1 AND kind = 'followup' AND scope_id = $2 AND status = 'complete'
          AND created_at > now() - interval '1 day'`,
          [userId, questionId],
        );
        if (asked.count >= 5)
          throw new HttpException(
            {
              code: 'FOLLOW_UP_LIMIT',
              message: 'Ask more about this question tomorrow',
            },
            429,
          );
      }
      const [recent] = await manager.query(
        `SELECT coalesce(sum(call_count),0)::int AS count FROM learning_operations
        WHERE user_id = $1 AND kind = $2 AND called_at > now() - interval '1 minute'`,
        [userId, kind],
      );
      if (recent.count >= 10)
        throw new HttpException(
          { code: 'RATE_LIMIT', message: 'Please wait before trying again' },
          429,
        );

      const lease = randomUUID();
      await manager.query(
        `INSERT INTO learning_operations (id,user_id,kind,scope_id,fingerprint,status,lease,expires_at)
        VALUES ($1,$2,$3,$4,$5,'pending',$6,now() + interval '2 minutes')
        ON CONFLICT (id) DO UPDATE SET status = 'pending', lease = EXCLUDED.lease,
          call_count = CASE WHEN learning_operations.called_at > now() - interval '1 minute'
            THEN learning_operations.call_count + 1 ELSE 1 END,
          called_at = now(), expires_at = EXCLUDED.expires_at`,
        [id, userId, kind, questionId ?? null, fingerprint, lease],
      );
      return { id, lease, replay: null };
    });
  }

  async assertLease(
    manager: EntityManager,
    claim: OperationClaim,
  ): Promise<void> {
    const [operation]: Operation[] = await manager.query(
      'SELECT * FROM learning_operations WHERE id = $1 FOR UPDATE',
      [claim.id],
    );
    if (
      !operation ||
      operation.status !== 'pending' ||
      operation.lease !== claim.lease
    )
      this.pending();
  }

  async recordFeedRetry(userId: string, claim: OperationClaim): Promise<void> {
    await this.database.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(1101,hashtext($1))', [
        claim.id,
      ]);
      await manager.query('SELECT pg_advisory_xact_lock(1102,hashtext($1))', [
        userId,
      ]);
      const [operation]: Operation[] = await manager.query(
        'SELECT * FROM learning_operations WHERE id = $1 FOR UPDATE',
        [claim.id],
      );
      if (
        !operation ||
        operation.user_id !== userId ||
        operation.kind !== 'feed' ||
        operation.status !== 'pending' ||
        operation.lease !== claim.lease
      ) {
        this.pending();
      }
      const [recent] = await manager.query(
        `SELECT coalesce(sum(call_count),0)::int AS count FROM learning_operations
        WHERE user_id = $1 AND kind = 'feed' AND called_at > now() - interval '1 minute'`,
        [userId],
      );
      if (recent.count >= 10) {
        throw new HttpException(
          { code: 'RATE_LIMIT', message: 'Please wait before trying again' },
          429,
        );
      }
      await manager.query(
        `UPDATE learning_operations SET
          call_count = CASE WHEN called_at > now() - interval '1 minute'
            THEN call_count + 1 ELSE 1 END,
          called_at = now()
        WHERE id = $1 AND lease = $2`,
        [claim.id, claim.lease],
      );
    });
  }

  async complete(
    manager: EntityManager,
    claim: OperationClaim,
    result: unknown,
  ): Promise<void> {
    await manager.query(
      `UPDATE learning_operations SET status = 'complete', result = $3::jsonb
      WHERE id = $1 AND lease = $2`,
      [claim.id, claim.lease, JSON.stringify(result)],
    );
  }

  async fail(claim: OperationClaim): Promise<void> {
    await this.database.query(
      `UPDATE learning_operations SET status = 'failed'
      WHERE id = $1 AND lease = $2 AND status = 'pending'`,
      [claim.id, claim.lease],
    );
  }

  private pending(): never {
    throw new ConflictException({
      code: 'REQUEST_IN_PROGRESS',
      message: 'This request is still being processed. Retry shortly.',
    });
  }
}
