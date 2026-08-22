import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf-8'));
}

describe('vitest setup (#20)', () => {
  for (const pkg of ['ingest', 'site', 'shared']) {
    it(`packages/${pkg} has vitest.config.ts`, () => {
      expect(
        existsSync(resolve(root, `packages/${pkg}/vitest.config.ts`)),
      ).toBe(true);
    });

    it(`packages/${pkg}/package.json has test script`, () => {
      const pkgJson = readJson(`packages/${pkg}/package.json`);
      expect(pkgJson.scripts.test).toBeDefined();
    });
  }

  it('root test script runs workspaces', () => {
    const pkg = readJson('package.json');
    expect(pkg.scripts.test).toContain('workspaces');
  });
});

describe('error case', () => {
  it('reading non-existent vitest config throws', () => {
    expect(() =>
      readFileSync(
        resolve(root, 'packages/nonexistent/vitest.config.ts'),
        'utf-8',
      ),
    ).toThrow();
  });
});
