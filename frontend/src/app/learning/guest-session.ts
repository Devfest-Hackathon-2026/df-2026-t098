import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import type { QuestionTap, TapResult } from './learning.types';

interface GuestState {
  answered: number;
  correct: number;
  combo: number;
  taps: Record<string, QuestionTap>;
  answers: GuestAnswer[];
  pending: Record<string, GuestImport>;
}

interface GuestAnswer {
  questionId: string;
  choice: number;
}

export interface GuestImport {
  requestId: string;
  answers: GuestAnswer[];
}

const KEY = 'whylint-guest-progress';
const MAX_TAPS = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function count(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1e6
    ? value
    : 0;
}

function validTap(value: unknown): value is QuestionTap {
  if (!value || typeof value !== 'object') return false;
  const tap = value as Partial<QuestionTap>;
  return (
    validChoice(tap.choice) &&
    Number.isInteger(tap.correctOption) &&
    typeof tap.correct === 'boolean' &&
    typeof tap.quickExplanation === 'string' &&
    tap.quickExplanation.length <= 4000
  );
}

function validChoice(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3;
}

function validAnswer(value: unknown): value is GuestAnswer {
  if (!value || typeof value !== 'object') return false;
  const answer = value as Partial<GuestAnswer>;
  return (
    typeof answer.questionId === 'string' &&
    UUID.test(answer.questionId) &&
    validChoice(answer.choice)
  );
}

/**
 * Keep a guest's answers in the current tab until the signed-in account receives them.
 */
@Injectable({ providedIn: 'root' })
export class GuestSession {
  private readonly document = inject(DOCUMENT);
  private state: GuestState | null = null;

  get counters(): { answered: number; correct: number; combo: number } {
    const { answered, correct, combo } = this.read();
    return { answered, correct, combo };
  }

  tapFor(questionId: string): QuestionTap | undefined {
    const tap = this.read().taps[questionId];
    return tap ? { ...tap } : undefined;
  }

  answeredIds(): string[] {
    return Object.keys(this.read().taps);
  }

  record(result: TapResult): void {
    if (!UUID.test(result.questionId) || !validChoice(result.choice)) return;
    const state = this.read();
    const answers = [...state.answers, { questionId: result.questionId, choice: result.choice }].slice(
      -MAX_TAPS,
    );
    const taps = {
      ...state.taps,
      [result.questionId]: {
        choice: result.choice,
        correct: result.correct,
        correctOption: result.correctOption,
        quickExplanation: result.quickExplanation,
      },
    };
    const kept = new Set(answers.map((answer) => answer.questionId));
    for (const id of Object.keys(taps)) if (!kept.has(id)) delete taps[id];
    this.write({
      ...state,
      answered: state.answered + 1,
      correct: state.correct + (result.correct ? 1 : 0),
      combo: result.correct ? state.combo + 1 : 0,
      taps,
      answers,
    });
  }

  beginImport(accountId: string): GuestImport | undefined {
    const state = this.read();
    if (state.pending[accountId]) return state.pending[accountId];
    if (!state.answers.length) return;
    const pending = { requestId: crypto.randomUUID(), answers: state.answers };
    this.write({
      answered: 0,
      correct: 0,
      combo: 0,
      taps: {},
      answers: [],
      pending: { ...state.pending, [accountId]: pending },
    });
    return pending;
  }

  finishImport(accountId: string, requestId: string): void {
    const state = this.read();
    if (state.pending[accountId]?.requestId !== requestId) return;
    const pending = { ...state.pending };
    delete pending[accountId];
    this.write({ ...state, pending });
  }

  private read(): GuestState {
    if (this.state) return this.state;
    const empty: GuestState = { answered: 0, correct: 0, combo: 0, taps: {}, answers: [], pending: {} };
    try {
      const raw = this.document.defaultView?.sessionStorage.getItem(KEY);
      const value: unknown = raw ? JSON.parse(raw) : null;
      if (value && typeof value === 'object') {
        const saved = value as Partial<GuestState>;
        const taps: Record<string, QuestionTap> = {};
        for (const [id, tap] of Object.entries(saved.taps ?? {}))
          if (UUID.test(id) && validTap(tap)) taps[id] = tap;
        const pending: Record<string, GuestImport> = {};
        for (const [id, batch] of Object.entries(saved.pending ?? {})) {
          if (
            UUID.test(id) &&
            batch &&
            typeof batch.requestId === 'string' &&
            UUID.test(batch.requestId) &&
            Array.isArray(batch.answers) &&
            batch.answers.length > 0 &&
            batch.answers.length <= MAX_TAPS &&
            batch.answers.every(validAnswer)
          )
            pending[id] = batch;
        }
        this.state = {
          answered: count(saved.answered),
          correct: count(saved.correct),
          combo: count(saved.combo),
          taps,
          answers: Array.isArray(saved.answers)
            ? saved.answers.filter(validAnswer).slice(-MAX_TAPS)
            : Object.entries(taps)
                .map(([questionId, tap]) => ({ questionId, choice: tap.choice }))
                .slice(-MAX_TAPS),
          pending,
        };
        return this.state;
      }
    } catch {
      // Corrupt or unavailable storage is treated as a fresh start.
    }
    this.state = empty;
    return empty;
  }

  private write(state: GuestState): void {
    this.state = state;
    try {
      this.document.defaultView?.sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Over quota or blocked: keep the in-memory copy only.
    }
  }
}
