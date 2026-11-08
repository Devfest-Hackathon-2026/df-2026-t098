import { LoadingSkeleton } from '../learning/loading-skeleton';
import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthApi } from '../auth/auth-api';
import type { AuthFailure } from '../auth/auth-api';
import { authError } from '../auth/auth-copy';
import { AuthSession } from '../auth/auth-session';
import { validSignupPassword, validUsername } from '../auth/auth-validation';
import { questionReturnTo } from '../auth/auth-return';

const COPY = {
  ja: {
    title: 'アカウントを作成',
    intro: 'メールアドレスで登録して、学習を始めましょう。',
    email: 'メールアドレス',
    username: 'ユーザー名',
    password: 'パスワード',
    usernameHint: '3〜32文字。文字・数字・「.」「_」「-」が使えます。',
    passwordHint: '15〜128文字で設定してください。',
    submit: 'アカウントを作成',
    working: '作成しています…',
    signIn: 'ログインはこちら',
    back: '学習に戻る',
    checking: 'アカウントを確認しています…',
    connection: 'アカウントを確認できませんでした。接続を確認して再試行してください。',
    retry: '再試行',
    invalidEmail: '有効なメールアドレスを入力してください。',
    invalidUsername: 'ユーザー名は3〜32文字で、文字・数字・「.」「_」「-」を使ってください。',
    invalidPassword: 'パスワードは15〜128文字で入力してください。',
    light: 'ライトテーマに切り替え',
    dark: 'ダークテーマに切り替え',
    navigation: '学習画面に移動できませんでした。もう一度お試しください。',
  },
  en: {
    title: 'Create your account',
    intro: 'Sign up with email and start learning.',
    email: 'Email address',
    username: 'Username',
    password: 'Password',
    usernameHint: '3–32 letters, numbers, dots, underscores or hyphens.',
    passwordHint: 'Use 15–128 characters.',
    submit: 'Create account',
    working: 'Creating your account…',
    signIn: 'Already have an account? Sign in',
    back: 'Back to practice',
    checking: 'Checking your account…',
    connection: 'Could not check your account. Check your connection and try again.',
    retry: 'Try again',
    invalidEmail: 'Enter a valid email address.',
    invalidUsername: 'Use 3–32 letters, numbers, dots, underscores or hyphens.',
    invalidPassword: 'Use a password with 15–128 characters.',
    light: 'Switch to light theme',
    dark: 'Switch to dark theme',
    navigation: 'Could not open your practice. Please try again.',
  },
} as const;

@Component({
  selector: 'app-signup',
  imports: [RouterLink, LoadingSkeleton],
  templateUrl: './signup.html',
  styleUrls: ['../auth/auth-page.css', './signup.css'],
})
export class Signup {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected get returnTo(): string | null {
    return questionReturnTo(this.route.snapshot.queryParamMap?.get('returnTo'));
  }
  private readonly api = inject(AuthApi);
  protected readonly session = inject(AuthSession);
  private readonly win = this.document.defaultView;
  private readonly systemTheme = this.win?.matchMedia?.('(prefers-color-scheme: light)');
  private hasThemePreference = false;
  private redirecting = false;
  protected readonly language = signal<'ja' | 'en'>(
    this.readSetting('whylint-language') === 'en' ? 'en' : 'ja',
  );
  protected readonly theme = signal<'light' | 'dark'>('dark');
  protected readonly busy = signal(false);
  protected readonly fieldError = signal<'email' | 'username' | 'password' | null>(null);
  protected readonly failure = signal<AuthFailure | null>(null);
  protected readonly navigationFailed = signal(false);
  protected readonly draft = { email: signal(''), username: signal(''), password: signal('') };
  protected get ui() {
    return COPY[this.language()];
  }
  protected get errorMessage() {
    const reason = this.failure();
    return reason ? authError(reason, this.language(), 'signup') : '';
  }

  constructor() {
    const saved = this.readSetting('whylint-theme');
    this.hasThemePreference = saved === 'light' || saved === 'dark';
    this.theme.set(
      saved === 'light' || saved === 'dark' ? saved : this.systemTheme?.matches ? 'light' : 'dark',
    );
    this.applyPreferences();
    const onTheme = (event: MediaQueryListEvent) => {
      if (!this.hasThemePreference) {
        this.theme.set(event.matches ? 'light' : 'dark');
        this.applyPreferences();
      }
    };
    this.systemTheme?.addEventListener?.('change', onTheme);
    inject(DestroyRef).onDestroy(() => {
      this.systemTheme?.removeEventListener?.('change', onTheme);
      this.draft.password.set('');
    });
    effect(() => {
      if (this.session.status() === 'authenticated') void this.goToPractice();
    });
  }

  protected async submit(
    event: Event,
    email: HTMLInputElement,
    username: HTMLInputElement,
    password: HTMLInputElement,
  ): Promise<void> {
    event.preventDefault();
    if (this.busy() || this.session.status() !== 'guest') return;
    this.draft.email.set(email.value);
    this.draft.username.set(username.value);
    this.draft.password.set(password.value);
    this.failure.set(null);
    this.fieldError.set(null);
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.value.trim()) ||
      [...email.value.trim()].length > 254
    ) {
      this.fieldError.set('email');
      email.focus();
      return;
    }
    if (!validUsername(username.value)) {
      this.fieldError.set('username');
      username.focus();
      return;
    }
    if (!validSignupPassword(password.value)) {
      this.fieldError.set('password');
      password.focus();
      return;
    }
    this.busy.set(true);
    try {
      const result = await this.api.signup({
        email: email.value.trim(),
        username: username.value.trim(),
        password: password.value,
      });
      if (!result.ok) this.failure.set(result.reason);
      else {
        password.value = '';
        this.draft.password.set('');
        await this.goToPractice();
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected clearError(field: 'email' | 'username' | 'password', value: string): void {
    this.draft[field].set(value);
    if (this.fieldError() === field) this.fieldError.set(null);
    this.failure.set(null);
  }
  protected async retrySession(): Promise<void> {
    await this.session.refresh();
  }
  protected async goToPractice(): Promise<void> {
    if (this.redirecting || this.session.status() !== 'authenticated') return;
    this.redirecting = true;
    try {
      this.navigationFailed.set(
        !(await this.router.navigateByUrl(this.returnTo ?? '/', { replaceUrl: true })),
      );
    } catch {
      this.navigationFailed.set(true);
    } finally {
      this.redirecting = false;
    }
  }
  protected toggleTheme(): void {
    this.hasThemePreference = true;
    this.theme.set(this.theme() === 'light' ? 'dark' : 'light');
    this.writeSetting('whylint-theme', this.theme());
    this.applyPreferences();
  }
  private readSetting(key: string): string | null {
    try {
      return this.win?.localStorage.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  private writeSetting(key: string, value: string): void {
    try {
      this.win?.localStorage.setItem(key, value);
    } catch {
      /* Keep the in-memory preference. */
    }
  }
  private applyPreferences(): void {
    this.document.documentElement.lang = this.language();
    this.document.documentElement.dataset['theme'] = this.theme();
    this.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', this.theme() === 'light' ? '#f3f5f0' : '#080808');
  }
}
