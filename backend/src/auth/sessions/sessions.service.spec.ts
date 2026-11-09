import { Repository } from 'typeorm';
import { SessionEntity } from './session.entity';
import { SESSION_LIFETIME_MS, SessionsService } from './sessions.service';

describe('SessionsService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const sessionId = '22222222-2222-4222-8222-222222222222';
  const now = new Date('2030-01-01T00:00:00.000Z');
  const repository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const service = new SessionsService(repository as unknown as Repository<SessionEntity>);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates and persists a session for the specified user with a finite lifetime', async () => {
    const created = { id: sessionId, user_id: userId };
    repository.create.mockReturnValue(created);
    repository.save.mockResolvedValue(created);

    await expect(service.create(userId)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith({
      user_id: userId,
      expires_at: new Date(now.getTime() + SESSION_LIFETIME_MS),
      revoked_at: null,
    });
    expect(repository.save).toHaveBeenCalledWith(created);
  });

  it('looks up a matching, unrevoked and unexpired session', async () => {
    repository.findOne.mockResolvedValue({ id: sessionId, user_id: userId });

    await expect(service.isActive(sessionId, userId)).resolves.toBe(true);
    const query = repository.findOne.mock.calls[0][0];
    expect(query.where.id).toBe(sessionId);
    expect(query.where.user_id).toBe(userId);
    expect(query.where.revoked_at.type).toBe('isNull');
    expect(query.where.expires_at.type).toBe('moreThan');
    expect(query.where.expires_at.value).toEqual(now);
  });

  it('treats an absent, revoked, expired, or foreign session as inactive', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.isActive(sessionId, userId)).resolves.toBe(false);
  });

  it('revokes only the matching user session and sets its revocation time', async () => {
    repository.update.mockResolvedValue({ affected: 1 });

    await service.revoke(sessionId, userId);
    const [criteria, values] = repository.update.mock.calls[0];
    expect(criteria.id).toBe(sessionId);
    expect(criteria.user_id).toBe(userId);
    expect(criteria.revoked_at.type).toBe('isNull');
    expect(values.revoked_at).toEqual(now);
  });

  it('revokes every active session of one user, optionally inside a transaction', async () => {
    repository.update.mockResolvedValue({ affected: 2 });
    await service.revokeAll(userId);
    const [criteria, values] = repository.update.mock.calls[0];
    expect(criteria.user_id).toBe(userId);
    expect(criteria).not.toHaveProperty('id');
    expect(criteria.revoked_at.type).toBe('isNull');
    expect(values.revoked_at).toEqual(now);

    const scoped = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const manager = { getRepository: jest.fn().mockReturnValue(scoped) };
    await service.revokeAll(userId, manager as never);
    expect(manager.getRepository).toHaveBeenCalledWith(SessionEntity);
    expect(scoped.update).toHaveBeenCalledTimes(1);
    expect(repository.update).toHaveBeenCalledTimes(1);
  });

  it('propagates repository failures', async () => {
    const databaseError = new Error('database unavailable');
    repository.findOne.mockRejectedValue(databaseError);
    await expect(service.isActive(sessionId, userId)).rejects.toBe(databaseError);
    repository.update.mockRejectedValue(databaseError);
    await expect(service.revoke(sessionId, userId)).rejects.toBe(databaseError);
  });
});
