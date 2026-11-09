// The app picks its first language from the browser. Pin the test browser to Japanese, which is
// what the specs were written against; specs that need English set it explicitly.
Object.defineProperty(window.navigator, 'language', { value: 'ja-JP', configurable: true });
