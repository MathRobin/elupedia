import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('reconcileTable (via reconcileElections) — pagination par curseur', () => {
  it('parcourt plusieurs pages jusqu’à une page vide et cumule updated/total', async () => {
    const { reconcileElections } = await import('./reconcile-elections.js');
    const { municipalCandidates, legislativeCandidates, senatorialCandidates } =
      await import('@elupedia/shared');

    // officials : une seule fiche, "Jean Dupont", pour matcher un candidat
    // réparti sur deux pages de municipales — les autres tables ne renvoient
    // qu'une page vide (aucun candidat).
    const officialsRows = [
      { id: 'official-1', firstName: 'Jean', lastName: 'Dupont' },
    ];
    const municipalPage1 = [
      { id: 'cand-1', nom: 'Dupont', prenom: 'Jean' },
      { id: 'cand-2', nom: 'Martin', prenom: 'Alice' },
    ];
    const municipalPage2 = [{ id: 'cand-3', nom: 'Durand', prenom: 'Paul' }];

    const pagesByTable = new Map<unknown, unknown[][]>([
      [municipalCandidates, [municipalPage1, municipalPage2, []]],
      [legislativeCandidates, [[]]],
      [senatorialCandidates, [[]]],
    ]);
    const pageIndexByTable = new Map<unknown, number>();
    const updates: { table: unknown; officialId: string }[] = [];
    let selectCallCount = 0;

    const db = {
      select: () => ({
        from: (table: unknown) => {
          selectCallCount++;
          if (selectCallCount === 1) {
            // Premier select de reconcileElections : la liste des officials.
            return Promise.resolve(officialsRows);
          }
          return {
            where: () => ({
              orderBy: () => ({
                limit: () => {
                  const idx = pageIndexByTable.get(table) ?? 0;
                  pageIndexByTable.set(table, idx + 1);
                  const page = pagesByTable.get(table)?.[idx] ?? [];
                  return Promise.resolve(page);
                },
              }),
            }),
          };
        },
      }),
      update: (table: unknown) => ({
        set: (values: { officialId: string }) => ({
          where: () => {
            updates.push({ table, officialId: values.officialId });
            return Promise.resolve();
          },
        }),
      }),
      execute: () =>
        Promise.resolve({
          rows: [
            {
              muni_linked: 1,
              muni_total: 3,
              legi_linked: 0,
              legi_total: 0,
              sena_linked: 0,
              sena_total: 0,
            },
          ],
        }),
    };

    const result = await reconcileElections(db as never);

    // 2 pages consommées pour municipal_candidates (2 + 1, puis page vide
    // implicite via la longueur < BATCH_SIZE) : les 3 candidats sont bien
    // tous vus malgré la pagination, et seul "Jean Dupont" est rattaché.
    expect(result.muni).toEqual({ updated: 1, total: 3 });
    expect(result.legi).toEqual({ updated: 0, total: 0 });
    expect(result.sena).toEqual({ updated: 0, total: 0 });
    expect(updates).toEqual([
      { table: municipalCandidates, officialId: 'official-1' },
    ]);
  });
});
