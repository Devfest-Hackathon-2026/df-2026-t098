import { LoadingSkeleton } from '../learning/loading-skeleton';
import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthSession } from '../auth/auth-session';
import { AuthApi } from '../auth/auth-api';
import type { AuthFailure } from '../auth/auth-api';
import { authError } from '../auth/auth-copy';
import { CALLBACK_PATH, createAuthorizationUrl, readCallback, STATE_KEY } from './oauth-flow';
import { questionReturnTo, saveQuestionReturn, takeQuestionReturn } from '../auth/auth-return';

// Google OAuth client IDs are public. Never put a client secret in the frontend.
const GOOGLE_WEB_CLIENT_ID =
  '8715935974-egdfj9tf8e1p71jjr2befadf47cne86l.apps.googleusercontent.com';
const GOOGLE_LOGIN_ALLOWED_ORIGINS: readonly string[] = [
  'http://localhost:4200',
  'https://whylint-8715935974.asia-northeast1.run.app',
];
const GOOGLE_EXCHANGE_TIMEOUT_MS = 10_000;

type Language = 'ja' | 'en';
type Theme = 'light' | 'dark';
type Phase = 'ready' | 'working' | 'signed-in' | 'error';
type ErrorKey = 'origin' | 'cancelled' | 'invalid' | 'storage' | 'api' | 'restart';
type PasswordStatus =
  'missingIdentifier' | 'missingPassword' | 'invalidPassword' | 'passwordFailed' | null;

const COPY = {
  ja: {
    back: '学習に戻る',
    title: 'ログイン',
    intro: 'ログインして、学習を続けましょう。',
    identifierLabel: 'メールアドレスまたはユーザー名',
    passwordLabel: 'パスワード',
    passwordSignIn: 'ログイン',
    or: 'または',
    passwordNotice: 'メールアドレスまたはユーザー名でログインできます。',
    signup: 'アカウントを作成',
    passwordWorking: 'ログイン中…',
    invalidPassword: 'パスワードは128文字以内で入力してください。',
    missingIdentifier: 'メールアドレスまたはユーザー名を入力してください。',
    missingPassword: 'パスワードを入力してください。',
    passwordUnavailable: '現在はGoogleでログインしてください。',
    submit: 'Googleで続ける',
    waiting: 'ログインを確認しています…',
    redirecting: '学習画面に移動しています…',
    connection: 'アカウントを確認できませんでした。接続を確認して再試行してください。',
    retry: '再試行',
    navigationError: '学習画面に移動できませんでした。もう一度お試しください。',
    done: 'ログインできました',
    doneDetail: '学習を続けましょう。',
    origin: 'この環境ではGoogleログインを利用できません。',
    cancelled: 'Googleでのログインがキャンセルされました。',
    invalid: 'ログインを確認できませんでした。もう一度お試しください。',
    storage: 'ログインを開始できませんでした。ブラウザの設定を確認してください。',
    api: 'ログインを確認できませんでした。時間をおいてもう一度お試しください。',
    restart: 'Googleログインを最初からやり直してください。',
    light: 'ライトテーマに切り替え',
    dark: 'ダークテーマに切り替え',
  },
  en: {
    back: 'Back to practice',
    title: 'Sign in',
    intro: 'Sign in and continue learning with WhyLint.',
    identifierLabel: 'Email or username',
    passwordLabel: 'Password',
    passwordSignIn: 'Sign in',
    or: 'or',
    passwordNotice: 'Sign in with your email address or username.',
    signup: 'Create an account',
    passwordWorking: 'Signing in…',
    invalidPassword: 'Use a password with at most 128 characters.',
    missingIdentifier: 'Enter your email or username.',
    missingPassword: 'Enter your password.',
    passwordUnavailable: 'For now, please continue with Google.',
    submit: 'Continue with Google',
    waiting: 'Checking your sign-in…',
    redirecting: 'Taking you to your practice…',
    connection: 'Could not check your account. Check your connection and try again.',
    retry: 'Try again',
    navigationError: 'Could not open your practice. Please try again.',
    done: 'You’re signed in',
    doneDetail: 'Ready to keep learning?',
    origin: 'Google sign-in is not available in this environment.',
    cancelled: 'Google sign-in was cancelled.',
    invalid: 'We could not verify this sign-in. Please try again.',
    storage: 'Could not start sign-in. Check your browser settings and try again.',
    api: 'Could not complete sign-in. Please try again in a moment.',
    restart: 'Please start Google sign-in again.',
    light: 'Switch to light theme',
    dark: 'Switch to dark theme',
  },
} as const;

@Component({
  selector: 'app-google-login',
  imports: [RouterLink, LoadingSkeleton],
  templateUrl: './google-login.html',
  styleUrl: './google-login.css',
})
export class GoogleLogin implements OnInit {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private callbackReturn: string | null = null;
  protected get returnTo(): string | null {
    return (
      questionReturnTo(this.route.snapshot.queryParamMap?.get('returnTo')) ?? this.callbackReturn
    );
  }
  protected readonly session = inject(AuthSession);
  private readonly api = inject(AuthApi);
  protected readonly passwordBusy = signal(false);
  private readonly passwordFailure = signal<AuthFailure>('unavailable');
  protected get passwordError() {
    return authError(this.passwordFailure(), this.language(), 'login');
  }
  private readonly win = this.document.defaultView;
  private readonly isCallback = this.route.snapshot.routeConfig?.path === 'auth/google/callback';
  private readonly callbackSettled = signal(false);
  private redirecting = false;
  private destroyed = false;
  private exchangeController: AbortController | null = null;
  private hasThemePreference = false;
  protected readonly language = signal<Language>('ja');
  protected readonly theme = signal<Theme>('dark');
  protected readonly phase = signal<Phase>('ready');
  protected readonly error = signal<ErrorKey | null>(null);
  protected readonly redirectFailed = signal(false);
  protected readonly passwordStatus = signal<PasswordStatus>(null);
  protected get ui() {
    return COPY[this.language()];
  }

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.exchangeController?.abort();
    });
    effect(() => {
      if (
        this.session.status() === 'authenticated' &&
        (!this.isCallback || this.callbackSettled())
      ) {
        void this.redirectToMain();
      }
    });
  }

  ngOnInit(): void {
    if (!this.win) return;
    const systemTheme = this.win.matchMedia?.('(prefers-color-scheme: light)');
    try {
      this.language.set(this.win.localStorage.getItem('whylint-language') === 'en' ? 'en' : 'ja');
      const savedTheme = this.win.localStorage.getItem('whylint-theme');
      this.hasThemePreference = savedTheme === 'light' || savedTheme === 'dark';
      this.theme.set(
        savedTheme === 'light' || savedTheme === 'dark'
          ? savedTheme
          : systemTheme?.matches
            ? 'light'
            : 'dark',
      );
    } catch {
      this.theme.set(systemTheme?.matches ? 'light' : 'dark');
    }
    const onSystemThemeChange = (event: MediaQueryListEvent) => {
      if (!this.hasThemePreference) {
        this.theme.set(event.matches ? 'light' : 'dark');
        this.applyTheme();
      }
    };
    systemTheme?.addEventListener?.('change', onSystemThemeChange);
    this.destroyRef.onDestroy(() =>
      systemTheme?.removeEventListener?.('change', onSystemThemeChange),
    );
    this.applyTheme();
    this.document.documentElement.lang = this.language();
    if (this.isCallback) void this.finishSignIn();
  }

  protected toggleTheme(): void {
    this.theme.set(this.theme() === 'dark' ? 'light' : 'dark');
    this.hasThemePreference = true;
    this.applyTheme();
    try {
      this.win?.localStorage.setItem('whylint-theme', this.theme());
    } catch {
      /* Keep session setting. */
    }
  }

  private applyTheme(): void {
    this.document.documentElement.dataset['theme'] = this.theme();
    this.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', this.theme() === 'light' ? '#f3f5f0' : '#080808');
  }

  protected async submitPassword(
    event: Event,
    identifier: HTMLInputElement,
    password: HTMLInputElement,
  ): Promise<void> {
    event.preventDefault();
    if (this.session.status() !== 'guest' || this.passwordBusy()) return;
    if (!identifier.value.trim()) {
      this.passwordStatus.set('missingIdentifier');
      identifier.focus();
      return;
    }
    if (!password.value) {
      this.passwordStatus.set('missingPassword');
      password.focus();
      return;
    }
    if ([...password.value].length > 128) {
      this.passwordStatus.set('invalidPassword');
      password.focus();
      return;
    }
    this.passwordStatus.set(null);
    this.passwordBusy.set(true);
    try {
      const result = await this.api.passwordLogin(identifier.value.trim(), password.value);
      if (!result.ok) {
        this.passwordFailure.set(result.reason);
        this.passwordStatus.set('passwordFailed');
      } else {
        password.value = '';
        await this.redirectToMain();
      }
    } finally {
      this.passwordBusy.set(false);
    }
  }

  protected clearPasswordStatus(field: 'identifier' | 'password', input: HTMLInputElement): void {
    const status = this.passwordStatus();
    if (
      status === 'passwordFailed' ||
      status === 'invalidPassword' ||
      (field === 'identifier' && status === 'missingIdentifier' && input.value.trim().length > 0) ||
      (field === 'password' && status === 'missingPassword' && input.value.length > 0)
    ) {
      this.passwordStatus.set(null);
    }
  }

  protected startSignIn(): void {
    if (
      !this.win ||
      this.session.status() !== 'guest' ||
      this.passwordBusy() ||
      this.phase() === 'working'
    ) {
      return;
    }
    this.error.set(null);
    if (!this.isSupportedOrigin()) {
      this.showError('origin');
      return;
    }
    try {
      const state = Array.from(this.win.crypto.getRandomValues(new Uint8Array(32)), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      this.win.sessionStorage.setItem(STATE_KEY, state);
      saveQuestionReturn(this.win.sessionStorage, state, this.returnTo);
      this.win.location.assign(
        createAuthorizationUrl(GOOGLE_WEB_CLIENT_ID, this.win.location.origin, state),
      );
    } catch {
      this.showError('storage');
    }
  }

  private async finishSignIn(): Promise<void> {
    if (!this.win) return;
    const search = this.win.location.search;
    this.win.history.replaceState(this.win.history.state, '', '/login');
    let expectedState: string | null;
    let intendedReturn: string | null;
    try {
      expectedState = this.win.sessionStorage.getItem(STATE_KEY);
      this.win.sessionStorage.removeItem(STATE_KEY);
      intendedReturn = takeQuestionReturn(this.win.sessionStorage, expectedState);
    } catch {
      await this.finishCallbackWithError('storage');
      return;
    }
    if (!this.isSupportedOrigin()) {
      await this.finishCallbackWithError('origin');
      return;
    }
    const result = readCallback(search, expectedState);
    if (result.kind !== 'invalid') {
      this.callbackReturn = intendedReturn;
      if (this.returnTo) {
        this.win.history.replaceState(
          this.win.history.state,
          '',
          '/login?' + new URLSearchParams({ returnTo: this.returnTo }),
        );
      }
    }
    if (result.kind === 'cancelled') {
      await this.finishCallbackWithError('cancelled');
      return;
    }
    if (result.kind !== 'code') {
      await this.finishCallbackWithError('invalid');
      return;
    }

    this.phase.set('working');
    try {
      const alreadyAuthenticated = await this.session.refresh();
      if (this.destroyed) return;
      if (alreadyAuthenticated) {
        this.callbackSettled.set(true);
        await this.redirectToMain();
        if (!this.destroyed) this.phase.set('signed-in');
        return;
      }
      if (this.session.status() !== 'guest') {
        this.callbackSettled.set(true);
        this.showError('restart');
        return;
      }
      const login = await this.exchangeCode(result.code);
      if (this.destroyed) return;
      if (!login.ok) {
        await this.finishCallbackWithError(login.status >= 500 ? 'api' : 'invalid');
        return;
      }
      const authenticated = await this.session.refresh();
      if (this.destroyed) return;
      if (!authenticated) {
        this.callbackSettled.set(true);
        this.showError('api');
        return;
      }
      this.callbackSettled.set(true);
      await this.redirectToMain();
      if (!this.destroyed) this.phase.set('signed-in');
    } catch {
      if (!this.destroyed) await this.finishCallbackWithError('api');
    }
  }

  private async exchangeCode(code: string): Promise<Response> {
    if (!this.win) throw new Error('Browser is unavailable');
    const controller = new AbortController();
    this.exchangeController = controller;
    let onAbort: (() => void) | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new Error('Sign-in request cancelled'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const timeout = setTimeout(() => controller.abort(), GOOGLE_EXCHANGE_TIMEOUT_MS);
    try {
      return await Promise.race([
        this.win.fetch('/api/v1/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          referrerPolicy: 'no-referrer',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
          signal: controller.signal,
        }),
        cancelled,
      ]);
    } finally {
      clearTimeout(timeout);
      if (onAbort) controller.signal.removeEventListener('abort', onAbort);
      if (this.exchangeController === controller) this.exchangeController = null;
    }
  }

  private async finishCallbackWithError(message: ErrorKey): Promise<void> {
    this.phase.set('working');
    const authenticated = await this.session.refresh();
    if (this.destroyed) return;
    if (authenticated) {
      this.callbackSettled.set(true);
      await this.redirectToMain();
      return;
    }
    this.callbackSettled.set(true);
    this.showError(message);
  }

  protected async retrySession(): Promise<void> {
    const authenticated = await this.session.refresh();
    if (!this.destroyed && authenticated) await this.redirectToMain();
  }

  protected retryRedirect(): void {
    void this.redirectToMain();
  }

  private async redirectToMain(): Promise<void> {
    if (this.redirecting || this.destroyed || this.session.status() !== 'authenticated') return;
    this.redirecting = true;
    this.redirectFailed.set(false);
    try {
      if (
        !(await this.router.navigateByUrl(this.returnTo ?? '/', { replaceUrl: true })) &&
        !this.destroyed
      )
        this.redirectFailed.set(true);
    } catch {
      if (!this.destroyed) this.redirectFailed.set(true);
    } finally {
      this.redirecting = false;
    }
  }

  private isSupportedOrigin(): boolean {
    return !!this.win && GOOGLE_LOGIN_ALLOWED_ORIGINS.includes(this.win.location.origin);
  }

  private showError(message: ErrorKey): void {
    this.error.set(message);
    this.phase.set('error');
  }
}
