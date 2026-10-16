import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const adminDir = resolve(root, 'packages/admin');
const read = (p) => readFileSync(resolve(adminDir, p), 'utf-8');

describe('Outils d’administration (actions sur les shorts, ingestions, cohérence, rattachements, fiches élus)', () => {
  it('toutes les pages et actions existent', () => {
    for (const f of [
      'src/lib/shorts-jobs.ts',
      'src/app/videos/[id]/actions.ts',
      'src/app/videos/[id]/ActionsPanel.tsx',
      'src/app/videos/derive/actions.ts',
      'src/app/videos/derive/page.tsx',
      'src/app/ingestions/actions.ts',
      'src/app/ingestions/page.tsx',
      'src/app/coherence/actions.ts',
      'src/app/coherence/page.tsx',
      'src/app/rattachements/actions.ts',
      'src/app/rattachements/page.tsx',
      'src/app/elus/actions.ts',
      'src/app/elus/recherche/page.tsx',
      'src/app/elus/[id]/page.tsx',
    ]) {
      expect(existsSync(resolve(adminDir, f)), f).toBe(true);
    }
  });

  it('la navigation mène à chaque section', () => {
    const sidebar = read('src/components/AdminSidebar.tsx');
    for (const href of [
      '/elus/recherche',
      '/rattachements',
      '/videos/derive',
      '/ingestions',
      '/coherence',
    ]) {
      expect(sidebar, href).toContain(href);
    }
  });

  it('la publication est réservée aux admins et bloquée en cas de dérive des faits', () => {
    const src = read('src/app/videos/[id]/actions.ts');
    expect(src).toContain("requireRole(['admin'])");
    expect(src).toContain('factsDrift');
    expect(src).toContain('publishShorts');
    expect(src).toContain('reviewShort');
    const panel = read('src/app/videos/[id]/ActionsPanel.tsx');
    for (const s of ['Approuver', 'Rejeter', 'Publier', 'rescript']) {
      expect(panel, s).toContain(s);
    }
  });

  it('les jobs lancés depuis l’admin sont sur liste blanche et journalisés', () => {
    const src = read('src/lib/shorts-jobs.ts');
    expect(src).toContain('SHORT_JOBS');
    expect(src).toContain('current.json');
    expect(src).toContain("'make'");
    expect(src).toContain("'render'");
    expect(src).not.toMatch(/exec\(|execSync\(/);
  });

  it('le tableau de bord des ingestions lit les DAG et les rapports locaux', () => {
    const src = read('src/app/ingestions/actions.ts');
    expect(src).toContain('dagu-dags');
    expect(src).toContain('ingest-report-');
  });

  it('la cohérence réutilise le contrôle du paquet ingest', () => {
    expect(read('src/app/coherence/actions.ts')).toContain('checkCoherence');
  });

  it('les corrections de fiches sont tracées dans data_provenance et réservées aux admins', () => {
    const src = read('src/app/elus/actions.ts');
    expect(src).toContain('dataProvenance');
    expect(src).toContain("'Admin Elupedia'");
    expect(src).toContain('requireAdmin');
    for (const f of ["'birthDate'", "'deathDate'", "'photoUrl'"]) {
      expect(src, f).toContain(f);
    }
    expect(src).toContain('endMandate');
    expect(src).not.toMatch(/db\s*\.\s*delete\(/);
  });

  it('les rattachements écrivent official_id avec contrôle du rôle admin', () => {
    const src = read('src/app/rattachements/actions.ts');
    expect(src).toContain('attachToOfficial');
    expect(src).toContain('requireAdmin');
    expect(src).toContain('sponsorships');
    expect(src).toContain('senatorialCandidates');
  });
});
