import type { QuestionNovelty } from './learning.types';

const HASH = /^[a-f0-9]{64}$/;
const CONCEPT = /^[a-z0-9]+(?:-[a-z0-9]+){0,7}$/;

/** Unknown hint versions keep the older ID-only behavior. */
export function validQuestionNovelty(value: unknown): value is QuestionNovelty {
  if (!value || typeof value !== 'object') return false;
  const hint = value as Partial<QuestionNovelty>;
  return (
    hint.version === 1 &&
    typeof hint.exact === 'string' &&
    HASH.test(hint.exact) &&
    (hint.codeKey === null || (typeof hint.codeKey === 'string' && HASH.test(hint.codeKey))) &&
    Array.isArray(hint.tokens) &&
    hint.tokens.length <= 120 &&
    hint.tokens.every((token) => typeof token === 'string' && token.length > 0) &&
    new Set(hint.tokens).size === hint.tokens.length &&
    (hint.concept === undefined || (typeof hint.concept === 'string' && CONCEPT.test(hint.concept)))
  );
}

/** Matches the backend's v1 comparison of normalized, public-content hints. */
export function similarQuestionNovelty(left: QuestionNovelty, right: QuestionNovelty): boolean {
  // Reworded or reformatted questions about the same idea still feel like a repeat.
  if (left.concept && left.concept === right.concept) return true;
  if (left.codeKey !== right.codeKey) return false;
  if (left.exact === right.exact) return true;
  const leftAnchors = new Set(left.tokens.filter((token) => token.startsWith('anchor:')));
  const rightAnchors = new Set(right.tokens.filter((token) => token.startsWith('anchor:')));
  if (
    leftAnchors.size !== rightAnchors.size ||
    [...leftAnchors].some((anchor) => !rightAnchors.has(anchor))
  )
    return false;
  if (left.tokens.length < 4 || right.tokens.length < 4) return false;
  const terms = new Set(left.tokens);
  const shared = right.tokens.filter((token) => terms.has(token)).length;
  return (2 * shared) / (left.tokens.length + right.tokens.length) >= 0.72;
}
