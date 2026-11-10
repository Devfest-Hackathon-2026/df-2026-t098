import {
  BadGatewayException,
  ConflictException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { PASSWORD_OPTIONS } from './password-options';
import { AccountEmailService } from './account-email.service';
import * as argon2 from 'argon2';
import axios from 'axios';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { UsersService } from '../users/users.service';
import { PasswordLoginDto } from './dto/password-login.dto';
import { SignupDto } from './dto/signup.dto';
import { verifyToken } from './jwt/jwt-token';
import { SessionsService } from './sessions/sessions.service';



@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    private readonly dataSource: DataSource,
    private readonly accountEmail: AccountEmailService,
  ) {}

  private readonly googleClient = new OAuth2Client();
  private dummyPasswordHash!: string;

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await argon2.hash(
      'whylint-dummy-password-for-verification',
      PASSWORD_OPTIONS,
    );
  }

  async login(code: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const frontendUrl = process.env.FRONTEND_URL;
    if (!clientId || !clientSecret || !frontendUrl) {
      throw new Error('Google login configuration is incomplete');
    }

    let idToken: string;
    let accessToken: string | undefined;
    try {
      const tokenRes = await axios.post<{ id_token?: string; access_token?: string }>(
        'https://oauth2.googleapis.com/token',
        new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: `${frontendUrl}/auth/google/callback`,
          grant_type: 'authorization_code',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 },
      );
      if (!tokenRes.data.id_token) throw new BadGatewayException('Google sign-in is unavailable');
      idToken = tokenRes.data.id_token;
      accessToken = tokenRes.data.access_token;
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      if (
        axios.isAxiosError(err) &&
        (err.response?.status === 400 || err.response?.status === 401)
      ) {
        throw new UnauthorizedException('Unable to sign in with Google');
      }
      throw new BadGatewayException('Google sign-in is unavailable');
    }

    return this.googleSession(idToken, clientId, accessToken);
  }

  async mobileGoogleLogin(idToken: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new BadGatewayException('Google sign-in is unavailable');
    return this.googleSession(idToken, clientId);
  }

  private async googleSession(idToken: string, clientId: string, accessToken?: string) {
    let data;
    try {
      const ticket = await this.googleClient.verifyIdToken({ idToken, audience: clientId });
      data = ticket.getPayload();
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.startsWith('Failed to retrieve verification certificates:')
      ) {
        throw new BadGatewayException('Google sign-in is unavailable');
      }
      throw new UnauthorizedException('Unable to verify Google sign-in');
    }

    if (!data?.sub || !data.email || data.email_verified !== true) {
      throw new UnauthorizedException('Invalid Google account');
    }

    let name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : undefined;
    let picture = data.picture;
    if ((!name || !picture) && accessToken) {
      try {
        const profile = await axios.get<{ sub?: string; name?: string; picture?: string }>(
          'https://openidconnect.googleapis.com/v1/userinfo',
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 3000 },
        );
        if (profile.data.sub === data.sub) {
          if (!name && typeof profile.data.name === 'string' && profile.data.name.trim())
            name = profile.data.name.trim();
          if (!picture && typeof profile.data.picture === 'string') picture = profile.data.picture;
        }
      } catch {
        // The profile lookup is optional.
      }
    }

    let user = await this.usersService.findByGoogleId(data.sub);
    if (!user) {
      try {
        user = await this.usersService.createUser({
          email: data.email,
          googleId: data.sub,
          name,
          picture,
        });
      } catch (err) {
        if (!(err instanceof ConflictException)) throw err;
        // Find the account by Google subject. Email can change.
        user = await this.usersService.findByGoogleId(data.sub);
        if (!user) throw new UnauthorizedException('Unable to sign in with Google');
      }
    }

    // Google verified this address; prove it for an account that predates the check.
    if (
      !user.email_verified_at &&
      typeof user.email === 'string' &&
      user.email.toLowerCase() === data.email.toLowerCase()
    ) {
      await this.dataSource.query(
        'UPDATE users SET email_verified_at = now() WHERE id = $1 AND email_verified_at IS NULL',
        [user.id],
      );
    }
    if (name && name !== user.name) {
      await this.usersService.updateGoogleName(user.id, data.sub, name);
    }

    if (picture && picture !== user.avatar_url) {
      await this.usersService.updateGoogleAvatar(user.id, data.sub, picture);
    }

    return this.createSession(user.id, 'Login successful!');
  }

  async signup(data: SignupDto) {
    const passwordHash = await argon2.hash(data.password, PASSWORD_OPTIONS);
    const created = await this.dataSource.transaction(async (manager) => {
      const user = await this.usersService.createPasswordUser(
        { email: data.email, username: data.username },
        passwordHash,
        manager,
      );
      return { userId: user.id, session: await this.createSession(user.id, 'Account created!', manager) };
    });
    // After the commit, so the verification token can reference the new user.
    void this.accountEmail.sendVerificationQuietly(created.userId);
    return created.session;
  }

  async passwordLogin(data: PasswordLoginDto) {
    const user = await this.usersService.findByIdentifier(data.identifier);
    const passwordHash = user?.password_hash ?? this.dummyPasswordHash;
    let matches: boolean;
    try {
      matches = await argon2.verify(passwordHash, data.password);
    } catch {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user || !user.password_hash || !matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.createSession(user.id, 'Login successful!');
  }

  async logout(token?: string): Promise<void> {
    if (!token) return;
    const payload = await verifyToken(this.jwtService, token);
    if (!payload) return;
    await this.sessionsService.revoke(payload.sid, payload.sub);
  }

  /**
   * Permanently deletes the account. Sessions are revoked first, then the user row is
   * removed in the same transaction. Foreign keys do the rest: sessions, preferences,
   * attempts, taps, XP, progress, reactions, comments, helpful votes, reports and blocks
   * cascade; published questions stay but lose their author (`author_id` becomes NULL).
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Wait for in-flight writes of this user; they hold a key-share lock on the row.
      const locked: unknown[] = await manager.query(
        'SELECT id FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );
      if (locked.length === 0) return;
      await this.sessionsService.revokeAll(userId, manager);
      await manager.query('DELETE FROM users WHERE id = $1', [userId]);
    });
  }

  async getCurrentUser(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User no longer exists');

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
      username: user.username ?? null,
      emailVerified: Boolean(user.email_verified_at),
    };
  }

  async setUsername(userId: string, username: string) {
    await this.usersService.setUsername(userId, username);
    return this.getCurrentUser(userId);
  }

  private async createSession(userId: string, message: string, manager?: EntityManager) {
    const session = manager
      ? await this.sessionsService.create(userId, manager)
      : await this.sessionsService.create(userId);
    const token = await this.jwtService.signAsync({ sub: userId, sid: session.id });
    return { message, token };
  }
}
