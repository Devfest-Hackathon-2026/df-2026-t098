export function questionReturnTo(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(
    /^\/questions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\?explain=1)?$/i,
  );
  return match ? `/questions/${match[1].toLowerCase()}${match[2] ? '?explain=1' : ''}` : null;
}

const RETURN_KEY = 'whylint-google-auth-return';

export function saveQuestionReturn(
  storage: Storage,
  state: string,
  destination: string | null,
): void {
  const valid = questionReturnTo(destination);
  if (valid) storage.setItem(RETURN_KEY, JSON.stringify({ state, destination: valid }));
  else storage.removeItem(RETURN_KEY);
}

export function takeQuestionReturn(storage: Storage, state: string | null): string | null {
  const saved = storage.getItem(RETURN_KEY);
  storage.removeItem(RETURN_KEY);
  if (!saved || !state) return null;
  try {
    const value: unknown = JSON.parse(saved);
    if (!value || typeof value !== 'object') return null;
    const intent = value as { state?: unknown; destination?: unknown };
    return intent.state === state ? questionReturnTo(intent.destination) : null;
  } catch {
    return null;
  }
}
