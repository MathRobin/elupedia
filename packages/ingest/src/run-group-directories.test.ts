/**
 * Tests de l'orchestration des annuaires de groupes (tickets #276 et #277).
 * Pages réelles relevées (fixtures), réseau et base simulés.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { GROUP_DIRECTORY_SOURCES } from './config/group-directories.js';
import { buildGroupOfficialIndex } from './group-directory-matching.js';
import {
  runGroupDirectories,
  type GroupDirectoryRunDeps,
} from './run-group-directories.js';
import {
  GROUP_DIRECTORY_LINK_SOURCE,
  type ExistingLink,
  type LinkStore,
} from './upsert/group-directory-links.js';

function fixture(name: string): string {
  return readFileSync(
    new URL(`./sources/fixtures/group-directories/${name}`, import.meta.url),
    'utf8',
  );
}

const RN = GROUP_DIRECTORY_SOURCES.filter((s) => s.groupCode === 'RN');

const INDEX = buildGroupOfficialIndex([
  {
    id: 'chenu',
    firstName: 'Sébastien',
    lastName: 'Chenu',
    partyOrGroup: 'Rassemblement National (RN)',
  },
]);

function memoryStore() {
  const rows: ExistingLink[] = [];
  const store: LinkStore = {
    async listExisting() {
      return rows.map((row) => ({ ...row }));
    },
    async insertPending(_officialId, link) {
      const id = `link-${rows.length + 1}`;
      rows.push({
        id,
        platform: link.platform,
        url: link.url,
        status: 'pending',
        source: GROUP_DIRECTORY_LINK_SOURCE,
      });
      return id;
    },
    async writeProvenance() {},
  };
  return { store, rows };
}

function deps(
  store: LinkStore,
  overrides: Partial<GroupDirectoryRunDeps> = {},
): GroupDirectoryRunDeps {
  return {
    fetchMemberList: async () => fixture('rn-list.html'),
    fetchPage: async (url: string) => {
      if (url.includes('OMC_PA720468')) return fixture('rn-fiche-chenu.html');
      throw new Error(`page inattendue : ${url}`);
    },
    index: INDEX,
    store,
    delayMs: 0,
    sleep: async () => {},
    today: '2026-11-12',
    dryRun: false,
    ...overrides,
  };
}

describe('runGroupDirectories (RN, liens sur la fiche)', () => {
  it('ne télécharge que la fiche de l’élu rapproché et écrit ses liens en pending', async () => {
    const { store, rows } = memoryStore();
    const [summary] = await runGroupDirectories(RN, deps(store));

    expect(summary).toMatchObject({
      groupCode: 'RN',
      error: null,
      entries: 3,
      resolved: 1,
      exact: 1,
      pagesFetched: 1,
      created: 2,
    });
    expect(rows.map((row) => row.platform).sort()).toEqual([
      'facebook',
      'twitter',
    ]);
  });

  it('deux passes successives ne créent rien à la seconde', async () => {
    const { store, rows } = memoryStore();
    await runGroupDirectories(RN, deps(store));
    const [second] = await runGroupDirectories(RN, deps(store));

    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);
    expect(rows).toHaveLength(2);
  });

  it('en dry-run, calcule le plan sans écrire', async () => {
    const { store, rows } = memoryStore();
    const [summary] = await runGroupDirectories(
      RN,
      deps(store, { dryRun: true }),
    );

    expect(summary).toMatchObject({ created: 0, wouldCreate: 2 });
    expect(rows).toHaveLength(0);
  });

  it('une liste inaccessible n’interrompt pas les groupes suivants', async () => {
    const { store } = memoryStore();
    const sources = [
      ...RN,
      ...GROUP_DIRECTORY_SOURCES.filter((s) => s.groupCode === 'EPR'),
    ];
    const [rn, epr] = await runGroupDirectories(
      sources,
      deps(store, {
        fetchMemberList: async (url: string) => {
          if (url.includes('rassemblement-national')) {
            throw new Error('HTTP 503');
          }
          return fixture('epr-list.html');
        },
      }),
    );

    expect(rn.error).toContain('503');
    expect(epr.error).toBeNull();
    expect(epr.entries).toBeGreaterThan(0);
  });
});
