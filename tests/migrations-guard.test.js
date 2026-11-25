import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadMigrationFiles,
  validateFiles,
  validateRegistry,
  sha256,
} from '../scripts/check-migrations.mjs';

const root = resolve(import.meta.dirname, '..');
const ZERO = '00000000-0000-0000-0000-000000000000';

function uuid(n) {
  return `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
}

// Jeu synthétique : n entrées, snapshots chaînés, .sql présents.
function makeSet(whens) {
  const journal = whens.map((when, idx) => ({
    idx,
    version: '7',
    when,
    tag: `${String(idx).padStart(4, '0')}_m${idx}`,
    breakpoints: true,
  }));
  const sqlTags = journal.map((e) => e.tag);
  const snapshots = {};
  journal.forEach((e) => {
    snapshots[e.idx] = {
      id: uuid(e.idx + 1),
      prevId: e.idx === 0 ? ZERO : uuid(e.idx),
    };
  });
  return { journal, sqlTags, snapshots };
}

describe('migrations : fichiers réels du dépôt', () => {
  const files = loadMigrationFiles(root);

  it('le journal et les fichiers .sql correspondent un à un', () => {
    expect(files.sqlTags.length).toBe(files.journal.length);
    expect(validateFiles(files)).toEqual([]);
  });

  it('chaque entrée a un snapshot', () => {
    for (const entry of files.journal) {
      expect(files.snapshots[entry.idx]).toBeDefined();
    }
  });

  it('vercel.json lance le contrôle avant db:migrate', () => {
    const cmd = JSON.parse(
      readFileSync(resolve(root, 'vercel.json'), 'utf-8'),
    ).buildCommand;
    const checkIdx = cmd.indexOf('scripts/check-migrations.mjs --db');
    expect(checkIdx).toBeGreaterThan(-1);
    expect(checkIdx).toBeLessThan(cmd.indexOf('db:migrate'));
  });

  it('package.json ne propose plus db:push', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf-8'),
    );
    expect(pkg.scripts['db:push']).toBeUndefined();
    expect(pkg.scripts['db:check']).toBeDefined();
  });
});

describe('validateFiles', () => {
  it('jeu cohérent : aucune erreur', () => {
    expect(validateFiles(makeSet([1000, 2000, 3000]))).toEqual([]);
  });

  it('when non croissant : erreur', () => {
    const set = makeSet([1000, 3000, 2000]);
    const errors = validateFiles(set);
    expect(errors.some((e) => e.includes('m2') && e.includes('sautera'))).toBe(
      true,
    );
  });

  it('exception legacy : when non croissant toléré pour 0010 et 0011', () => {
    const set = makeSet([1000, 5000, 6000, 2000, 2500, 7000]);
    set.journal[3].tag = '0010_interests_enrichment';
    set.journal[4].tag = '0011_declaration_snapshots';
    set.sqlTags = set.journal.map((e) => e.tag);
    expect(validateFiles(set).filter((e) => e.includes('sautera'))).toEqual([]);
  });

  it('exception legacy limitée aux tags listés : autre tag non croissant refusé', () => {
    const set = makeSet([1000, 5000, 2000]);
    expect(
      validateFiles(set).some((e) => e.includes('m2') && e.includes('sautera')),
    ).toBe(true);
  });

  it('fichier .sql orphelin : erreur', () => {
    const set = makeSet([1000]);
    set.sqlTags.push('0009_fantome');
    expect(validateFiles(set).some((e) => e.includes('0009_fantome'))).toBe(
      true,
    );
  });

  it('fichier .sql manquant : erreur', () => {
    const set = makeSet([1000, 2000]);
    set.sqlTags = set.sqlTags.slice(0, 1);
    expect(
      validateFiles(set).some((e) => e.includes('fichier .sql absent')),
    ).toBe(true);
  });

  it('snapshot manquant : erreur', () => {
    const set = makeSet([1000, 2000]);
    delete set.snapshots[1];
    expect(validateFiles(set).some((e) => e.includes('snapshot absent'))).toBe(
      true,
    );
  });

  it('prevId cassé : erreur', () => {
    const set = makeSet([1000, 2000, 3000]);
    set.snapshots[2].prevId = uuid(99);
    expect(validateFiles(set).some((e) => e.includes('prevId'))).toBe(true);
  });

  it('idx décalé : erreur', () => {
    const set = makeSet([1000, 2000]);
    set.journal[1].idx = 5;
    expect(validateFiles(set).some((e) => e.includes('idx 5'))).toBe(true);
  });
});

describe('validateRegistry', () => {
  const journal = [
    { idx: 0, tag: '0000_a', when: 1000 },
    { idx: 1, tag: '0001_b', when: 2000 },
    { idx: 2, tag: '0002_c', when: 3000 },
  ];
  const hashes = {
    '0000_a': sha256('a'),
    '0001_b': sha256('b'),
    '0002_c': sha256('c'),
  };

  it('registre aligné sur le journal : aucune erreur', () => {
    const rows = [
      { created_at: '1000', hash: hashes['0000_a'] },
      { created_at: '2000', hash: hashes['0001_b'] },
    ];
    expect(validateRegistry({ journal, rows, hashes })).toEqual([]);
  });

  it('entrée sautée (absente du registre sous le max appliqué) : erreur', () => {
    const rows = [
      { created_at: '1000', hash: hashes['0000_a'] },
      { created_at: '3000', hash: hashes['0002_c'] },
    ];
    const errors = validateRegistry({ journal, rows, hashes });
    expect(
      errors.some((e) => e.includes('0001_b') && e.includes('sautera')),
    ).toBe(true);
  });

  it('entrée non appliquée au-delà du max : pas une erreur (en attente)', () => {
    const rows = [{ created_at: '1000', hash: hashes['0000_a'] }];
    expect(validateRegistry({ journal, rows, hashes })).toEqual([]);
  });

  it('hash différent du fichier : erreur', () => {
    const rows = [{ created_at: '1000', hash: sha256('autre') }];
    expect(
      validateRegistry({ journal, rows, hashes }).some((e) =>
        e.includes('0000_a'),
      ),
    ).toBe(true);
  });

  it('exception legacy 0019 : hash différent toléré', () => {
    const j = [{ idx: 0, tag: '0019_early_crusher_hogan', when: 1000 }];
    const rows = [{ created_at: '1000', hash: sha256('autre') }];
    expect(validateRegistry({ journal: j, rows, hashes: {} })).toEqual([]);
  });

  it('created_at absent du journal : erreur', () => {
    const rows = [
      { created_at: '1000', hash: hashes['0000_a'] },
      { created_at: '9999', hash: 'x' },
    ];
    expect(
      validateRegistry({ journal, rows, hashes }).some((e) =>
        e.includes('9999'),
      ),
    ).toBe(true);
  });
});
