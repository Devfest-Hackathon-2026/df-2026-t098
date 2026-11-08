import { format } from 'prettier';

interface QuestionCode {
  code: string | null;
  codeLanguage: string | null;
  format?: string | null;
}

const PARSERS: Record<string, string> = {
  javascript: 'babel',
  js: 'babel',
  nodejs: 'babel',
  'node.js': 'babel',
  jsx: 'babel',
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  graphql: 'graphql',
  gql: 'graphql',
};

export async function formatQuestionCode<T extends QuestionCode>(
  question: T,
): Promise<T> {
  if (!question.code || !question.codeLanguage) return question;
  // Spot-the-bug options are line numbers, so reformatting would move the answer.
  if (question.format === 'spot_bug') return question;
  const parser = PARSERS[question.codeLanguage.trim().toLowerCase()];
  if (typeof parser !== 'string') return question;

  const key = `${parser}\0${question.code}`;
  let formatted = FORMATTED.get(key);
  if (formatted === undefined) {
    formatted = await formatCode(question.code, parser);
    // Public lists format every snippet on every read; remember results (bounded).
    if (FORMATTED.size >= FORMAT_CACHE_SIZE)
      FORMATTED.delete(FORMATTED.keys().next().value!);
    FORMATTED.set(key, formatted);
  }
  return formatted === null ? question : { ...question, code: formatted };
}

const FORMAT_CACHE_SIZE = 2000;
const FORMATTED = new Map<string, string | null>();

async function formatCode(
  code: string,
  parser: string,
): Promise<string | null> {
  try {
    const result = await format(code, {
      parser,
      printWidth: 80,
      tabWidth: 2,
      useTabs: false,
      singleQuote: true,
      trailingComma: 'all',
      endOfLine: 'lf',
      embeddedLanguageFormatting: 'off',
      plugins: [],
    });
    return result.trimEnd();
  } catch {
    // Legacy or illustrative snippets can be unparseable. Keep question reads usable.
    return null;
  }
}
