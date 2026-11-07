/** Tests de mandate-labels.ts : choix du mandat principal entre mandats cumulés. */
import { describe, it, expect } from 'vitest';
import { pickPrimaryMandate } from './mandate-labels.js';

describe('pickPrimaryMandate', () => {
  it('prefers the parliamentary mandate over a more recent local one', () => {
    const rows = [
      {
        mandateType: 'conseiller_communautaire',
        startDate: '2026-03-22',
        endDate: null,
      },
      { mandateType: 'depute', startDate: '2024-07-07', endDate: null },
    ];
    expect(pickPrimaryMandate(rows)?.mandateType).toBe('depute');
  });
  it('falls back on the most recent start date within the same type', () => {
    const rows = [
      { mandateType: 'maire', startDate: '2020-05-18', endDate: null },
      { mandateType: 'maire', startDate: '2026-03-20', endDate: null },
    ];
    expect(pickPrimaryMandate(rows)?.startDate).toBe('2026-03-20');
  });
  it('uses the most recently ended mandate when none is active', () => {
    const rows = [
      { mandateType: 'depute', startDate: '2017-06-18', endDate: '2022-06-21' },
      { mandateType: 'maire', startDate: '2020-05-18', endDate: '2026-03-20' },
    ];
    expect(pickPrimaryMandate(rows)?.mandateType).toBe('maire');
  });
  it('ranks unknown types last and returns null for an empty list', () => {
    const rows = [
      { mandateType: 'inconnu', startDate: '2030-01-01', endDate: null },
      {
        mandateType: 'conseiller_arrondissement',
        startDate: '2020-01-01',
        endDate: null,
      },
    ];
    expect(pickPrimaryMandate(rows)?.mandateType).toBe(
      'conseiller_arrondissement',
    );
    expect(pickPrimaryMandate([])).toBeNull();
  });
});
