import { inject, Injectable } from '@angular/core';
import { AUTH_FETCH } from '../auth/auth-session';

export class LearningError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

@Injectable({ providedIn: 'root' })
export class LearningApi {
  private readonly request = inject(AUTH_FETCH);

  async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.send<T>(path, 'GET', undefined, signal);
  }

  async send<T>(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const usesAi =
      path === '/feed/batches' ||
      path.endsWith('/attempts') ||
      path.endsWith('/follow-ups') ||
      (path === '/questions' && method === 'POST');
    const timeout = setTimeout(abort, usesAi ? 75_000 : path === '/guest-answers' ? 30_000 : 10_000);
    try {
      const response = await this.request(`/api/v1/learning${path}`, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status === 204) return undefined as T;
      const value = await response.json();
      if (!response.ok)
        throw new LearningError(
          response.status,
          typeof value?.code === 'string' ? value.code : 'REQUEST_FAILED',
        );
      return value as T;
    } catch (error) {
      if (error instanceof LearningError) throw error;
      throw new LearningError(0, controller.signal.aborted ? 'REQUEST_CANCELLED' : 'UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
}

export function learningError(error: unknown, language: 'ja' | 'en'): string {
  const failure = error instanceof LearningError ? error : new LearningError(0, 'UNAVAILABLE');
  if (failure.status === 401)
    return language === 'ja' ? '続けるにはログインしてください。' : 'Sign in to continue.';
  if (failure.code === 'AI_NOT_CONFIGURED')
    return language === 'ja'
      ? 'AI学習の準備中です。準備ができたら、もう一度お試しください。'
      : 'AI learning is being connected. Please try again once it is ready.';
  if (failure.code === 'ANSWER_FIRST')
    return language === 'ja'
      ? 'まず問題に答えてから質問しましょう。'
      : 'Answer the question first, then ask a follow-up.';
  if (failure.code === 'FOLLOW_UP_LIMIT')
    return language === 'ja'
      ? 'この問題への質問は今日の上限に達しました。'
      : 'You have reached today’s follow-up limit for this question.';
  if (failure.code === 'REQUEST_IN_PROGRESS')
    return language === 'ja'
      ? 'まだ処理中です。少し待ってから再試行してください。'
      : 'This request is still processing. Wait a moment, then retry.';
  if (failure.code === 'REQUEST_MISMATCH')
    return language === 'ja'
      ? '学習設定が変わりました。再試行して、新しい問題を準備してください。'
      : 'Your learning preferences changed. Retry to prepare a fresh batch.';
  if (failure.status === 429)
    return language === 'ja'
      ? 'リクエストが多いため、少し待ってから再試行してください。'
      : 'Too many requests. Wait a moment, then retry.';
  if (failure.status === 400 || failure.status === 422)
    return language === 'ja'
      ? '内容を確認して、もう一度お試しください。質問は技術に関する内容と説明を含めてください。'
      : 'Check your input and try again. Questions need a technical topic and a reference explanation.';
  return language === 'ja'
    ? '読み込みに失敗しました。入力はそのままで、もう一度お試しください。'
    : 'Something went wrong. Your input is still here. Please try again.';
}
