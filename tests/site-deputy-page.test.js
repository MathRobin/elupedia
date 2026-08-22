import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('Fiche élu (#53)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('[slug].astro exists', () => {
    expect(existsSync(pagePath)).toBe(true);
  });

  it('exports getStaticPaths', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('export async function getStaticPaths');
  });

  it('queries officials with active mandates', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('officials');
    expect(content).toContain('mandates');
    expect(content).toContain('isNull(mandates.endDate)');
  });

  it('displays identity (name, photo, birth date)', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('deputy.firstName');
    expect(content).toContain('deputy.lastName');
    expect(content).toContain('deputy.photoUrl');
    expect(content).toContain('deputy.birthDate');
  });

  it('displays current mandate details', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('deputy.mandateType');
    expect(content).toContain('deputy.district');
    expect(content).toContain('deputy.politicalGroup');
    expect(content).toContain('deputy.startDate');
  });

  it('has a back link to the homepage', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('href="/"');
    expect(content).toContain('Retour');
  });

  it('uses BaseLayout with dynamic title', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('<BaseLayout');
    expect(content).toContain('title={fullName}');
  });

  it('homepage links to /elus/ path', () => {
    const indexPath = resolve(root, 'packages/site/src/pages/index.astro');
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('/elus/');
  });
});
