import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const adminDir = resolve(root, 'packages/admin');

describe('Moderation queue page (#144)', () => {
  it('moderation page exists', () => {
    expect(
      existsSync(resolve(adminDir, 'src/app/moderation/page.tsx')),
    ).toBe(true);
  });

  it('moderation actions file exists', () => {
    expect(
      existsSync(resolve(adminDir, 'src/app/moderation/actions.ts')),
    ).toBe(true);
  });

  const page = readFileSync(
    resolve(adminDir, 'src/app/moderation/page.tsx'),
    'utf-8',
  );
  const actions = readFileSync(
    resolve(adminDir, 'src/app/moderation/actions.ts'),
    'utf-8',
  );

  it('page shows pending links table', () => {
    expect(page).toContain('Queue de modération');
    expect(page).toContain('Table');
    expect(page).toContain('link.platform');
    expect(page).toContain('link.url');
  });

  it('page shows official name with link', () => {
    expect(page).toContain('officialFirstName');
    expect(page).toContain('officialLastName');
  });

  it('page shows source and captured date', () => {
    expect(page).toContain('link.source');
    expect(page).toContain('link.capturedAt');
  });

  it('actions query filters on status pending', () => {
    expect(actions).toContain("eq(externalLinks.status, 'pending')");
  });

  it('actions require authenticated user (admin or moderator)', () => {
    expect(actions).toContain('requireAuthenticatedUser');
    expect(actions).toContain("role !== 'admin'");
    expect(actions).toContain("role !== 'moderator'");
  });

  it('moderateLink action updates status', () => {
    expect(actions).toContain('moderateLink');
    expect(actions).toContain('status: action');
  });

  it('page has Approuver, Rejeter, Supprimer buttons', () => {
    expect(page).toContain('Approuver');
    expect(page).toContain('Rejeter');
    expect(page).toContain('Supprimer');
  });

  it('handles empty queue', () => {
    expect(page).toContain('Aucun lien en attente');
  });
});
