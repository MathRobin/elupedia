import { describe, it, expect, vi } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const DRIZZLE_NAME = Symbol.for('drizzle:Name');
function getTableName(table: unknown): string {
  return (table as Record<symbol, string>)[DRIZZLE_NAME] ?? 'unknown';
}

function makeThenable(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return Object.assign(promise, {
    where: () => makeThenable(rows),
    limit: (n: number) => Promise.resolve(rows.slice(0, n)),
  });
}

function createMockDb(
  seed: Partial<Record<string, Record<string, unknown>[]>> = {},
) {
  const store: Record<string, Record<string, unknown>[]> = {
    officials: [],
    parliamentary_activity: [],
    data_provenance: [],
    ...seed,
  };

  const db = {
    select: () => ({
      from: (table: unknown) => makeThenable(store[getTableName(table)] ?? []),
    }),
    insert: (table: unknown) => {
      const name = getTableName(table);
      return {
        values: (values: Record<string, unknown>) => {
          const row = { id: crypto.randomUUID(), ...values };
          store[name]?.push(row);
          return { returning: () => Promise.resolve([row]) };
        },
      };
    },
    delete: (table: unknown) => ({
      where: () => {
        store[getTableName(table)] = [];
        return Promise.resolve();
      },
    }),
  };

  return { db, store };
}

function mockFetchSequence(responses: unknown[]) {
  let i = 0;
  return vi.fn().mockImplementation(async () => {
    const body = responses[Math.min(i, responses.length - 1)];
    i++;
    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    };
  }) as unknown as typeof fetch;
}

const writtenQuestion = {
  id: 'eli/dl/doc/E-10-2024-000001',
  document_date: '2025-01-10',
  work_type: 'def/ep-document-types/QUESTION_WRITTEN',
  identifier: 'E-10-2024-000001',
  title_dcterms: { fr: 'Une question française' },
  workHadParticipation: [
    {
      participation_role: 'def/ep-roles/AUTHOR',
      had_participant_person: ['person/131580'],
    },
    {
      participation_role: 'def/ep-roles/ADDRESSEE',
      had_participant_organization: ['org/CS'],
    },
  ],
};

describe('upsertEuropeQuestions', () => {
  it('creates an activity row only for a matched French MEP author', async () => {
    const officialId = 'official-bardella';
    const { db, store } = createMockDb({
      officials: [{ id: officialId, europarlId: '131580' }],
    });

    const fetchFn = mockFetchSequence([
      {
        data: [
          {
            identifier: 'E-10-2024-000001',
            work_type: writtenQuestion.work_type,
          },
        ],
      },
      { data: [writtenQuestion] },
      { data: [] },
    ]);

    const { upsertEuropeQuestions } = await import('./europe-questions.js');
    const summary = await upsertEuropeQuestions(db as never, {
      pageSize: 1,
      maxPages: 2,
      rateLimitDelayMs: 0,
      fetchFn,
    });

    expect(summary.scanned).toBe(1);
    expect(summary.matched).toBe(1);
    expect(summary.created).toBe(1);
    expect(store.parliamentary_activity).toHaveLength(1);
    expect(store.parliamentary_activity[0]).toMatchObject({
      officialId,
      type: 'written_question',
      source: 'europarl',
      title: 'Une question française',
      date: '2025-01-10',
      governmentComments: 'Conseil',
    });
  });

  it('skips a question whose author is not a known French MEP', async () => {
    const { db, store } = createMockDb({ officials: [] });
    const fetchFn = mockFetchSequence([
      {
        data: [
          {
            identifier: 'E-10-2024-000001',
            work_type: writtenQuestion.work_type,
          },
        ],
      },
      { data: [writtenQuestion] },
      { data: [] },
    ]);

    const { upsertEuropeQuestions } = await import('./europe-questions.js');
    const summary = await upsertEuropeQuestions(db as never, {
      pageSize: 1,
      maxPages: 2,
      rateLimitDelayMs: 0,
      fetchFn,
    });

    expect(summary.matched).toBe(0);
    expect(summary.created).toBe(0);
    expect(store.parliamentary_activity).toHaveLength(0);
  });

  it('creates one row per co-signing French MEP', async () => {
    const marie = 'official-marie';
    const jordan = 'official-jordan';
    const { db, store } = createMockDb({
      officials: [
        { id: marie, europarlId: '257083' },
        { id: jordan, europarlId: '131580' },
      ],
    });
    const cosigned = structuredClone(writtenQuestion);
    cosigned.workHadParticipation[0].had_participant_person = [
      'person/257083',
      'person/131580',
    ];
    const fetchFn = mockFetchSequence([
      {
        data: [
          { identifier: 'E-10-2024-000001', work_type: cosigned.work_type },
        ],
      },
      { data: [cosigned] },
      { data: [] },
    ]);

    const { upsertEuropeQuestions } = await import('./europe-questions.js');
    const summary = await upsertEuropeQuestions(db as never, {
      pageSize: 1,
      maxPages: 2,
      rateLimitDelayMs: 0,
      fetchFn,
    });

    expect(summary.created).toBe(2);
    expect(
      store.parliamentary_activity.map((r) => r.officialId).sort(),
    ).toEqual([jordan, marie].sort());
  });

  it('does not duplicate a question already ingested for that official', async () => {
    const officialId = 'official-bardella';
    const { db, store } = createMockDb({
      officials: [{ id: officialId, europarlId: '131580' }],
      parliamentary_activity: [
        {
          id: 'existing-1',
          officialId,
          source: 'europarl',
          title: 'Une question française',
          date: '2025-01-10',
        },
      ],
    });
    const fetchFn = mockFetchSequence([
      {
        data: [
          {
            identifier: 'E-10-2024-000001',
            work_type: writtenQuestion.work_type,
          },
        ],
      },
      { data: [writtenQuestion] },
      { data: [] },
    ]);

    const { upsertEuropeQuestions } = await import('./europe-questions.js');
    const summary = await upsertEuropeQuestions(db as never, {
      pageSize: 1,
      maxPages: 2,
      rateLimitDelayMs: 0,
      fetchFn,
    });

    expect(summary.created).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(store.parliamentary_activity).toHaveLength(1);
  });

  it('resumes from the persisted cursor instead of restarting at 0', async () => {
    const { db, store } = createMockDb({
      officials: [],
      data_provenance: [
        {
          id: 'cursor-row',
          sourceTable: 'europarl_questions_cursor',
          sourceRecordId: 'cursor',
          rawData: { offset: 500 },
        },
      ],
    });
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    });

    const { upsertEuropeQuestions } = await import('./europe-questions.js');
    await upsertEuropeQuestions(db as never, {
      pageSize: 25,
      maxPages: 1,
      rateLimitDelayMs: 0,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('offset=500'));
    const cursorRow = store.data_provenance.find(
      (r) => r.sourceRecordId === 'cursor',
    );
    expect((cursorRow?.rawData as { offset: number }).offset).toBe(0); // dataset exhausted -> repart à 0
  });

  it('persists the advanced cursor when the dataset is not exhausted', async () => {
    const { db, store } = createMockDb({ officials: [] });
    const fetchFn = mockFetchSequence([
      {
        data: [
          {
            identifier: 'E-10-2024-000001',
            work_type: writtenQuestion.work_type,
          },
        ],
      },
      { data: [writtenQuestion] },
    ]);

    const { upsertEuropeQuestions } = await import('./europe-questions.js');
    const summary = await upsertEuropeQuestions(db as never, {
      pageSize: 1,
      maxPages: 1,
      rateLimitDelayMs: 0,
      fetchFn,
    });

    expect(summary.exhausted).toBe(false);
    expect(summary.cursorEnd).toBe(1);
    const cursorRow = store.data_provenance.find(
      (r) => r.sourceRecordId === 'cursor',
    );
    expect((cursorRow?.rawData as { offset: number }).offset).toBe(1);
  });
});

describe('upsertEuropeQuestions — résilience au rate limit (incident du 29/09/2026)', () => {
  it('never throws when the list page fetch fails, and saves the cursor before that page rather than losing progress', async () => {
    const { db, store } = createMockDb({ officials: [] });
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: () => Promise.resolve({}),
    });

    const { upsertEuropeQuestions } = await import('./europe-questions.js');
    // Ne doit pas lever : `runStep` (run-europe.ts) rejoue toute la fonction
    // sur une exception, ce qui reprendrait à l'offset chargé au démarrage —
    // aggravant le rate limit plutôt que de s'en remettre.
    const summary = await upsertEuropeQuestions(db as never, {
      pageSize: 10,
      maxPages: 3,
      rateLimitDelayMs: 0,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(summary.exhausted).toBe(false);
    expect(summary.cursorEnd).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(1); // pas de nouvel essai en boucle sur la même page
    const cursorRow = store.data_provenance.find(
      (r) => r.sourceRecordId === 'cursor',
    );
    expect((cursorRow?.rawData as { offset: number }).offset).toBe(0);
  });

  it('stops after MAX_CONSECUTIVE_FAILURES detail fetch errors instead of burning through the rest of a doomed page', async () => {
    const { db } = createMockDb({ officials: [] });
    const listResponse = {
      data: Array.from({ length: 10 }, (_, i) => ({
        identifier: `E-10-2024-00000${i}`,
        work_type: writtenQuestion.work_type,
      })),
    };
    let detailCalls = 0;
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('offset=')) {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve(listResponse),
        };
      }
      detailCalls++;
      return { ok: false, status: 429, statusText: 'Too Many Requests' };
    });

    const { upsertEuropeQuestions } = await import('./europe-questions.js');
    const summary = await upsertEuropeQuestions(db as never, {
      pageSize: 10,
      maxPages: 1,
      rateLimitDelayMs: 0,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(summary.scanned).toBe(5); // s'arrête après 5 échecs consécutifs, pas les 10 de la page
    expect(detailCalls).toBe(5);
    expect(summary.cursorEnd).toBe(0); // n'avance pas au-delà de la page interrompue
  });

  it('resets the consecutive-failure counter on a successful fetch, not aborting on isolated failures', async () => {
    const officialId = 'official-bardella';
    const { db, store } = createMockDb({
      officials: [{ id: officialId, europarlId: '131580' }],
    });
    let detailCallCount = 0;
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('offset=')) {
        return {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: [
                { identifier: 'bad-1', work_type: writtenQuestion.work_type },
                { identifier: 'bad-2', work_type: writtenQuestion.work_type },
                { identifier: 'bad-3', work_type: writtenQuestion.work_type },
                { identifier: 'bad-4', work_type: writtenQuestion.work_type },
                {
                  identifier: 'E-10-2024-000001',
                  work_type: writtenQuestion.work_type,
                },
              ],
            }),
        };
      }
      detailCallCount++;
      if (detailCallCount <= 4) {
        return { ok: false, status: 500, statusText: 'Internal Server Error' };
      }
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [writtenQuestion] }),
      };
    });

    const { upsertEuropeQuestions } = await import('./europe-questions.js');
    const summary = await upsertEuropeQuestions(db as never, {
      pageSize: 5,
      maxPages: 1,
      rateLimitDelayMs: 0,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    // 4 échecs (sous le seuil de 5) suivis d'un succès : le compteur repart
    // de zéro, pas d'arrêt anticipé.
    expect(summary.matched).toBe(1);
    expect(store.parliamentary_activity).toHaveLength(1);
  });
});
