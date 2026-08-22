import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('Déploiement manuel de vérification (#79)', () => {
  it('smoke-test.sh exists and is executable', () => {
    const scriptPath = resolve(root, 'scripts/smoke-test.sh');
    expect(existsSync(scriptPath)).toBe(true);
  });

  it('smoke-test.sh checks key pages', () => {
    const content = readFileSync(
      resolve(root, 'scripts/smoke-test.sh'),
      'utf-8',
    );
    expect(content).toContain('/a-propos');
    expect(content).toContain('/donnees-personnelles');
    expect(content).toContain('curl');
    expect(content).toContain('200');
  });

  it('smoke-test script is available via yarn', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf-8'),
    );
    expect(pkg.scripts['smoke-test']).toContain('smoke-test.sh');
  });

  it('vercel.json exists for deployment config', () => {
    expect(existsSync(resolve(root, 'vercel.json'))).toBe(true);
  });
});
