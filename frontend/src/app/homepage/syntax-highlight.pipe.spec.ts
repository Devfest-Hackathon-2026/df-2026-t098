import { SyntaxHighlightPipe } from './syntax-highlight.pipe';

describe('SyntaxHighlightPipe', () => {
  const pipe = new SyntaxHighlightPipe();

  it('preserves source exactly while classifying JavaScript', () => {
    const code = "const x = 'hello';\n// explanation\nconsole.log(x);";
    const tokens = pipe.transform(code, 'JavaScript');
    expect(tokens.map((token) => token.text).join('')).toBe(code);
    expect(tokens.some((token) => token.kind === 'keyword' && token.text === 'const')).toBe(true);
    expect(tokens.some((token) => token.kind === 'string' && token.text === "'hello'")).toBe(true);
    expect(tokens.some((token) => token.kind === 'comment')).toBe(true);
  });

  it('keeps unsupported code as plain text and supports Python and SQL', () => {
    const source = '<img src=x onerror=alert(1)>\n';
    expect(pipe.transform(source, 'unknown')).toEqual([{ text: source, kind: 'plain' }]);
    expect(pipe.transform('return True', 'Python').some((token) => token.kind === 'keyword')).toBe(true);
    expect(pipe.transform('SELECT id FROM users', 'SQL').some((token) => token.kind === 'keyword')).toBe(true);
  });
});
