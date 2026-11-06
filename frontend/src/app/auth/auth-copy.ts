import type { AuthFailure } from './auth-api';

const COPY = {
  ja: {
    invalid: '入力内容を確認して、もう一度お試しください。',
    conflict: 'このメールアドレスまたはユーザー名は使用できません。',
    usernameConflict: 'このユーザー名は使用できないか、すでに設定されています。別の名前を試すか、画面を再読み込みしてください。',
    unauthorized: 'ログインの有効期限が切れました。もう一度ログインしてください。',
    credentials: 'メールアドレス・ユーザー名またはパスワードを確認してください。',
    rateLimit: '試行回数が多いため、少し待ってからもう一度お試しください。',
    unavailable: '処理を完了できませんでした。接続を確認して、もう一度お試しください。',
  },
  en: {
    invalid: 'Check your details and try again.',
    conflict: 'This email or username is unavailable.',
    usernameConflict: 'This username is unavailable or already set. Try another name or reload your profile.',
    unauthorized: 'Your session has expired. Please sign in again.',
    credentials: 'Check your email or username and password.',
    rateLimit: 'Too many attempts. Wait a little and try again.',
    unavailable: 'Could not finish the request. Check your connection and try again.',
  },
} as const;

export function authError(reason: AuthFailure, language: 'ja' | 'en', action: 'signup' | 'login' | 'username'): string {
  const key = reason === 'conflict' && action === 'username' ? 'usernameConflict'
    : reason === 'unauthorized' && action === 'login' ? 'credentials' : reason;
  return COPY[language][key];
}
