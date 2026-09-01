import { describe, it, expect } from 'vitest';
import { mapCacheKey } from './static-map.js';

describe('mapCacheKey', () => {
  it('produces deterministic hash from coordinates', () => {
    const a = mapCacheKey({
      latitude: 48.8566,
      longitude: 2.3522,
      zoom: 13,
      width: 400,
      height: 200,
    });
    const b = mapCacheKey({
      latitude: 48.8566,
      longitude: 2.3522,
      zoom: 13,
      width: 400,
      height: 200,
    });
    expect(a).toMatch(/^[a-f0-9]{32}$/);
    expect(a).toBe(b);
  });

  it('produces different hashes for different coordinates', () => {
    const a = mapCacheKey({
      latitude: 48.8566,
      longitude: 2.3522,
      zoom: 13,
      width: 400,
      height: 200,
    });
    const b = mapCacheKey({
      latitude: 43.6047,
      longitude: 1.4442,
      zoom: 13,
      width: 400,
      height: 200,
    });
    expect(a).not.toBe(b);
  });
});
