import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const licensesMd = readFileSync(
  resolve(root, 'docs/DATA-LICENSES.md'),
  'utf-8',
);

const sources = ['data.assemblee-nationale.fr', 'HATVP', 'data.gouv.fr'];

describe('docs/DATA-LICENSES.md', () => {
  it('exists', () => {
    expect(existsSync(resolve(root, 'docs/DATA-LICENSES.md'))).toBe(true);
  });

  for (const source of sources) {
    it(`documents source "${source}"`, () => {
      expect(licensesMd).toContain(source);
    });
  }

  it('mentions license types', () => {
    expect(licensesMd).toContain('Licence Ouverte');
  });

  it('covers attribution obligations', () => {
    expect(licensesMd).toContain('Attribution');
  });

  it('includes a summary table', () => {
    expect(licensesMd).toContain('| Source');
  });
});

describe('error case', () => {
  it('reading a non-existent doc throws', () => {
    expect(() =>
      readFileSync(resolve(root, 'docs/NONEXISTENT.md'), 'utf-8'),
    ).toThrow();
  });
});
