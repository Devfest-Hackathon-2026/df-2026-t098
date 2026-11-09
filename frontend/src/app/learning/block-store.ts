import { inject, Injectable, signal } from '@angular/core';
import { AuthSession } from '../auth/auth-session';
import { LearningApi } from './learning-api';
import type { Author } from './learning.types';

/** The signed-in learner's blocked users. The server also hides their content. */
@Injectable({ providedIn: 'root' })
export class BlockStore {
  private readonly api = inject(LearningApi);
  private readonly session = inject(AuthSession);
  private owner: string | null = null;
  readonly blocked = signal<Author[]>([]);
  readonly loading = signal(false);
  /** The newest block, for views (the feed) that must hide that learner's questions at once. */
  readonly lastBlocked = signal<{ id: string; name: string; seq: number } | null>(null);
  /** Counts unblocks so the feed reloads and the learner's questions can return. */
  readonly unblockCount = signal(0);
  private seq = 0;

  isBlocked(userId: string): boolean {
    return this.blocked().some((user) => user.id === userId);
  }

  async load(): Promise<void> {
    const owner = this.session.user()?.id ?? null;
    this.owner = owner;
    if (!owner) {
      this.blocked.set([]);
      return;
    }
    this.loading.set(true);
    try {
      const result = await this.api.get<{ users: Author[] }>('/blocks');
      if (this.owner === owner) this.blocked.set(Array.isArray(result.users) ? result.users : []);
    } finally {
      if (this.owner === owner) this.loading.set(false);
    }
  }

  async block(user: Author): Promise<void> {
    await this.api.send('/blocks/' + user.id, 'PUT');
    this.blocked.update((users) =>
      users.some((entry) => entry.id === user.id) ? users : [user, ...users],
    );
    this.lastBlocked.set({ id: user.id, name: user.displayName, seq: ++this.seq });
  }

  async unblock(userId: string): Promise<void> {
    await this.api.send('/blocks/' + userId, 'DELETE');
    this.blocked.update((users) => users.filter((user) => user.id !== userId));
    this.unblockCount.update((count) => count + 1);
  }
}
