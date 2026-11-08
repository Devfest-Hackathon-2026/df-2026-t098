import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { UserEntity } from '../entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
    update: jest.Mock;
  };
  let query: {
    addSelect: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };

  beforeEach(() => {
    query = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    repository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(query),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    service = new UsersService(repository as unknown as Repository<UserEntity>);
  });

  it('creates a password account using its hash and no Google identity', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const user = { email: '  learner@example.test  ', username: '  Learner  ' };

    try {
      const saved = await service.createPasswordUser(user, 'test-only-hash');

      expect(repository.create).toHaveBeenCalledWith({
        email: 'learner@example.test',
        username: 'Learner',
        google_id: null,
        password_hash: 'test-only-hash',
        name: null,
        avatar_url: null,
      });
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'learner@example.test',
          password_hash: 'test-only-hash',
        }),
      );
      expect(saved).toEqual(expect.objectContaining({ username: 'Learner', google_id: null }));
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it.each([
    {
      identifier: '  Learner@Example.test  ',
      expected: 'Learner@Example.test',
      column: 'email',
    },
    { identifier: '  Learner_1  ', expected: 'Learner_1', column: 'username' },
    {
      identifier: "  name' OR 1=1--@example.test  ",
      expected: "name' OR 1=1--@example.test",
      column: 'email',
    },
  ])(
    'uses a parameterized, case-insensitive $column lookup',
    async ({ identifier, expected, column }) => {
      query.getOne.mockResolvedValue({ id: 'test-user' });

      await expect(service.findByIdentifier(identifier)).resolves.toEqual({
        id: 'test-user',
      });

      expect(repository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(query.addSelect).toHaveBeenCalledWith('user.password_hash');
      expect(query.where).toHaveBeenCalledWith(expect.stringContaining(`"${column}"`), {
        identifier: expected,
      });
      const sql = query.where.mock.calls[0][0] as string;
      expect(sql).toContain('LOWER(');
      expect(sql).toContain('LOWER(:identifier)');
      expect(sql).not.toContain(expected);
    },
  );

  it.each([{ code: '23505' }, { driverError: { code: '23505' } }])(
    'maps password signup uniqueness conflicts to a generic 409',
    async (databaseError) => {
      repository.save.mockRejectedValue(databaseError);

      await expect(
        service.createPasswordUser({ email: 'a@example.test', username: 'learner' }, 'test-hash'),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Unable to create account',
      });
    },
  );

  it('preserves unexpected persistence failures instead of misclassifying them', async () => {
    const databaseError = new Error('database offline');
    repository.save.mockRejectedValue(databaseError);

    await expect(
      service.createPasswordUser({ email: 'a@example.test', username: 'learner' }, 'test-hash'),
    ).rejects.toBe(databaseError);
  });

  it('looks up Google users by subject, not email', async () => {
    repository.findOne.mockResolvedValue({ id: 'google-user' });

    await expect(service.findByGoogleId('google-subject')).resolves.toEqual({
      id: 'google-user',
    });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { google_id: 'google-subject' },
    });
  });

  it('looks up a profile by its internal user ID', async () => {
    repository.findOne.mockResolvedValue({ id: 'user-id' });

    await expect(service.findById('user-id')).resolves.toEqual({
      id: 'user-id',
    });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'user-id' },
    });
  });

  it('creates a Google identity without automatically looking up or linking an email', async () => {
    await service.createUser({
      email: ' learner@example.test ',
      googleId: 'google-subject',
      name: 'Learner',
    });

    expect(repository.create).toHaveBeenCalledWith({
      email: 'learner@example.test',
      google_id: 'google-subject',
      name: 'Learner',
      avatar_url: null,
    });
    expect(repository.findOne).not.toHaveBeenCalled();
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('rejects Google email collisions rather than automatically linking identities', async () => {
    repository.save.mockRejectedValue({ code: '23505' });

    await expect(
      service.createUser({
        email: 'learner@example.test',
        googleId: 'google-subject',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('persists Google pictures during creation and refreshes only the verified identity', async () => {
    await service.createUser({
      email: 'learner@example.test',
      googleId: 'google-subject',
      picture: 'https://example.test/avatar.png',
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ avatar_url: 'https://example.test/avatar.png' }),
    );

    await service.updateGoogleAvatar('user-id', 'google-subject', 'https://example.test/new.png');
    expect(repository.update).toHaveBeenCalledWith(
      { id: 'user-id', google_id: 'google-subject' },
      { avatar_url: 'https://example.test/new.png' },
    );
  });

  it.each([
    '',
    'not a URL',
    'http://example.test/avatar.png',
    'javascript:alert(1)',
    'https://user:pass@example.test/avatar.png',
  ])('does not replace an existing avatar with an invalid picture', async (picture) => {
    await service.updateGoogleAvatar('user-id', 'google-subject', picture);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('stores and refreshes a trimmed Google display name without touching username or identity fields', async () => {
    await service.createUser({
      email: 'learner@example.test',
      googleId: 'google-subject',
      name: '  Fixture Display Name  ',
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fixture Display Name' }),
    );
    await service.updateGoogleName('user-id', 'google-subject', '  Updated Display Name  ');
    expect(repository.update).toHaveBeenCalledWith(
      { id: 'user-id', google_id: 'google-subject' },
      { name: 'Updated Display Name' },
    );
  });

  it('ignores a blank display name instead of erasing stored metadata', async () => {
    await service.updateGoogleName('user-id', 'google-subject', '   ');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('preserves unexpected Google account persistence failures', async () => {
    const databaseError = new Error('database offline');
    repository.save.mockRejectedValue(databaseError);

    await expect(
      service.createUser({
        email: 'learner@example.test',
        googleId: 'google-subject',
      }),
    ).rejects.toBe(databaseError);
  });

  it('sets a trimmed username only for the authenticated user whose name is missing', async () => {
    await service.setUsername('current-user', '  学習者_1  ');
    const [where, changes] = repository.update.mock.calls[0];
    expect(where.id).toBe('current-user');
    expect(where.username.type).toBe('isNull');
    expect(changes).toEqual({ username: '学習者_1' });
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('makes a retry idempotent but refuses replacement of an existing username', async () => {
    repository.update.mockResolvedValue({ affected: 0 });
    repository.findOne.mockResolvedValue({ id: 'current-user', username: 'Learner' });
    await expect(service.setUsername('current-user', 'learner')).resolves.toBeUndefined();
    await expect(service.setUsername('current-user', 'another-name')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('returns 401 when the authenticated user has been deleted', async () => {
    repository.update.mockResolvedValue({ affected: 0 });
    repository.findOne.mockResolvedValue(null);
    await expect(service.setUsername('deleted-user', 'learner')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('maps a racing unique constraint failure to conflict and preserves other failures', async () => {
    repository.update.mockRejectedValueOnce({ driverError: { code: '23505' } });
    await expect(service.setUsername('current-user', 'taken')).rejects.toBeInstanceOf(
      ConflictException,
    );
    const failure = new Error('database unavailable');
    repository.update.mockRejectedValueOnce(failure);
    await expect(service.setUsername('current-user', 'learner')).rejects.toBe(failure);
  });
});
