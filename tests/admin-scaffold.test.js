import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const adminDir = resolve(root, 'packages/admin');

describe('packages/admin scaffold (#136)', () => {
  it('package.json exists and is named @elupedia/admin', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(adminDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.name).toBe('@elupedia/admin');
  });

  it('depends on @elupedia/shared', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(adminDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.dependencies['@elupedia/shared']).toBeDefined();
  });

  it('depends on next and react', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(adminDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.dependencies['next']).toBeDefined();
    expect(pkg.dependencies['react']).toBeDefined();
  });

  it('has App Router layout', () => {
    expect(existsSync(resolve(adminDir, 'src/app/layout.tsx'))).toBe(true);
  });

  it('has homepage', () => {
    expect(existsSync(resolve(adminDir, 'src/app/page.tsx'))).toBe(true);
    const content = readFileSync(
      resolve(adminDir, 'src/app/page.tsx'),
      'utf-8',
    );
    expect(content).toContain('Elupedia Admin');
  });

  it('has TypeScript strict mode', () => {
    const tsconfig = JSON.parse(
      readFileSync(resolve(adminDir, 'tsconfig.json'), 'utf-8'),
    );
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('transpiles @elupedia/shared in next config', () => {
    const config = readFileSync(resolve(adminDir, 'next.config.ts'), 'utf-8');
    expect(config).toContain('@elupedia/shared');
  });
});
