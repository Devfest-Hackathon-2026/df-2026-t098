import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
export type Domain = 'frontend' | 'backend' | 'database';
export const STACKS: Record<Domain, { id: string; label: string; available: boolean }[]> = {
  frontend: [
    { id: 'javascript', label: 'JavaScript', available: true },
    { id: 'typescript', label: 'TypeScript', available: false },
    { id: 'react', label: 'React', available: false },
    { id: 'angular', label: 'Angular', available: false },
    { id: 'vue', label: 'Vue.js', available: false },
  ],
  backend: [
    { id: 'python', label: 'Python', available: false },
    { id: 'java', label: 'Java', available: false },
    { id: 'nodejs', label: 'TypeScript / Node.js', available: false },
    { id: 'sql', label: 'SQL', available: false },
    { id: 'go', label: 'Go', available: false },
  ],
  database: [
    { id: 'sql', label: 'SQL', available: false },
    { id: 'postgresql', label: 'PostgreSQL', available: false },
    { id: 'mysql', label: 'MySQL', available: false },
  ],
};
export interface LearningPreference { domain: Domain; stack: string; onboardingCompleted: true; }
@Injectable({ providedIn: 'root' })
export class OnboardingState {
  private readonly document = inject(DOCUMENT);
  private readonly key = 'whylint-onboarding-v1';
  read(): LearningPreference | null {
    try {
      const raw = this.document.defaultView?.localStorage.getItem(this.key);
      if (!raw) return null;
      const value: unknown = JSON.parse(raw);
      return this.isValid(value) ? value : null;
    } catch { return null; }
  }
  save(domain: Domain, stack: string): boolean {
    const value: LearningPreference = { domain, stack, onboardingCompleted: true };
    if (!this.isValid(value)) return false;
    try {
      const storage = this.document.defaultView?.localStorage;
      if (!storage) return false;
      storage.setItem(this.key, JSON.stringify(value));
      return true;
    } catch { return false; }
  }
  private isValid(value: unknown): value is LearningPreference {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    const domain = record['domain'];
    return record['onboardingCompleted'] === true && (domain === 'frontend' || domain === 'backend' || domain === 'database') &&
      STACKS[domain].some(option => option.id === record['stack'] && option.available);
  }
}
