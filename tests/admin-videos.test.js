import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const adminDir = resolve(root, 'packages/admin');

describe('Section Vidéos (shorts) de l’admin', () => {
  const list = resolve(adminDir, 'src/app/videos/page.tsx');
  const detail = resolve(adminDir, 'src/app/videos/[id]/page.tsx');
  const actions = resolve(adminDir, 'src/app/videos/actions.ts');
  const route = resolve(adminDir, 'src/app/api/videos/[id]/[file]/route.ts');

  it('pages, actions et route existent', () => {
    for (const f of [list, detail, actions, route]) {
      expect(existsSync(f), f).toBe(true);
    }
  });

  it('la navigation mène à /videos', () => {
    const sidebar = readFileSync(
      resolve(adminDir, 'src/components/AdminSidebar.tsx'),
      'utf-8',
    );
    expect(sidebar).toContain('Vidéos');
    expect(sidebar).toContain('/videos');
  });

  it('la liste filtre par statut et ouvre le détail au clic', () => {
    const page = readFileSync(list, 'utf-8');
    expect(page).toContain('SegmentedControl');
    expect(page).toContain('VIDEO_STATUSES');
    expect(page).toContain('router.push(`/videos/${v.id}`)');
    expect(page).toContain('Aucune vidéo');
  });

  it('le détail montre script, texte, scrutin, miniature et vidéo', () => {
    const page = readFileSync(detail, 'utf-8');
    for (const s of [
      'Script',
      'accompagnement',
      'Scrutin',
      'Miniature',
      'Vidéo',
      '<video',
      'short.mp4',
      'thumbnail.png',
      'elupediaUrl',
      'b.sources',
    ]) {
      expect(page, s).toContain(s);
    }
  });

  it('les actions exigent un rôle et restent en lecture seule', () => {
    const src = readFileSync(actions, 'utf-8');
    expect(src).toContain('requireAuthenticatedUser');
    expect(src).toContain("role !== 'moderator'");
    expect(src).not.toMatch(/db\s*\.\s*(update|insert|delete)\(/);
  });

  it('la route ne sert que des fichiers sur liste blanche, après authentification', () => {
    const src = readFileSync(route, 'utf-8');
    expect(src).toContain('shortFilePath');
    expect(src).toContain('status: 401');
    const helper = readFileSync(
      resolve(adminDir, 'src/lib/shorts-files.ts'),
      'utf-8',
    );
    expect(helper).toContain("'short.mp4'");
    expect(helper).toContain("'thumbnail.png'");
    expect(helper).toContain("'description.txt'");
  });

  it('le détail propose les commandes shell du short avec leur explication', () => {
    const page = readFileSync(detail, 'utf-8');
    expect(page).toContain('videoCommands');
    expect(page).toContain('Commandes');
    expect(page).toContain('CopyButton');
    const commands = readFileSync(
      resolve(adminDir, 'src/app/videos/commands.ts'),
      'utf-8',
    );
    for (const c of [
      'make ${id}',
      'script --id ${id}',
      'voiceover sheet --id ${id}',
      'voiceover import --id ${id}',
      'render --id ${id}',
      'review approve ${id}',
      'review reject ${id}',
      'publish --id ${id}',
    ]) {
      expect(commands, c).toContain(c);
    }
  });
});
