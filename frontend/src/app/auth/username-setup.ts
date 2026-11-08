import { Component, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthApi, AuthFailure } from './auth-api';
import { AuthSession } from './auth-session';
import { authError } from './auth-copy';
import { validUsername } from './auth-validation';

const COPY = {
  ja: {
    label: 'ユーザー名（任意）',
    hint: '3〜32文字。文字・数字・「.」「_」「-」が使えます。あとでプロフィールからも設定できます。',
    save: 'ユーザー名を保存',
    saving: '保存中…',
    invalid: 'ユーザー名は3〜32文字で、文字・数字・「.」「_」「-」を使ってください。',
    saved: 'ユーザー名を保存しました。',
    signIn: 'ログインし直す',
    retry: 'アカウントを再確認',
  },
  en: {
    label: 'Username (optional)',
    hint: '3–32 characters. Use letters, numbers, dots, underscores or hyphens. You can also set it later in Profile.',
    save: 'Save username',
    saving: 'Saving…',
    invalid: 'Use 3–32 letters, numbers, dots, underscores or hyphens.',
    saved: 'Username saved.',
    signIn: 'Sign in again',
    retry: 'Check account again',
  },
} as const;

@Component({
  selector: 'app-username-setup',
  imports: [RouterLink],
  templateUrl: './username-setup.html',
  styleUrl: './username-setup.css',
})
export class UsernameSetup {
  readonly language = input<'ja' | 'en'>('ja');
  readonly showSaveButton = input(true);
  readonly showRecoveryActions = input(true);
  readonly inputId = input('account-username');
  readonly saving = signal(false);
  private readonly api = inject(AuthApi);
  protected readonly session = inject(AuthSession);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  protected readonly username = signal('');
  protected readonly error = signal<AuthFailure | 'username' | null>(null);
  protected readonly saved = signal(false);
  protected get ui() {
    return COPY[this.language()];
  }
  protected get errorMessage() {
    const error = this.error();
    return error === 'username'
      ? this.ui.invalid
      : error
        ? authError(error, this.language(), 'username')
        : '';
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    await this.saveIfEntered(false);
  }

  protected async retrySession(): Promise<void> {
    if (await this.session.refresh()) this.error.set(null);
    else this.error.set(this.session.status() === 'guest' ? 'unauthorized' : 'unavailable');
  }

  hasInputToSave(): boolean {
    return (
      this.session.status() === 'authenticated' &&
      !this.session.user()?.username &&
      !!this.username().trim()
    );
  }

  async saveIfEntered(allowEmpty = true): Promise<boolean> {
    if (this.saving()) return false;
    if (this.session.status() !== 'authenticated' || this.session.user()?.username) return true;
    const username = this.username().trim();
    if (!username && allowEmpty) return true;
    if (!validUsername(username)) {
      this.error.set('username');
      this.field()?.nativeElement.focus();
      return false;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.api.setUsername(username);
      if (!result.ok) {
        this.error.set(result.reason);
        return false;
      }
      this.saved.set(true);
      return true;
    } finally {
      this.saving.set(false);
    }
  }
}
