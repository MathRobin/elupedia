/**
 * Tests de merge-duplicate-officials.ts sans base : couverture des tables
 * par NATURAL_KEYS (vérifiée contre le schéma Drizzle) et garantie qu'un
 * dry-run n'émet aucune écriture (SQL rendu via PgDialect).
 */
import { describe, it, expect, vi } from 'vitest';
import { getTableName, getTableColumns } from 'drizzle-orm';
import { PgDialect, type PgTable } from 'drizzle-orm/pg-core';
import * as schema from '@elupedia/shared';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  NATURAL_KEYS,
  finalSlug,
  mergeDuplicateOfficials,
} from './merge-duplicate-officials.js';

function tablesReferencingOfficials(): string[] {
  const names: string[] = [];
  for (const value of Object.values(schema)) {
    if (typeof value !== 'object' || value === null) continue;
    if (!(Symbol.for('drizzle:Name') in value)) continue;
    const table = value as PgTable;
    const columns = getTableColumns(table);
    if ('officialId' in columns && getTableName(table) !== 'officials') {
      names.push(getTableName(table));
    }
  }
  return names.sort();
}

describe('NATURAL_KEYS', () => {
  it('covers every schema table that references officials', () => {
    expect(Object.keys(NATURAL_KEYS).sort()).toEqual(
      tablesReferencingOfficials(),
    );
  });

  it('only names columns that exist in the schema', () => {
    for (const value of Object.values(schema)) {
      if (typeof value !== 'object' || value === null) continue;
      if (!(Symbol.for('drizzle:Name') in value)) continue;
      const table = value as PgTable;
      const keys = NATURAL_KEYS[getTableName(table)];
      if (!keys) continue;
      const sqlColumns = Object.values(getTableColumns(table)).map(
        (column) => column.name,
      );
      for (const key of keys) expect(sqlColumns).toContain(key);
    }
  });
});

const dialect = new PgDialect();

/**
 * Mock DB : la première requête (recherche des paires) renvoie une paire, les
 * comptages renvoient 1 déplacée / 1 supprimée, tout le reste renvoie vide.
 * Chaque SQL émis est rendu en texte pour inspection.
 */
const cadicPair = {
  name: 'Olivier Cadic',
  birth_date: '1962-04-22',
  kept_id: 'kept-1',
  kept_slug: 'olivier-cadic-1',
  kept_an_id: null as string | null,
  dup_id: 'dup-1',
  dup_slug: 'olivier-cadic-2',
  dup_an_id: 'PA703525' as string | null,
};

function createMockDb(pair = cadicPair) {
  const statements: string[] = [];
  const db = {
    execute: vi.fn(async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
      const text = dialect.sqlToQuery(query).sql.toLowerCase();
      statements.push(text);
      if (
        text.includes('from officials kept') &&
        text.includes('join officials dup')
      ) {
        return { rows: [pair] };
      }
      if (text.includes('count(*) filter')) {
        return { rows: [{ dropped: 1, moved: 1 }] };
      }
      return { rows: [] };
    }),
  };
  return { db, statements };
}

describe('finalSlug', () => {
  const base = {
    name: '',
    birthDate: '',
    keptId: 'k',
    keptAnId: null,
    dupId: 'd',
    dupAnId: null,
  };
  it('takes over the canonical slug when the kept one is a suffixed variant', () => {
    expect(
      finalSlug({
        ...base,
        keptSlug: 'marie-pierre-mouton-1',
        dupSlug: 'marie-pierre-mouton',
      }),
    ).toBe('marie-pierre-mouton');
  });
  it('keeps the kept slug otherwise', () => {
    expect(
      finalSlug({
        ...base,
        keptSlug: 'olivier-cadic-1',
        dupSlug: 'olivier-cadic-2',
      }),
    ).toBe('olivier-cadic-1');
    expect(finalSlug({ ...base, keptSlug: 'a-b', dupSlug: 'a-b-1' })).toBe(
      'a-b',
    );
    expect(finalSlug({ ...base, keptSlug: 'a-b-1', dupSlug: null })).toBe(
      'a-b-1',
    );
  });
});

describe('mergeDuplicateOfficials', () => {
  it('in dry-run, reports the plan and issues no write', async () => {
    const { db, statements } = createMockDb();
    const summary = await mergeDuplicateOfficials(db as never, {
      dryRun: true,
    });

    expect(summary).toMatchObject({ pairs: 1, skipped: 0, dryRun: true });
    expect(summary.moved).toBe(Object.keys(NATURAL_KEYS).length);
    expect(summary.dropped).toBe(Object.keys(NATURAL_KEYS).length);
    expect(statements.some((s) => /^\s*(delete|update)/.test(s))).toBe(false);
  });

  it('with --apply, drops duplicates before moving rows, then transfers an_id and deletes the AN official', async () => {
    const { db, statements } = createMockDb();
    await mergeDuplicateOfficials(db as never, { dryRun: false });

    const writes = statements.filter((s) => /^\s*(delete|update)/.test(s));
    // Par table : un delete (doublons) puis un update (réaffectation).
    const firstTableWrites = writes.slice(0, 2);
    expect(firstTableWrites[0]).toMatch(/^\s*delete from "mandates"/);
    expect(firstTableWrites[1]).toMatch(/^\s*update "mandates"/);
    // Fin : libération de l'an_id, pose sur la fiche conservée, suppression.
    const last = writes.slice(-3);
    expect(last[0]).toMatch(/update officials set an_id = null/);
    expect(last[1]).toMatch(/update officials set an_id = \$\d/);
    expect(last[2]).toMatch(/delete from officials where id = \$\d/);
  });

  it('skips a pair whose two sides carry different an_id', async () => {
    const { db, statements } = createMockDb({
      ...cadicPair,
      kept_an_id: 'PA1',
      dup_an_id: 'PA2',
    });
    const summary = await mergeDuplicateOfficials(db as never, {
      dryRun: false,
    });
    expect(summary).toMatchObject({ pairs: 0, skipped: 1 });
    expect(statements).toHaveLength(1);
  });
});
