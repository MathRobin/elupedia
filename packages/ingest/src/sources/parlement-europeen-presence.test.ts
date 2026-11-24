/**
 * Tests de parlement-europeen-presence.ts : extrait anonymisé d'une réponse
 * `/meetings/{id}` (listes réduites à quelques identifiants fictifs, structure
 * et noms de champs conformes à la réponse réelle du 21 octobre 2024).
 * Aucun appel réseau.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  fetchSittingAttendance,
  attendanceListUrl,
} from './parlement-europeen-presence.js';

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

/** Extrait anonymisé : 3 signataires, 2 excusés, champs annexes conservés. */
const MEETING_EXTRACT = {
  data: [
    {
      id: 'eli/dl/event/MTG-PL-2024-10-21',
      type: 'Activity',
      activity_id: 'MTG-PL-2024-10-21',
      activity_date: '2024-10-21',
      activity_end_date: '2024-10-21T23:00:00+02:00',
      had_activity_type: 'def/ep-activities/PLENARY_SITTING',
      had_participant_person: [
        'person/900001',
        'person/900002',
        'person/900003',
      ],
      had_excused_person: ['person/900004', 'person/900005'],
      number_of_attendees: 3,
      parliamentary_term: 'org/ep-10',
      recorded_in_a_realization_of: [
        'eli/dl/doc/PV-10-2024-10-21-ATT',
        'eli/dl/doc/CRE-10-2024-10-21',
        'eli/dl/doc/PV-10-2024-10-21-RCV',
        'eli/dl/doc/PV-10-2024-10-21',
      ],
    },
  ],
};

describe('fetchSittingAttendance', () => {
  it('reads the register signatures of a sitting', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(MEETING_EXTRACT),
      ) as unknown as typeof fetch;

    const result = await fetchSittingAttendance(fetchFn, 'MTG-PL-2024-10-21');

    expect(result).toEqual({
      sittingId: 'MTG-PL-2024-10-21',
      date: '2024-10-21',
      signedPersonIds: ['900001', '900002', '900003'],
      excusedPersonIds: ['900004', '900005'],
      attendeeCount: 3,
      attendanceListUrl:
        'https://data.europarl.europa.eu/distribution/doc/PV-10-2024-10-21-ATT_fr.pdf',
    });
  });

  it('returns null for a sitting without a record (404)', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(null, 404)) as unknown as typeof fetch;
    expect(
      await fetchSittingAttendance(fetchFn, 'MTG-PL-2030-01-01'),
    ).toBeNull();
  });

  it('throws on other HTTP errors', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(null, 500)) as unknown as typeof fetch;
    await expect(
      fetchSittingAttendance(fetchFn, 'MTG-PL-2024-10-21'),
    ).rejects.toThrow('/meetings/MTG-PL-2024-10-21 error: 500');
  });

  it('tolerates a sitting without attendance lists', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            activity_id: 'MTG-PL-2024-11-19',
            activity_date: '2024-11-19',
          },
        ],
      }),
    ) as unknown as typeof fetch;

    expect(await fetchSittingAttendance(fetchFn, 'MTG-PL-2024-11-19')).toEqual({
      sittingId: 'MTG-PL-2024-11-19',
      date: '2024-11-19',
      signedPersonIds: [],
      excusedPersonIds: [],
      attendeeCount: null,
      attendanceListUrl: null,
    });
  });
});

describe('attendanceListUrl', () => {
  it('never invents a URL when the annex is missing', () => {
    expect(attendanceListUrl(['eli/dl/doc/PV-10-2024-10-21'])).toBeNull();
  });

  it('builds the PDF URL from the annex identifier', () => {
    expect(attendanceListUrl(['eli/dl/doc/PV-10-2025-01-20-ATT'])).toBe(
      'https://data.europarl.europa.eu/distribution/doc/PV-10-2025-01-20-ATT_fr.pdf',
    );
  });
});
