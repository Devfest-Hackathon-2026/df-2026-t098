import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { GoogleAccountDto } from 'src/dto/auth.dto';
import { UserEntity } from 'src/entities/user.entity';
import { IsNull, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(UserEntity) private usersRepository: Repository<UserEntity>) {}

  async createUser(userData: GoogleAccountDto): Promise<UserEntity> {
    try {
      const newAccount = this.usersRepository.create({
        email: userData.email.trim(),
        name: this.googleDisplayName(userData.name),
        avatar_url: this.googleAvatarUrl(userData.picture),
        google_id: userData.googleId,
      });

      return await this.usersRepository.save(newAccount);
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException('Unable to create account');
      }
      throw err;
    }
  }

  async createPasswordUser(
    userData: { email: string; username: string },
    passwordHash: string,
    manager?: EntityManager,
  ): Promise<UserEntity> {
    try {
      const repository = manager ? manager.getRepository(UserEntity) : this.usersRepository;
      const newAccount = repository.create({
        email: userData.email.trim(),
        username: userData.username.trim(),
        google_id: null,
        password_hash: passwordHash,
        name: null,
        avatar_url: null,
      });

      return await repository.save(newAccount);
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException('Unable to create account');
      }
      throw err;
    }
  }

  async findByIdentifier(identifier: string): Promise<UserEntity | null> {
    const normalized = identifier.trim();
    const column = normalized.includes('@') ? 'email' : 'username';

    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password_hash')
      .where(`LOWER(BTRIM("user"."${column}")) = LOWER(:identifier)`, {
        identifier: normalized,
      })
      .getOne();
  }

  async findByGoogleId(googleId: string) {
    return this.usersRepository.findOne({
      where: { google_id: googleId },
    });
  }

  async updateGoogleAvatar(id: string, googleId: string, picture: string): Promise<void> {
    const avatarUrl = this.googleAvatarUrl(picture);
    if (!avatarUrl) return;

    await this.usersRepository.update({ id, google_id: googleId }, { avatar_url: avatarUrl });
  }

  async updateGoogleName(id: string, googleId: string, name: string): Promise<void> {
    const displayName = this.googleDisplayName(name);
    if (!displayName) return;
    await this.usersRepository.update({ id, google_id: googleId }, { name: displayName });
  }

  async findById(id: string) {
    return this.usersRepository.findOne({
      where: { id },
    });
  }

  async setUsername(id: string, username: string): Promise<void> {
    const normalized = username.trim();
    try {
      const result = await this.usersRepository.update(
        { id, username: IsNull() },
        { username: normalized },
      );
      if (result.affected === 1) return;
    } catch (err) {
      if (this.isUniqueViolation(err)) throw new ConflictException('Username is unavailable');
      throw err;
    }

    const user = await this.findById(id);
    if (!user) throw new UnauthorizedException('User no longer exists');
    if (user.username?.toLowerCase() === normalized.toLowerCase()) return;
    throw new ConflictException('Username is already set');
  }

  private googleDisplayName(name?: string): string | null {
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  }

  private googleAvatarUrl(picture?: string): string | null {
    if (typeof picture !== 'string' || !picture.trim()) return null;
    try {
      const url = new URL(picture);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch {
      return null;
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const error = err as { code?: unknown; driverError?: { code?: unknown } };
    return error.code === '23505' || error.driverError?.code === '23505';
  }
}
