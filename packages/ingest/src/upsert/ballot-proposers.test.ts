import { describe, it, expect } from 'vitest';
import { pickGroup } from './ballot-proposers.js';

describe('pickGroup', () => {
  it('prefers the ongoing deputy mandate, else the most recent', () => {
    expect(
      pickGroup([
        { startDate: '2017-06-21', endDate: '2022-06-20', group: 'LREM' },
        { startDate: '2022-06-22', endDate: null, group: 'RN' },
      ]),
    ).toBe('RN');
    expect(
      pickGroup([
        { startDate: '2012-06-20', endDate: '2017-06-20', group: 'PS' },
        { startDate: '2017-06-21', endDate: '2022-06-20', group: 'LREM' },
      ]),
    ).toBe('LREM');
    expect(pickGroup([])).toBeNull();
  });
});
