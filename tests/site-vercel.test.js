import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('Config déploiement Vercel (#77)', () => {
  it('astro.config.ts uses static output', () => {
    const content = readFileSync(
      resolve(root, 'packages/site/astro.config.ts'),
      'utf-8',
    );
    expect(content).toContain("output: 'static'");
    expect(content).not.toContain("output: 'server'");
    expect(content).not.toContain("output: 'hybrid'");
  });

  it('vercel.json exists at repo root', () => {
    expect(existsSync(resolve(root, 'vercel.json'))).toBe(true);
  });

  it('vercel.json points build to site workspace', () => {
    const config = JSON.parse(
      readFileSync(resolve(root, 'vercel.json'), 'utf-8'),
    );
    expect(config.buildCommand).toContain('build');
    expect(config.buildCommand).toContain('packages/site');
  });

  it('vercel.json runs migrations before build', () => {
    const config = JSON.parse(
      readFileSync(resolve(root, 'vercel.json'), 'utf-8'),
    );
    const cmd = config.buildCommand;
    expect(cmd).toContain('drizzle-kit migrate');
    const migrateIdx = cmd.indexOf('drizzle-kit migrate');
    const buildIdx = cmd.indexOf('astro build');
    expect(migrateIdx).toBeLessThan(buildIdx);
  });

  it('vercel.json outputs from packages/site/dist', () => {
    const config = JSON.parse(
      readFileSync(resolve(root, 'vercel.json'), 'utf-8'),
    );
    expect(config.outputDirectory).toBe('packages/site/dist');
  });

  it('vercel.json uses yarn install', () => {
    const config = JSON.parse(
      readFileSync(resolve(root, 'vercel.json'), 'utf-8'),
    );
    expect(config.installCommand).toContain('yarn');
  });

  it('vercel.json disables framework detection', () => {
    const config = JSON.parse(
      readFileSync(resolve(root, 'vercel.json'), 'utf-8'),
    );
    expect(config.framework).toBeNull();
  });
});
