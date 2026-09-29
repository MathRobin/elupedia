import { describe, it, expect, vi } from 'vitest';
import {
  fetchQuestionsListPage,
  fetchQuestionDetail,
} from './parlement-europeen-questions.js';

function mockFetchJson(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: 'Error',
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe('fetchQuestionsListPage', () => {
  it('parses list items and strips the vocabulary prefix from work_type', async () => {
    const mockFetch = mockFetchJson({
      data: [
        {
          id: 'eli/dl/doc/E-10-2024-001357',
          type: 'Work',
          work_type: 'def/ep-document-types/QUESTION_WRITTEN',
          identifier: 'E-10-2024-001357',
        },
      ],
    });

    const result = await fetchQuestionsListPage(0, 25, mockFetch);
    expect(result).toEqual([
      { identifier: 'E-10-2024-001357', workType: 'QUESTION_WRITTEN' },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/parliamentary-questions?offset=0&limit=25'),
    );
  });

  it('skips items without a work_type', async () => {
    const mockFetch = mockFetchJson({
      data: [{ id: 'x', type: 'Work', identifier: 'x' }],
    });
    const result = await fetchQuestionsListPage(0, 25, mockFetch);
    expect(result).toEqual([]);
  });

  it('returns an empty array for an exhausted page (dataset end)', async () => {
    const mockFetch = mockFetchJson({ data: [] });
    const result = await fetchQuestionsListPage(1000000, 25, mockFetch);
    expect(result).toEqual([]);
  });

  it('throws on HTTP error', async () => {
    const mockFetch = mockFetchJson({}, false, 500);
    await expect(fetchQuestionsListPage(0, 25, mockFetch)).rejects.toThrow(
      'Parlement européen /parliamentary-questions error: 500',
    );
  });
});

describe('fetchQuestionDetail', () => {
  // Forme réelle observée le 29/09/2026 sur
  // /api/v2/parliamentary-questions/E-10-2024-001357
  const writtenQuestionDoc = {
    data: [
      {
        id: 'eli/dl/doc/E-10-2024-001357',
        type: 'Work',
        document_date: '2024-07-16',
        work_type: 'def/ep-document-types/QUESTION_WRITTEN',
        identifier: 'E-10-2024-001357',
        title_dcterms: {
          en: 'Suspension of the EU-Israel Association Agreement',
          fr: "Suspension de l'accord d'association UE-Israël",
        },
        workHadParticipation: [
          {
            id: 'eli/dl/participation/E-10-2024-001357_257083',
            type: 'Participation',
            had_participant_person: ['person/257083'],
            participation_role: 'def/ep-roles/AUTHOR',
          },
          {
            id: 'eli/dl/participation/E-10-2024-001357_CS',
            type: 'Participation',
            had_participant_organization: ['org/CS'],
            participation_role: 'def/ep-roles/ADDRESSEE',
          },
        ],
        inverse_answers_to: [
          {
            id: 'eli/dl/doc/E-10-2024-001357-ASW',
            work_type: 'def/ep-document-types/QUESTION_WRITTEN_ANSWER',
            document_date: '2025-02-26',
          },
        ],
      },
    ],
  };

  it('parses a written question with its author, addressee and answer date', async () => {
    const mockFetch = mockFetchJson(writtenQuestionDoc);
    const result = await fetchQuestionDetail('E-10-2024-001357', mockFetch);
    expect(result).toEqual({
      identifier: 'E-10-2024-001357',
      type: 'written_question',
      title: "Suspension de l'accord d'association UE-Israël",
      date: '2024-07-16',
      authorPersonIds: ['person/257083'],
      addressee: 'Conseil',
      responseDate: '2025-02-26',
      sourceUrl:
        'https://www.europarl.europa.eu/doceo/document/E-10-2024-001357_FR.html',
    });
  });

  it('falls back to English title when French is not available', async () => {
    const doc = structuredClone(writtenQuestionDoc);
    delete doc.data[0].title_dcterms.fr;
    const mockFetch = mockFetchJson(doc);
    const result = await fetchQuestionDetail('E-10-2024-001357', mockFetch);
    expect(result?.title).toBe(
      'Suspension of the EU-Israel Association Agreement',
    );
  });

  it('handles co-signed questions with multiple authors', async () => {
    const doc = structuredClone(writtenQuestionDoc);
    doc.data[0].workHadParticipation[0].had_participant_person = [
      'person/257083',
      'person/131580',
    ];
    const mockFetch = mockFetchJson(doc);
    const result = await fetchQuestionDetail('E-10-2024-001357', mockFetch);
    expect(result?.authorPersonIds).toEqual(['person/257083', 'person/131580']);
  });

  it('has no response date when the question has not been answered yet', async () => {
    const doc = structuredClone(writtenQuestionDoc);
    delete doc.data[0].inverse_answers_to;
    const mockFetch = mockFetchJson(doc);
    const result = await fetchQuestionDetail('E-10-2024-001357', mockFetch);
    expect(result?.responseDate).toBeNull();
  });

  it('maps oral questions and interpellations to their own activity type', async () => {
    const oral = structuredClone(writtenQuestionDoc);
    oral.data[0].work_type = 'def/ep-document-types/QUESTION_ORAL';
    expect((await fetchQuestionDetail('x', mockFetchJson(oral)))?.type).toBe(
      'oral_question',
    );

    const interpellation = structuredClone(writtenQuestionDoc);
    interpellation.data[0].work_type =
      'def/ep-document-types/INTERPELLATION_MAJOR';
    expect(
      (await fetchQuestionDetail('x', mockFetchJson(interpellation)))?.type,
    ).toBe('interpellation');
  });

  it('returns null for a work_type that is not a question (e.g. an answer document fetched directly)', async () => {
    const answer = structuredClone(writtenQuestionDoc);
    answer.data[0].work_type = 'def/ep-document-types/QUESTION_WRITTEN_ANSWER';
    const result = await fetchQuestionDetail('x', mockFetchJson(answer));
    expect(result).toBeNull();
  });

  it('returns null when no author participation is present', async () => {
    const doc = structuredClone(writtenQuestionDoc);
    doc.data[0].workHadParticipation = doc.data[0].workHadParticipation.filter(
      (p) => p.participation_role !== 'def/ep-roles/AUTHOR',
    );
    const result = await fetchQuestionDetail('x', mockFetchJson(doc));
    expect(result).toBeNull();
  });

  it('throws on HTTP error, so the caller can count consecutive failures and detect a rate limit (incident du 29/09/2026)', async () => {
    const mockFetch = mockFetchJson({}, false, 429);
    await expect(fetchQuestionDetail('missing', mockFetch)).rejects.toThrow(
      'Parlement européen /parliamentary-questions/missing error: 429',
    );
  });
});
