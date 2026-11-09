import { computed, inject, Injectable, signal } from '@angular/core';
import { AUTH_FETCH } from '../auth/auth-session';

/** An http(s) URL without credentials, trailing slash removed; anything else is dropped. */
export function safeBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return (url.origin + url.pathname).replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * Where the owner published the legal documents, and how learners reach support. Both are
 * deployment configuration served by the backend (LEGAL_BASE_URL, SUPPORT_CONTACT); the app
 * carries no policy text of its own, and shows nothing for a value that is not configured.
 */
@Injectable({ providedIn: 'root' })
export class PublicConfig {
  private readonly request = inject(AUTH_FETCH);
  private readonly base = signal<string | null>(null);
  private pending: Promise<void> | null = null;
  readonly supportContact = signal<string | null>(null);
  readonly privacyUrl = computed(() => (this.base() ? this.base() + '/privacy' : null));
  readonly termsUrl = computed(() => (this.base() ? this.base() + '/terms' : null));

  load(): Promise<void> {
    this.pending ??= this.fetchConfig();
    return this.pending;
  }

  private async fetchConfig(): Promise<void> {
    try {
      const response = await this.request('/api/v1/config', {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error('config unavailable');
      const value: { legalBaseUrl?: unknown; supportContact?: unknown } = await response.json();
      this.base.set(safeBaseUrl(value.legalBaseUrl));
      const contact = typeof value.supportContact === 'string' ? value.supportContact.trim() : '';
      this.supportContact.set(contact && contact.length <= 120 ? contact : null);
    } catch {
      // Try again the next time a screen asks.
      this.pending = null;
    }
  }
}

/** A mailto: link when the contact is an email address, a web link when it is a URL. */
export function contactHref(contact: string): string | null {
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact)) return 'mailto:' + contact;
  return safeBaseUrl(contact) === null ? null : contact;
}
