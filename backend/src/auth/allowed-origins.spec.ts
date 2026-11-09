import { webOrigin } from './allowed-origins';

describe('webOrigin', () => {
  it('reads only http(s) URLs as the web origin', () => {
    expect(webOrigin('http://localhost:4200/x')).toBe('http://localhost:4200');
    expect(webOrigin('https://learn.example.test/app')).toBe('https://learn.example.test');
    expect(webOrigin('file://localhost')).toBeNull();
    expect(webOrigin('data:text/plain,hello')).toBeNull();
    expect(webOrigin('')).toBeNull();
  });
});
