import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { SessionEntity } from './session.entity';

export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(SessionEntity) private sessionsRepository: Repository<SessionEntity>,
  ) {}

  async create(userId: string, manager?: EntityManager): Promise<SessionEntity> {
    const repository = manager ? manager.getRepository(SessionEntity) : this.sessionsRepository;
    const session = repository.create({
      user_id: userId,
      expires_at: new Date(Date.now() + SESSION_LIFETIME_MS),
      revoked_at: null,
    });
    return repository.save(session);
  }

  async isActive(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.sessionsRepository.findOne({
      where: {
        id: sessionId,
        user_id: userId,
        revoked_at: IsNull(),
        expires_at: MoreThan(new Date()),
      },
    });
    return session !== null;
  }

  /** Ends every active session of a user, on every device. */
  async revokeAll(userId: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(SessionEntity) : this.sessionsRepository;
    await repository.update({ user_id: userId, revoked_at: IsNull() }, { revoked_at: new Date() });
  }

  async revoke(sessionId: string, userId: string): Promise<void> {
    await this.sessionsRepository.update(
      { id: sessionId, user_id: userId, revoked_at: IsNull() },
      { revoked_at: new Date() },
    );
  }
}
