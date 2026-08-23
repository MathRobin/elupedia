import { describe, it, expect, vi } from 'vitest';
import {
  fetchActivities,
  QUESTIONS_ECRITES_URL,
  QUESTIONS_GOUVERNEMENT_URL,
} from './an-activite.js';
import AdmZip from 'adm-zip';

function makeQuestionJson(
  uid: string,
  acteurRef: string,
  opts: {
    type?: 'QE' | 'QG';
    rubrique?: string;
    analyse?: string;
    dateJO?: string;
    useFallbackDate?: boolean;
  } = {},
): unknown {
  const {
    type = 'QE',
    rubrique = 'logement',
    analyse = 'Réforme du logement social',
    dateJO = '2025-03-15',
    useFallbackDate = false,
  } = opts;

  return {
    question: {
      uid,
      type,
      indexationAN: {
        rubrique,
        analyses: { analyse },
      },
      auteur: {
        identite: { acteurRef, mandatRef: 'PM000001' },
        groupe: { organeRef: 'PO845407', abrege: 'EPR' },
      },
      textesQuestion: useFallbackDate
        ? null
        : {
            texteQuestion: {
              infoJO: { typeJO: 'JO_QUESTION', dateJO },
              texte: 'Question text...',
            },
          },
      minAttribs: {
        minAttrib: {
          infoJO: { typeJO: 'JO_DEBAT', dateJO },
        },
      },
    },
  };
}

function buildZipBuffer(questions: { uid: string; data: unknown }[]): Buffer {
  const zip = new AdmZip();
  for (const q of questions) {
    zip.addFile(`json/${q.uid}.json`, Buffer.from(JSON.stringify(q.data)));
  }
  return zip.toBuffer();
}

function mockFetch(urlMap: Map<string, Buffer>, status = 200): typeof fetch {
  return vi.fn().mockImplementation((url: string) => {
    const buffer = urlMap.get(url) ?? buildZipBuffer([]);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Internal Server Error',
      arrayBuffer: () =>
        Promise.resolve(
          buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
          ),
        ),
    });
  }) as unknown as typeof fetch;
}

function defaultUrlMap(
  qeQuestions: { uid: string; data: unknown }[] = [],
  qgQuestions: { uid: string; data: unknown }[] = [],
): Map<string, Buffer> {
  const map = new Map<string, Buffer>();
  map.set(QUESTIONS_ECRITES_URL, buildZipBuffer(qeQuestions));
  map.set(QUESTIONS_GOUVERNEMENT_URL, buildZipBuffer(qgQuestions));
  return map;
}

describe('AN activité client', () => {
  it('parses written questions and groups by deputy', async () => {
    const q1 = makeQuestionJson('QE001', 'PA100001', {
      rubrique: 'logement',
      analyse: 'Réforme du logement social',
      dateJO: '2025-03-15',
    });
    const q2 = makeQuestionJson('QE002', 'PA100001', {
      rubrique: 'santé',
      analyse: 'Accès aux soins',
      dateJO: '2025-04-10',
    });
    const q3 = makeQuestionJson('QE003', 'PA100002', {
      rubrique: 'éducation',
      analyse: 'Carte scolaire',
      dateJO: '2025-05-01',
    });

    const urlMap = defaultUrlMap(
      [
        { uid: 'QE001', data: q1 },
        { uid: 'QE002', data: q2 },
        { uid: 'QE003', data: q3 },
      ],
      [],
    );

    const result = await fetchActivities(mockFetch(urlMap));

    expect(result).toHaveLength(2);

    const dep1 = result.find((d) => d.id_an === 'PA100001');
    expect(dep1).toBeDefined();
    expect(dep1!.activities).toHaveLength(2);
    expect(dep1!.activities[0].type).toBe('written_question');
    expect(dep1!.activities[0].title).toBe('Réforme du logement social');

    const dep2 = result.find((d) => d.id_an === 'PA100002');
    expect(dep2!.activities).toHaveLength(1);
    expect(dep2!.activities[0].date).toBe('2025-05-01');
  });

  it('parses oral questions (questions au gouvernement)', async () => {
    const qg = makeQuestionJson('QG001', 'PA100001', {
      type: 'QG',
      rubrique: 'outre-mer',
      analyse: 'Continuité territoriale',
      dateJO: '2025-02-12',
      useFallbackDate: true,
    });

    const urlMap = defaultUrlMap([], [{ uid: 'QG001', data: qg }]);
    const result = await fetchActivities(mockFetch(urlMap));

    expect(result).toHaveLength(1);
    expect(result[0].activities[0].type).toBe('oral_question');
    expect(result[0].activities[0].title).toBe('Continuité territoriale');
    expect(result[0].activities[0].date).toBe('2025-02-12');
  });

  it('merges activities from both question types', async () => {
    const qe = makeQuestionJson('QE010', 'PA100001', {
      analyse: 'Question écrite',
      dateJO: '2025-01-01',
    });
    const qg = makeQuestionJson('QG010', 'PA100001', {
      type: 'QG',
      analyse: 'Question orale',
      dateJO: '2025-02-01',
    });

    const urlMap = defaultUrlMap(
      [{ uid: 'QE010', data: qe }],
      [{ uid: 'QG010', data: qg }],
    );
    const result = await fetchActivities(mockFetch(urlMap));

    expect(result).toHaveLength(1);
    expect(result[0].activities).toHaveLength(2);
    const types = result[0].activities.map((a) => a.type).sort();
    expect(types).toEqual(['oral_question', 'written_question']);
  });

  it('throws on HTTP error', async () => {
    const urlMap = new Map<string, Buffer>();
    await expect(fetchActivities(mockFetch(urlMap, 500))).rejects.toThrow(
      'AN activité API error: 500',
    );
  });

  it('uses rubrique as fallback title when analyse is missing', async () => {
    const q = makeQuestionJson('QE020', 'PA100001', {
      rubrique: 'agriculture',
      analyse: '',
      dateJO: '2025-06-01',
    });

    const urlMap = defaultUrlMap([{ uid: 'QE020', data: q }], []);
    const result = await fetchActivities(mockFetch(urlMap));

    expect(result[0].activities[0].title).toBe('agriculture');
  });

  it('skips questions without acteurRef', async () => {
    const badQuestion = {
      question: {
        uid: 'QE030',
        type: 'QE',
        indexationAN: { rubrique: 'test', analyses: { analyse: 'Test' } },
        auteur: { identite: {} },
        textesQuestion: {
          texteQuestion: {
            infoJO: { dateJO: '2025-01-01' },
          },
        },
      },
    };

    const urlMap = defaultUrlMap([{ uid: 'QE030', data: badQuestion }], []);
    const result = await fetchActivities(mockFetch(urlMap));

    expect(result).toHaveLength(0);
  });

  it('skips questions without extractable date', async () => {
    const noDateQuestion = {
      question: {
        uid: 'QE040',
        type: 'QE',
        indexationAN: { rubrique: 'test', analyses: { analyse: 'Test' } },
        auteur: { identite: { acteurRef: 'PA100001' } },
        textesQuestion: null,
        minAttribs: null,
      },
    };

    const urlMap = defaultUrlMap([{ uid: 'QE040', data: noDateQuestion }], []);
    const result = await fetchActivities(mockFetch(urlMap));

    expect(result).toHaveLength(0);
  });

  it('returns empty for empty ZIPs', async () => {
    const urlMap = defaultUrlMap([], []);
    const result = await fetchActivities(mockFetch(urlMap));
    expect(result).toHaveLength(0);
  });
});
