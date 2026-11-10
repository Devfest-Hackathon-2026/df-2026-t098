import { DatePipe } from '@angular/common';
import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AUTH_FETCH, AuthSession } from '../auth/auth-session';
import { Brand } from '../brand/brand';
import { DisplaySettings } from '../learning/display-settings';

interface Report {
  id: string;
  type: 'question' | 'comment';
  reason: string;
  details: string;
  status: 'open' | 'resolved';
  created_at: string;
  question_id: string;
  question_title: string;
  question_prompt: string;
  comment_text: string | null;
  reporter: string | null;
}

@Component({
  selector: 'app-admin-page',
  imports: [Brand, DatePipe, FormsModule, RouterLink],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class AdminPage {
  protected readonly session = inject(AuthSession);
  protected readonly settings = inject(DisplaySettings);
  private readonly request = inject(AUTH_FETCH);

  protected readonly state = signal<'loading' | 'login' | 'denied' | 'ready' | 'error'>('loading');
  protected readonly reports = signal<Report[]>([]);
  protected readonly status = signal<'open' | 'resolved'>('open');
  protected readonly offset = signal(0);
  protected readonly hasMore = signal(false);
  protected readonly busy = signal(false);
  protected readonly refreshing = signal(false);
  protected readonly error = signal('');
  protected readonly feedback = signal('');
  @ViewChild('openTab') private openTab?: ElementRef<HTMLButtonElement>;
  @ViewChild('resolvedTab') private resolvedTab?: ElementRef<HTMLButtonElement>;
  protected username = '';
  protected password = '';

  constructor() {
    void this.start();
  }

  protected text(ja: string, en: string): string {
    return this.settings.language() === 'ja' ? ja : en;
  }

  protected reason(value: string): string {
    const labels: Record<string, [string, string]> = {
      incorrect: ['答えや説明が違う', 'Incorrect answer or explanation'],
      unclear: ['内容が分かりにくい', 'Unclear wording'],
      outdated: ['情報が古い', 'Outdated information'],
      inappropriate: ['不適切な内容', 'Inappropriate content'],
      spam: ['スパム', 'Spam'],
      harassment: ['嫌がらせ', 'Harassment'],
      other: ['その他', 'Other'],
    };
    const label = labels[value];
    return label ? this.text(label[0], label[1]) : value;
  }

  private async start(): Promise<void> {
    await this.session.refresh();
    if (this.session.status() === 'authenticated') await this.load();
    else this.state.set(this.session.status() === 'guest' ? 'login' : 'error');
  }

  protected async login(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const response = await this.request('/api/v1/auth/password/login', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: this.username, password: this.password }),
      });
      this.password = '';
      if (!response.ok) {
        this.error.set(
          this.text(
            'ログインできませんでした。入力内容を確認してください。',
            'Sign-in failed. Check your credentials and try again.',
          ),
        );
        return;
      }
      await this.session.refresh();
      if (this.session.status() === 'authenticated') await this.load();
      else this.state.set('error');
    } catch {
      this.password = '';
      this.error.set(
        this.text(
          '接続できませんでした。もう一度お試しください。',
          'Could not connect. Please try again.',
        ),
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async load(): Promise<void> {
    if (this.state() !== 'ready') this.state.set('loading');
    this.refreshing.set(true);
    this.error.set('');
    try {
      const params = new URLSearchParams({ status: this.status(), offset: String(this.offset()) });
      const response = await this.request('/api/v1/admin/reports?' + params, {
        credentials: 'same-origin',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
      if (response.status === 401) {
        this.state.set('login');
        return;
      }
      if (response.status === 403) {
        this.state.set('denied');
        return;
      }
      if (!response.ok) throw new Error('Report list failed');
      const result = (await response.json()) as { reports: Report[]; hasMore: boolean };
      this.reports.set(result.reports);
      this.hasMore.set(result.hasMore);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    } finally {
      this.refreshing.set(false);
    }
  }

  protected async select(status: 'open' | 'resolved'): Promise<void> {
    if (this.busy() || this.refreshing() || status === this.status()) return;
    this.feedback.set('');
    this.status.set(status);
    this.offset.set(0);
    await this.load();
  }

  protected async page(change: number): Promise<void> {
    if (this.busy() || this.refreshing()) return;
    this.feedback.set('');
    this.offset.update((offset) => Math.max(0, offset + change));
    await this.load();
    this.focusActiveTab();
  }

  protected async updateStatus(report: Report, event: Event): Promise<void> {
    if (this.busy() || this.refreshing()) return;
    const button = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    let updated = false;
    this.busy.set(true);
    this.error.set('');
    this.feedback.set('');
    try {
      const response = await this.request(
        `/api/v1/admin/reports/${report.type}/${report.id}/${report.status === 'open' ? 'resolve' : 'reopen'}`,
        {
          method: 'PATCH',
          credentials: 'same-origin',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
        },
      );
      if (response.status === 409) {
        this.error.set(
          this.text(
            '同じ内容の新しい報告が未対応です。',
            'A newer report for this issue is already open.',
          ),
        );
        return;
      }
      if (!response.ok) throw new Error('Update failed');
      if (this.reports().length === 1 && this.offset() > 0)
        this.offset.update((offset) => offset - 50);
      await this.load();
      this.feedback.set(
        report.status === 'open'
          ? this.text('報告を対応済みにしました。', 'Report marked as resolved.')
          : this.text('報告を未対応に戻しました。', 'Report reopened.'),
      );
      updated = true;
      this.focusActiveTab();
    } catch {
      this.error.set(
        this.text(
          '更新できませんでした。もう一度お試しください。',
          'Could not update the report. Please try again.',
        ),
      );
    } finally {
      this.busy.set(false);
      if (!updated) requestAnimationFrame(() => button?.focus());
    }
  }

  private focusActiveTab(): void {
    const tab = this.status() === 'open' ? this.openTab : this.resolvedTab;
    requestAnimationFrame(() => tab?.nativeElement.focus());
  }

  protected async logout(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      if (await this.session.logout()) {
        this.reports.set([]);
        this.username = '';
        this.state.set('login');
      } else {
        this.error.set(
          this.text(
            'ログアウトできませんでした。再試行してください。',
            'Could not sign out. Please try again.',
          ),
        );
      }
    } finally {
      this.busy.set(false);
    }
  }
}
