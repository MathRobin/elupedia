import { describe, it, expect } from 'vitest';
import { mapPosition } from './votes.js';

describe('mapPosition', () => {
  it('maps "pour" to "for"', () => {
    expect(mapPosition('pour')).toBe('for');
  });

  it('maps "contre" to "against"', () => {
    expect(mapPosition('contre')).toBe('against');
  });

  it('maps "abstention" to "abstain"', () => {
    expect(mapPosition('abstention')).toBe('abstain');
  });

  it('maps "absent" to "absent"', () => {
    expect(mapPosition('absent')).toBe('absent');
  });

  it('maps "non-votant" to "absent"', () => {
    expect(mapPosition('non-votant')).toBe('absent');
  });

  it('maps unknown positions to "absent"', () => {
    expect(mapPosition('inconnu')).toBe('absent');
  });

  it('is case-insensitive', () => {
    expect(mapPosition('Pour')).toBe('for');
    expect(mapPosition('CONTRE')).toBe('against');
  });
});
