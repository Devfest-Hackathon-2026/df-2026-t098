import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';
import { SessionsService } from './sessions/sessions.service';
import { PASSWORD_OPTIONS } from './password-options';

type TokenKind = 'verify_email' | 'reset_password';

const LIFETIME_MS: Record<TokenKind, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 30 * 60 * 1000,
};
/** At most one email of each kind per account in this window, so nobody can mail-bomb a victim. */
const RESEND_COOLDOWN_MS = 60 * 1000;

const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

function frontendUrl(): string {
  return (process.env.FRONTEND_URL ?? 'http://localhost:4200').replace(
    /\/+$/,
    '',
  );
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

function layout(
  title: string,
  lines: string[],
  link: string,
  button: string,
): string {
  const body = lines
    .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`)
    .join('');
  return `<!doctype html><html><body style="font-family:-apple-system,'Hiragino Sans',Arial,sans-serif;color:#111;line-height:1.6;max-width:520px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}
<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#c6f24e;color:#080808;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">${escapeHtml(button)}</a></p>
<p style="font-size:13px;color:#555;word-break:break-all">${escapeHtml(link)}</p></body></html>`;
}

/**
 * Email verification and password reset. Tokens are 32 random bytes, emailed once, stored only as
 * SHA-256, single use, short-lived, and bound to the address they were sent to.
 */
@Injectable()
export class AccountEmailService {
  private readonly logger = new Logger('AccountEmail');

  constructor(
    private readonly database: DataSource,
    private readonly email: EmailService,
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
  ) {}

  /** Sends (or re-sends) the verification link. Quietly does nothing for verified accounts. */
  async sendVerification(
    userId: string,
  ): Promise<{ sent: boolean; verified: boolean }> {
    const user = await this.users.findById(userId);
    if (!user) return { sent: false, verified: false };
    if (user.email_verified_at) return { sent: false, verified: true };
    const token = await this.issue(user.id, 'verify_email', user.email);
    if (!token) return { sent: false, verified: false };
    const link = `${frontendUrl()}/verify-email?token=${token}`;
    await this.email.send({
      to: user.email,
      subject: 'WhyLint: メールアドレスの確認 / Confirm your email',
      text: [
        'WhyLintへの登録ありがとうございます。下のリンクからメールアドレスを確認してください（24時間有効）。',
        'Thanks for joining WhyLint. Confirm your email with the link below (valid for 24 hours).',
        '',
        link,
        '',
        "心当たりがない場合は、このメールを無視してください。 / If this wasn't you, ignore this email.",
      ].join('\n'),
      html: layout(
        'メールアドレスの確認 / Confirm your email',
        [
          'WhyLintへの登録ありがとうございます。下のボタンからメールアドレスを確認してください（24時間有効）。',
          'Thanks for joining WhyLint. Confirm your email with the button below (valid for 24 hours).',
          "心当たりがない場合は、このメールを無視してください。 / If this wasn't you, ignore this email.",
        ],
        link,
        '確認する / Confirm email',
      ),
    });
    return { sent: true, verified: false };
  }

  /** Signup must not fail because email is down; the learner can resend from Profile. */
  async sendVerificationQuietly(userId: string): Promise<void> {
    try {
      await this.sendVerification(userId);
    } catch {
      this.logger.warn('Verification email was not sent at signup');
    }
  }

  async verifyEmail(token: string): Promise<{ verified: true }> {
    const row = await this.consume(token, 'verify_email');
    await this.database.query(
      `UPDATE users SET email_verified_at = coalesce(email_verified_at, now())
      WHERE id = $1 AND lower(email) = lower($2)`,
      [row.user_id, row.email],
    );
    return { verified: true };
  }

  /**
   * Always answers the same way, whether or not the account exists, so the endpoint cannot be
   * used to discover accounts. Only password accounts get a link; Google-only accounts have no
   * password to reset.
   */
  async requestPasswordReset(identifier: string): Promise<void> {
    const user = await this.users.findByIdentifier(identifier);
    if (!user?.password_hash || !user.email) return;
    const token = await this.issue(user.id, 'reset_password', user.email);
    if (!token) return;
    const link = `${frontendUrl()}/reset-password?token=${token}`;
    try {
      await this.email.send({
        to: user.email,
        subject: 'WhyLint: パスワードの再設定 / Reset your password',
        text: [
          'パスワード再設定のリクエストを受け付けました。下のリンクから新しいパスワードを設定してください（30分間有効）。',
          'We received a request to reset your password. Set a new one with the link below (valid for 30 minutes).',
          '',
          link,
          '',
          '心当たりがない場合は、このメールを無視してください。パスワードは変更されません。',
          "If this wasn't you, ignore this email. Your password stays the same.",
        ].join('\n'),
        html: layout(
          'パスワードの再設定 / Reset your password',
          [
            'パスワード再設定のリクエストを受け付けました。下のボタンから新しいパスワードを設定してください（30分間有効）。',
            'We received a request to reset your password. Set a new one with the button below (valid for 30 minutes).',
            '心当たりがない場合は、このメールを無視してください。パスワードは変更されません。',
            "If this wasn't you, ignore this email. Your password stays the same.",
          ],
          link,
          '新しいパスワードを設定 / Set a new password',
        ),
      });
    } catch {
      // EmailService logs delivery failures without exposing the recipient or link.
      // Keep the public response identical even when the provider is unavailable.
    }
  }

  /** Sets the new password, proves the inbox, and signs the account out everywhere. */
  async resetPassword(token: string, password: string): Promise<void> {
    const passwordHash = await argon2.hash(password, PASSWORD_OPTIONS);
    await this.database.transaction(async (manager) => {
      const row = await this.consume(token, 'reset_password', manager);
      const updated: [unknown[], number] = await manager.query(
        `UPDATE users SET password_hash = $2, updated_at = now(),
          email_verified_at = coalesce(email_verified_at, now())
        WHERE id = $1 AND lower(email) = lower($3) AND password_hash IS NOT NULL`,
        [row.user_id, passwordHash, row.email],
      );
      if (!updated[1])
        throw new BadRequestException({
          code: 'TOKEN_INVALID',
          message: 'This link is no longer valid',
        });
      await manager.query(
        `UPDATE auth_email_tokens SET used_at = now()
        WHERE user_id = $1 AND kind = 'reset_password' AND used_at IS NULL`,
        [row.user_id],
      );
      await this.sessions.revokeAll(row.user_id, manager);
    });
  }

  /** Returns the raw token, or null while the account is inside the resend cooldown. */
  private async issue(
    userId: string,
    kind: TokenKind,
    email: string,
  ): Promise<string | null> {
    return this.database.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(2207, hashtext($1))', [
        userId + kind,
      ]);
      const [recent]: unknown[] = await manager.query(
        `SELECT 1 FROM auth_email_tokens WHERE user_id = $1 AND kind = $2
        AND created_at > now() - ($3::int * interval '1 millisecond')`,
        [userId, kind, RESEND_COOLDOWN_MS],
      );
      if (recent) return null;
      await manager.query(
        `UPDATE auth_email_tokens SET used_at = now() WHERE user_id = $1 AND kind = $2 AND used_at IS NULL`,
        [userId, kind],
      );
      const token = randomBytes(32).toString('base64url');
      await manager.query(
        `INSERT INTO auth_email_tokens (user_id,kind,token_hash,email,expires_at)
        VALUES ($1,$2,$3,$4,now() + ($5::int * interval '1 millisecond'))`,
        [userId, kind, hash(token), email, LIFETIME_MS[kind]],
      );
      return token;
    });
  }

  private async consume(
    token: string,
    kind: TokenKind,
    manager = this.database.manager,
  ): Promise<{ user_id: string; email: string }> {
    // PostgreSQL UPDATE ... RETURNING comes back from TypeORM as [rows, affectedCount].
    const result: unknown = await manager.query(
      `UPDATE auth_email_tokens SET used_at = now()
      WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id,email`,
      [hash(token), kind],
    );
    const rows = (
      Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result
    ) as { user_id?: string; email?: string }[];
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row?.user_id || !row.email)
      throw new BadRequestException({
        code: 'TOKEN_INVALID',
        message: 'This link is invalid or has expired',
      });
    return { user_id: row.user_id, email: row.email };
  }
}
