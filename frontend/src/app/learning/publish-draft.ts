import { Injectable } from '@angular/core';
import type { Difficulty } from './learning.types';

export interface PublishDraft {
  title: string;
  prompt: string;
  referenceAnswer: string;
  code: string;
  codeLanguage: string;
  topic: string;
  difficulty: Difficulty;
  options: string[];
  correctOption: number | null;
  requestId: string;
  submittedPayload: string;
}

@Injectable({ providedIn: 'root' })
export class PublishDraftStore {
  private owner: string | null = null;
  private draft: PublishDraft | null = null;

  save(owner: string, draft: PublishDraft): void {
    this.owner = owner;
    this.draft = draft;
  }

  take(owner: string | null): PublishDraft | null {
    const draft = owner && owner === this.owner ? this.draft : null;
    this.clear();
    return draft;
  }

  clear(): void {
    this.owner = null;
    this.draft = null;
  }
}
