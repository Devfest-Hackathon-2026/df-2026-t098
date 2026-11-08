import {
  rejectPollutionKeys,
  securityHeaders,
  trustProxy,
} from './http-hardening';

describe('HTTP hardening', () => {
  it('rejects prototype-pollution keys during JSON parsing', () => {
    expect(() =>
      JSON.parse('{"__proto__":{"admin":true}}', rejectPollutionKeys),
    ).toThrow(SyntaxError);
    expect(() =>
      JSON.parse('{"a":{"constructor":{"prototype":{}}}}', rejectPollutionKeys),
    ).toThrow();
    expect(
      JSON.parse(
        '{"text":"__proto__ is fine inside a string"}',
        rejectPollutionKeys,
      ),
    ).toEqual({ text: '__proto__ is fine inside a string' });
  });

  it('sets baseline security headers', () => {
    const headers: Record<string, string> = {};
    const next = jest.fn();
    securityHeaders(
      {} as never,
      {
        setHeader: (name: string, value: string) => (headers[name] = value),
      } as never,
      next,
    );
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(next).toHaveBeenCalled();
  });

  it('trusts only an explicit, small number of proxy hops', () => {
    expect(trustProxy(undefined)).toBe(false);
    expect(trustProxy('1')).toBe(1);
    expect(trustProxy('true')).toBe(false);
    expect(trustProxy('0')).toBe(false);
  });
});
