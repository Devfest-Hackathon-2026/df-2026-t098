import { learningReferences } from './learning.references';

describe('Curated learning references', () => {
  it('deduplicates official references and normalizes recognized topic aliases', () => {
    const references = learningReferences([
      ' JWT ',
      'jwt',
      'web-security',
      'nodejs',
    ]);
    expect(references).toHaveLength(3);
    expect(
      references.every((reference) => reference.url.startsWith('https://')),
    ).toBe(true);
    expect(
      references.some((reference) => reference.url.includes('rfc7519')),
    ).toBe(true);
  });

  it('does not treat object prototype properties or unknown topics as references', () => {
    expect(
      learningReferences(['__proto__', 'constructor', 'unknown-topic']),
    ).toEqual([]);
  });
});
