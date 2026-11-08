import { createHash } from 'node:crypto';

export interface NoveltyQuestion {
  prompt: string;
  code?: string | null;
  codeLanguage?: string | null;
  /** Canonical key for the single idea a question tests, e.g. "https-encryption". */
  concept?: string | null;
}

/** Public-content hints used by both feed selection and the browser's final race check. */
export interface QuestionNovelty {
  version: 1;
  exact: string;
  tokens: string[];
  codeKey: string | null;
  /** Present when the question has a concept key. Same concept = same learning point. */
  concept?: string;
}

const CONCEPT = /^[a-z0-9]+(?:-[a-z0-9]+){0,7}$/;

/** Normalizes a model-supplied concept key, or returns null when it is unusable. */
export function normalizeConcept(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return CONCEPT.test(key) ? key : null;
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'to',
  'of',
  'in',
  'on',
  'at',
  'for',
  'from',
  'with',
  'without',
  'by',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'being',
  'been',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'you',
  'your',
  'we',
  'our',
  'they',
  'their',
  'does',
  'do',
  'did',
  'can',
  'could',
  'would',
  'should',
  'will',
  'why',
  'how',
  'what',
  'which',
  'when',
  'then',
  'than',
  'instead',
  'use',
  'uses',
  'using',
  'used',
  'choose',
  'select',
  'pick',
  'best',
  'correct',
  'explain',
  'explanation',
  'reason',
  'answer',
  'statement',
  'following',
  'most',
  'please',
  'standard',
  'secure',
  'plain',
  'unencrypted',
  'website',
  'site',
  'page',
  'login',
  'user',
  'over',
]);

const JAPANESE_BOILERPLATE =
  /なぜ|どうして|理由|説明|選択肢|選択|最も適切|適切|正しい|選んでください|答えてください|使/g;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function questionNovelty(question: NoveltyQuestion): QuestionNovelty {
  const prompt = normalize(question.prompt.slice(0, 3000));
  const content = prompt
    .replace(/\bc\+\+/g, 'cplusplus')
    .replace(/\bc#/g, 'csharp')
    .replace(
      /\b(?:transmitting|transmit|transmission|sending|send|handling|transferring|transfer)\b/g,
      'transmit',
    )
    .replace(/\bwebsites\b/g, 'website')
    .replace(/\brequests\b/g, 'request')
    .replace(/\busers\b/g, 'user')
    .replace(/\bprivate\b/g, 'personal')
    .replace(/個人データ/g, '個人情報')
    .replace(/送信|転送/g, '送る')
    .replace(/利用|使用/g, '使')
    .replace(JAPANESE_BOILERPLATE, ' ');
  const words =
    content.match(/[a-z][a-z0-9_+#]*(?:\.[a-z0-9_+#]+)*|\d+(?:\.\d+)?/g) ?? [];
  const tokens = words.filter((word) => !STOP_WORDS.has(word));
  // Named cookie flags are separate mechanisms even inside otherwise identical stems.
  if (/\bcookies?\b|クッキー/.test(prompt)) {
    for (const flag of ['secure', 'httponly', 'samesite']) {
      if (new RegExp(`\\b${flag}\\b`, 'i').test(prompt))
        tokens.push(`anchor:cookie-${flag}`);
    }
  }
  const japanese =
    content.match(/[\p{Script=Han}\p{Script=Katakana}ー]+/gu) ?? [];
  for (const word of japanese) {
    const characters = [...word];
    if (characters.length === 1) tokens.push(word);
    else
      for (let index = 0; index < characters.length - 1; index++) {
        tokens.push(characters[index] + characters[index + 1]);
      }
  }
  const concept = normalizeConcept(question.concept);
  return {
    ...(concept ? { concept } : {}),
    version: 1,
    exact: digest(prompt),
    tokens: [...new Set(tokens)].sort().slice(0, 120),
    codeKey: question.code
      ? digest(
          `${question.codeLanguage?.trim().toLowerCase() ?? ''}\n${question.code.replace(/\r\n?/g, '\n').trim()}`,
        )
      : null,
  };
}

export function similarQuestionHints(
  left: QuestionNovelty,
  right: QuestionNovelty,
): boolean {
  // Reworded or reformatted questions about the same idea still feel like a repeat.
  if (left.concept && left.concept === right.concept) return true;
  // A changed code example can test a different behavior despite the same short prompt.
  if (left.codeKey !== right.codeKey) return false;
  if (left.exact === right.exact) return true;
  const leftAnchors = left.tokens.filter((token) =>
    token.startsWith('anchor:'),
  );
  const rightAnchors = right.tokens.filter((token) =>
    token.startsWith('anchor:'),
  );
  if (
    leftAnchors.length !== rightAnchors.length ||
    leftAnchors.some((anchor) => !rightAnchors.includes(anchor))
  )
    return false;
  if (left.tokens.length < 4 || right.tokens.length < 4) return false;
  const terms = new Set(right.tokens);
  const overlap = left.tokens.filter((token) => terms.has(token)).length;
  return (2 * overlap) / (left.tokens.length + right.tokens.length) >= 0.72;
}

export function similarQuestions(
  left: NoveltyQuestion,
  right: NoveltyQuestion,
): boolean {
  return similarQuestionHints(questionNovelty(left), questionNovelty(right));
}

export function selectNovelQuestions<T extends NoveltyQuestion>(
  candidates: T[],
  previous: NoveltyQuestion[],
  limit: number,
): T[] {
  const hints = previous.map(questionNovelty);
  const selected: T[] = [];
  for (const question of candidates) {
    const hint = questionNovelty(question);
    if (hints.some((previous) => similarQuestionHints(hint, previous)))
      continue;
    selected.push(question);
    hints.push(hint);
    if (selected.length >= limit) break;
  }
  return selected;
}
