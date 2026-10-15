import { describe, it, expect } from 'vitest';
import { matchMandate, type ExistingMandate } from './mandate-match.js';

const closed2023: ExistingMandate = {
  id: 'm-2023',
  type: 'senateur',
  startDate: '2023-10-02',
  endDate: '2026-09-30',
  department: null,
};
const ongoing2026: ExistingMandate = {
  id: 'm-2026',
  type: 'senateur',
  startDate: '2026-10-01',
  endDate: null,
  department: 'Yvelines',
};

describe('matchMandate', () => {
  it('keeps the closure when the source lags behind a renewal (Larcher 2026)', () => {
    const r = matchMandate([closed2023, ongoing2026], {
      type: 'senateur',
      mandat_debut: '2023-10-02',
    });
    expect(r.target?.id).toBe('m-2023');
    expect(r.endDate).toBe('2026-09-30');
  });

  it('reopens a closed mandate when no successor exists and the source says ongoing', () => {
    const r = matchMandate([closed2023], {
      type: 'senateur',
      mandat_debut: '2023-10-02',
    });
    expect(r.target?.id).toBe('m-2023');
    expect(r.endDate).toBeNull();
  });

  it('matches the ongoing mandate when start dates differ across sources', () => {
    const r = matchMandate([ongoing2026], {
      type: 'senateur',
      mandat_debut: '2026-10-04',
    });
    expect(r.target?.id).toBe('m-2026');
    expect(r.endDate).toBeNull();
  });

  it('never matches a mandate of another type', () => {
    const r = matchMandate([ongoing2026], {
      type: 'depute',
      mandat_debut: '2026-10-01',
    });
    expect(r.target).toBeNull();
  });

  it('inserts a closed mandate with its end date when unknown', () => {
    const r = matchMandate([ongoing2026], {
      type: 'senateur',
      mandat_debut: '2011-10-01',
      mandat_fin: '2017-10-01',
    });
    expect(r.target).toBeNull();
    expect(r.endDate).toBe('2017-10-01');
  });
});
