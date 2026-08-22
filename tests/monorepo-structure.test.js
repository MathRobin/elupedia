import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf-8'));
}

describe('monorepo structure', () => {
  const rootPkg = readJson('package.json');

  it('root package.json declares workspaces', () => {
    expect(rootPkg.workspaces).toContain('packages/*');
  });

  it('root package is private', () => {
    expect(rootPkg.private).toBe(true);
  });

  it('declares yarn 4 as packageManager', () => {
    expect(rootPkg.packageManager).toMatch(/^yarn@4\./);
  });

  for (const pkg of ['ingest', 'site', 'shared']) {
    it(`packages/${pkg} exists with valid package.json`, () => {
      const pkgJson = readJson(`packages/${pkg}/package.json`);
      expect(pkgJson.name).toBe(`@elupedia/${pkg}`);
      expect(pkgJson.private).toBe(true);
    });

    it(`packages/${pkg}/src/index.ts exists`, () => {
      expect(existsSync(resolve(root, `packages/${pkg}/src/index.ts`))).toBe(
        true,
      );
    });
  }
});

describe('linting config', () => {
  it('eslint.config.js exists', () => {
    expect(existsSync(resolve(root, 'eslint.config.js'))).toBe(true);
  });

  it('.prettierrc exists', () => {
    expect(existsSync(resolve(root, '.prettierrc'))).toBe(true);
  });

  it('lint script is defined', () => {
    const rootPkg = readJson('package.json');
    expect(rootPkg.scripts.lint).toBeDefined();
  });
});

describe('typescript config', () => {
  it('tsconfig.base.json exists with strict mode', () => {
    const base = readJson('tsconfig.base.json');
    expect(base.compilerOptions.strict).toBe(true);
  });

  it('root tsconfig.json references composite packages', () => {
    const root_ = readJson('tsconfig.json');
    const paths = root_.references.map((r) => r.path);
    expect(paths).toContain('packages/shared');
    expect(paths).toContain('packages/ingest');
  });

  for (const pkg of ['ingest', 'shared']) {
    it(`packages/${pkg}/tsconfig.json extends base`, () => {
      const tsconfig = readJson(`packages/${pkg}/tsconfig.json`);
      expect(tsconfig.extends).toBe('../../tsconfig.base.json');
    });

    it(`packages/${pkg}/tsconfig.json has composite: true`, () => {
      const tsconfig = readJson(`packages/${pkg}/tsconfig.json`);
      expect(tsconfig.compilerOptions.composite).toBe(true);
    });
  }

  it('packages/site/tsconfig.json extends astro strict', () => {
    const tsconfig = readJson('packages/site/tsconfig.json');
    expect(tsconfig.extends).toBe('astro/tsconfigs/strict');
  });
});

describe('error cases', () => {
  it('reading a non-existent package.json throws', () => {
    expect(() => readJson('packages/nonexistent/package.json')).toThrow();
  });
});
