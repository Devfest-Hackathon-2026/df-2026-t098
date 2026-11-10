import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Brand } from '../brand/brand';
import { AUTH_FETCH, AuthSession } from '../auth/auth-session';
import { DisplaySettings } from '../learning/display-settings';

export type AccountEmailMode = 'forgot' | 'reset' | 'verify';
type Phase = 'form' | 'working' | 'done' | 'error';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

const COPY = {
  ja: {
    back: 'ログインに戻る',
    forgotTitle: 'パスワードをお忘れですか？',
    forgotIntro: '登録したメールアドレスかユーザー名を入力してください。再設定用のリンクをお送りします。',
    identifier: 'メールアドレスまたはユーザー名',
    send: '再設定リンクを送る',
    sending: '送信中…',
    forgotDone: 'アカウントが見つかった場合、再設定用のリンクをメールで送りました。30分以内に開いてください。',
    resetTitle: '新しいパスワードを設定',
    resetIntro: '15文字以上の新しいパスワードを入力してください。設定後、すべての端末でログアウトされます。',
    password: '新しいパスワード',
    save: 'パスワードを変更',
    saving: '変更中…',
    resetDone: 'パスワードを変更しました。新しいパスワードでログインしてください。',
    signIn: 'ログインする',
    verifyTitle: 'メールアドレスの確認',
    verifying: '確認しています…',
    verifyDone: 'メールアドレスを確認しました。ありがとうございます！',
    toFeed: '学習を続ける',
    tooShort: 'パスワードは15〜128文字で入力してください。',
    required: '入力してください。',
    invalidLink: 'このリンクは無効か、期限が切れています。もう一度お試しください。',
    newLink: '新しいリンクをリクエスト',
    rateLimit: 'リクエストが多すぎます。少し待ってから再試行してください。',
    unavailable: '処理できませんでした。少し待ってから再試行してください。',
  },
  en: {
    back: 'Back to sign in',
    forgotTitle: 'Forgot your password?',
    forgotIntro: 'Enter your email address or username and we will email you a reset link.',
    identifier: 'Email or username',
    send: 'Send reset link',
    sending: 'Sending…',
    forgotDone: 'If an account matches, a reset link is on its way. Open it within 30 minutes.',
    resetTitle: 'Set a new password',
    resetIntro: 'Choose a new password of at least 15 characters. You will be signed out on every device.',
    password: 'New password',
    save: 'Change password',
    saving: 'Changing…',
    resetDone: 'Your password has changed. Sign in with the new one.',
    signIn: 'Sign in',
    verifyTitle: 'Confirm your email',
    verifying: 'Confirming…',
    verifyDone: 'Your email address is confirmed. Thank you!',
    toFeed: 'Keep learning',
    tooShort: 'Use 15–128 characters.',
    required: 'This field is required.',
    invalidLink: 'This link is invalid or has expired. Please try again.',
    newLink: 'Request a new link',
    rateLimit: 'Too many requests. Wait a moment, then try again.',
    unavailable: 'Something went wrong. Wait a moment, then try again.',
  },
} as const;

@Component({
  selector: 'app-account-email',
  imports: [Brand, RouterLink],
  styleUrls: ['../auth/auth-page.css'],
  template: `
    <div class="auth-shell">
      <header class="header">
        <a class="brand" routerLink="/" aria-label="WhyLint"><app-brand /></a>
      </header>
      <main class="content">
        <a routerLink="/login" class="back"><span aria-hidden="true">←</span>{{ ui().back }}</a>
        @switch (mode) {
          @case ('forgot') {
            <h1>{{ ui().forgotTitle }}</h1>
            @if (phase() === 'done') {
              <p class="intro" role="status">{{ ui().forgotDone }}</p>
            } @else {
              <p class="intro">{{ ui().forgotIntro }}</p>
              <form class="password-form" (submit)="forgot($event, identifier.value)" novalidate>
                <label for="reset-identifier">{{ ui().identifier }}</label>
                <input #identifier id="reset-identifier" name="identifier" type="text"
                  autocomplete="username" autocapitalize="none" maxlength="254" required
                  [disabled]="phase() === 'working'" [attr.aria-invalid]="error() ? 'true' : null" />
                @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
                <button class="primary password-button" type="submit" [disabled]="phase() === 'working'">
                  {{ phase() === 'working' ? ui().sending : ui().send }}
                </button>
              </form>
            }
          }
          @case ('reset') {
            <h1>{{ ui().resetTitle }}</h1>
            @if (phase() === 'done') {
              <p class="intro" role="status">{{ ui().resetDone }}</p>
              <a class="primary retry-button" routerLink="/login">{{ ui().signIn }}</a>
            } @else if (!token) {
              <p class="error" role="alert">{{ ui().invalidLink }}</p>
              <a class="auth-link" routerLink="/forgot-password">{{ ui().newLink }}</a>
            } @else {
              <p class="intro">{{ ui().resetIntro }}</p>
              <form class="password-form" (submit)="reset($event, password.value)" novalidate>
                <label for="reset-password">{{ ui().password }}</label>
                <input #password id="reset-password" name="password" type="password"
                  autocomplete="new-password" minlength="15" maxlength="128" required
                  [disabled]="phase() === 'working'" [attr.aria-invalid]="error() ? 'true' : null" />
                @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
                @if (expired()) { <a class="auth-link" routerLink="/forgot-password">{{ ui().newLink }}</a> }
                <button class="primary password-button" type="submit" [disabled]="phase() === 'working'">
                  {{ phase() === 'working' ? ui().saving : ui().save }}
                </button>
              </form>
            }
          }
          @case ('verify') {
            <h1>{{ ui().verifyTitle }}</h1>
            @if (phase() === 'done') {
              <p class="intro" role="status">{{ ui().verifyDone }}</p>
              <a class="primary retry-button" routerLink="/">{{ ui().toFeed }}</a>
            } @else if (phase() === 'error' || !token) {
              <p class="error" role="alert">{{ error() || ui().invalidLink }}</p>
              <a class="auth-link" routerLink="/">{{ ui().toFeed }}</a>
            } @else {
              <p class="intro" role="status">{{ ui().verifying }}</p>
            }
          }
        }
      </main>
    </div>
  `,
})
export class AccountEmailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly request = inject(AUTH_FETCH);
  private readonly session = inject(AuthSession);
  private readonly settings = inject(DisplaySettings);
  private readonly document = inject(DOCUMENT);

  protected readonly mode = (this.route.snapshot.data['mode'] as AccountEmailMode) ?? 'forgot';
  protected readonly token = (() => {
    const value = this.route.snapshot.queryParamMap.get('token') ?? '';
    return TOKEN.test(value) ? value : null;
  })();
  protected readonly phase = signal<Phase>('form');
  protected readonly error = signal('');
  protected readonly expired = signal(false);
  protected readonly ui = computed(() => COPY[this.settings.language()]);

  ngOnInit(): void {
    // Keep the one-time token out of history, bookmarks and screenshots once it is read.
    if (this.token) {
      this.document.defaultView?.history.replaceState(null, '', this.document.location.pathname);
    }
    if (this.mode === 'verify' && this.token) void this.verify();
  }

  protected async forgot(event: Event, identifier: string): Promise<void> {
    event.preventDefault();
    if (!identifier.trim()) return this.error.set(this.ui().required);
    const status = await this.post('/api/v1/auth/password/forgot', { identifier: identifier.trim() });
    if (status === 202) return this.phase.set('done');
    this.fail(status);
  }

  protected async reset(event: Event, password: string): Promise<void> {
    event.preventDefault();
    if (password.length < 15 || password.length > 128) return this.error.set(this.ui().tooShort);
    const status = await this.post('/api/v1/auth/password/reset', { token: this.token, password });
    if (status === 204) {
      await this.session.refresh();
      return this.phase.set('done');
    }
    this.fail(status);
  }

  private async verify(): Promise<void> {
    const status = await this.post('/api/v1/auth/email/verify', { token: this.token });
    if (status === 200) {
      await this.session.refresh();
      return this.phase.set('done');
    }
    this.fail(status);
    this.phase.set('error');
  }

  private fail(status: number): void {
    this.phase.set('form');
    this.expired.set(status === 400 && this.mode !== 'forgot');
    this.error.set(
      status === 400
        ? this.mode === 'forgot'
          ? this.ui().required
          : this.ui().invalidLink
        : status === 429
          ? this.ui().rateLimit
          : this.ui().unavailable,
    );
  }

  private async post(path: string, body: unknown): Promise<number> {
    this.phase.set('working');
    this.error.set('');
    try {
      const response = await this.request(path, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return response.status;
    } catch {
      return 0;
    }
  }
}
