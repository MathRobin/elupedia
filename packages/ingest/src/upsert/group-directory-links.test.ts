/**
 * Tests du plan et de l'écriture des liens d'annuaires de groupes (ticket
 * #277). Store en mémoire : le repo n'a pas de base de test ; l'écriture
 * réelle passe par drizzleLinkStore, non couverte ici.
 */
import { describe, it, expect } from 'vitest';
import {
  planLinkWrites,
  toDbPlatform,
  upsertGroupDirectoryLinks,
  GROUP_DIRECTORY_LINK_SOURCE,
  type ExistingLink,
  type GroupDirectoryProvenance,
  type LinkStore,
} from './group-directory-links.js';

const PROVENANCE: GroupDirectoryProvenance = {
  groupName: 'Rassemblement National',
  pageUrl: 'https://www2.assemblee-nationale.fr/deputes/fiche/OMC_PA720468',
  capturedAt: '2026-11-12',
  memberName: 'M. Sébastien Chenu',
};

function memoryStore() {
  const rows: ExistingLink[] = [];
  const provenance: { linkId: string; pageUrl: string; platform: string }[] =
    [];
  let counter = 0;
  const store: LinkStore = {
    async listExisting() {
      return rows.map((row) => ({ ...row }));
    },
    async insertPending(_officialId, link) {
      counter++;
      const id = `link-${counter}`;
      rows.push({
        id,
        platform: link.platform,
        url: link.url,
        status: 'pending',
        source: GROUP_DIRECTORY_LINK_SOURCE,
      });
      return id;
    },
    async writeProvenance(linkId, provenanceInput, link) {
      provenance.push({
        linkId,
        pageUrl: provenanceInput.pageUrl,
        platform: link.platform,
      });
    },
  };
  return { store, rows, provenance };
}

describe('toDbPlatform', () => {
  it('ramène x sur twitter, laisse les autres plateformes', () => {
    expect(toDbPlatform('x')).toBe('twitter');
    expect(toDbPlatform('instagram')).toBe('instagram');
  });
});

describe('planLinkWrites', () => {
  it('insère un lien absent de la plateforme', () => {
    const plan = planLinkWrites(
      [],
      [{ platform: 'twitter', url: 'https://x.com/sebchenu' }],
    );
    expect(plan).toEqual([
      {
        action: 'insert',
        link: { platform: 'twitter', url: 'https://x.com/sebchenu' },
      },
    ]);
  });

  it('ignore un lien déjà présent, même écrit différemment (casse, slash, www)', () => {
    const existing: ExistingLink[] = [
      {
        id: 'a',
        platform: 'twitter',
        url: 'https://www.x.com/SebChenu/',
        status: 'published',
        source: 'official',
      },
    ];
    const plan = planLinkWrites(existing, [
      { platform: 'twitter', url: 'https://x.com/sebchenu' },
    ]);
    expect(plan[0]).toMatchObject({
      action: 'skip',
      reason: 'lien déjà présent',
    });
  });

  it('n’insère jamais une plateforme rejetée ou supprimée, quelle que soit l’URL', () => {
    const existing: ExistingLink[] = [
      {
        id: 'a',
        platform: 'twitter',
        url: 'https://x.com/ancien',
        status: 'rejected',
        source: 'scraped_personal_website',
      },
    ];
    const plan = planLinkWrites(existing, [
      { platform: 'twitter', url: 'https://x.com/sebchenu' },
    ]);
    expect(plan[0]).toMatchObject({ action: 'skip' });
    expect((plan[0] as { reason: string }).reason).toContain('rejetée');
  });

  it('ignore une plateforme déjà renseignée par une autre source (#278 tranchera)', () => {
    const existing: ExistingLink[] = [
      {
        id: 'a',
        platform: 'twitter',
        url: 'https://x.com/autre',
        status: 'published',
        source: 'official',
      },
    ];
    const plan = planLinkWrites(existing, [
      { platform: 'twitter', url: 'https://x.com/sebchenu' },
    ]);
    expect(plan[0]).toMatchObject({ action: 'skip' });
  });

  it('n’insère qu’une fois par plateforme dans un même lot', () => {
    const plan = planLinkWrites(
      [],
      [
        { platform: 'twitter', url: 'https://x.com/a' },
        { platform: 'twitter', url: 'https://x.com/b' },
      ],
    );
    expect(plan.map((item) => item.action)).toEqual(['insert', 'skip']);
  });
});

describe('upsertGroupDirectoryLinks', () => {
  it('deux passes successives ne produisent aucun doublon', async () => {
    const { store, rows, provenance } = memoryStore();
    const candidates = [
      { platform: 'twitter', url: 'https://x.com/sebchenu' },
      { platform: 'facebook', url: 'https://www.facebook.com/chenu.sebastien' },
    ];

    const first = await upsertGroupDirectoryLinks(
      store,
      'official-1',
      candidates,
      PROVENANCE,
    );
    const second = await upsertGroupDirectoryLinks(
      store,
      'official-1',
      candidates,
      PROVENANCE,
    );

    expect(first).toMatchObject({ created: 2, skipped: 0 });
    expect(second).toMatchObject({ created: 0, skipped: 2 });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === 'pending')).toBe(true);
    expect(rows.every((row) => row.source === 'group_directory')).toBe(true);
    // Une provenance par lien créé, pas une de plus à la seconde passe.
    expect(provenance).toHaveLength(2);
    expect(provenance[0].pageUrl).toBe(PROVENANCE.pageUrl);
  });

  it('ne fait aucune écriture pour une liste vide', async () => {
    const { store, rows } = memoryStore();
    const result = await upsertGroupDirectoryLinks(
      store,
      'official-1',
      [],
      PROVENANCE,
    );
    expect(result).toEqual({ created: 0, skipped: 0, skips: [] });
    expect(rows).toHaveLength(0);
  });
});
