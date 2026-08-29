import { describe, it, expect } from 'vitest';
import { filterActivitiesForPartial } from './partial.js';
import type { DeputeActivity } from '../sources/an-activite.js';

function makeActivity(
  overrides: Partial<DeputeActivity['activities'][0]> = {},
): DeputeActivity['activities'][0] {
  return {
    type: 'written_question',
    title: 'Test question',
    date: '2026-06-01',
    ...overrides,
  };
}

describe('filterActivitiesForPartial', () => {
  const now = new Date('2026-08-29');

  it('keeps activities for active deputies', () => {
    const activities: DeputeActivity[] = [
      { id_an: 'PA001', activities: [makeActivity()] },
    ];
    const { filtered, stats } = filterActivitiesForPartial(
      activities,
      new Set(['PA001']),
      new Set(),
      now,
    );
    expect(filtered).toHaveLength(1);
    expect(stats.totalAfter).toBe(1);
  });

  it('excludes deceased deputies', () => {
    const activities: DeputeActivity[] = [
      { id_an: 'PA001', activities: [makeActivity(), makeActivity()] },
    ];
    const { filtered, stats } = filterActivitiesForPartial(
      activities,
      new Set(),
      new Set(['PA001']),
      now,
    );
    expect(filtered).toHaveLength(0);
    expect(stats.excludedDeceased).toBe(2);
    expect(stats.totalAfter).toBe(0);
  });

  it('excludes deputies with ended mandates', () => {
    const activities: DeputeActivity[] = [
      { id_an: 'PA002', activities: [makeActivity()] },
    ];
    const { filtered, stats } = filterActivitiesForPartial(
      activities,
      new Set(['PA001']),
      new Set(),
      now,
    );
    expect(filtered).toHaveLength(0);
    expect(stats.excludedEndedMandate).toBe(1);
  });

  it('excludes questions with old response (>3 months)', () => {
    const activities: DeputeActivity[] = [
      {
        id_an: 'PA001',
        activities: [
          makeActivity({ responseDate: '2026-04-01' }),
          makeActivity({ responseDate: undefined }),
        ],
      },
    ];
    const { filtered, stats } = filterActivitiesForPartial(
      activities,
      new Set(['PA001']),
      new Set(),
      now,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].activities).toHaveLength(1);
    expect(stats.excludedOldResponse).toBe(1);
    expect(stats.totalAfter).toBe(1);
  });

  it('keeps questions without response (even if old)', () => {
    const activities: DeputeActivity[] = [
      {
        id_an: 'PA001',
        activities: [makeActivity({ date: '2020-01-01' })],
      },
    ];
    const { filtered, stats } = filterActivitiesForPartial(
      activities,
      new Set(['PA001']),
      new Set(),
      now,
    );
    expect(filtered).toHaveLength(1);
    expect(stats.excludedOldResponse).toBe(0);
  });

  it('handles exactly 3 months boundary (cutoff)', () => {
    const activities: DeputeActivity[] = [
      {
        id_an: 'PA001',
        activities: [
          makeActivity({ responseDate: '2026-05-29' }),
          makeActivity({ responseDate: '2026-05-28' }),
        ],
      },
    ];
    const { filtered, stats } = filterActivitiesForPartial(
      activities,
      new Set(['PA001']),
      new Set(),
      now,
    );
    expect(filtered[0].activities).toHaveLength(1);
    expect(stats.excludedOldResponse).toBe(1);
  });

  it('deceased takes priority over ended mandate', () => {
    const activities: DeputeActivity[] = [
      { id_an: 'PA001', activities: [makeActivity()] },
    ];
    const { stats } = filterActivitiesForPartial(
      activities,
      new Set(),
      new Set(['PA001']),
      now,
    );
    expect(stats.excludedDeceased).toBe(1);
    expect(stats.excludedEndedMandate).toBe(0);
  });

  it('combines all filters', () => {
    const activities: DeputeActivity[] = [
      { id_an: 'PA_DEAD', activities: [makeActivity()] },
      { id_an: 'PA_ENDED', activities: [makeActivity()] },
      {
        id_an: 'PA_ACTIVE',
        activities: [
          makeActivity({ responseDate: '2026-01-01' }),
          makeActivity({ responseDate: '2026-08-01' }),
          makeActivity(),
        ],
      },
    ];
    const { filtered, stats } = filterActivitiesForPartial(
      activities,
      new Set(['PA_ACTIVE']),
      new Set(['PA_DEAD']),
      now,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].activities).toHaveLength(2);
    expect(stats.excludedDeceased).toBe(1);
    expect(stats.excludedEndedMandate).toBe(1);
    expect(stats.excludedOldResponse).toBe(1);
    expect(stats.totalAfter).toBe(2);
  });
});
