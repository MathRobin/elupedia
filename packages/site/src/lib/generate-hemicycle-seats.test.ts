import { describe, it, expect } from 'vitest';
import { generateHemicycleSeats } from './generate-hemicycle-seats.js';

describe('generateHemicycleSeats', () => {
  it('returns an empty array for 0 seats', () => {
    expect(generateHemicycleSeats(0)).toEqual([]);
  });

  it('returns exactly N coordinates', () => {
    for (const n of [1, 5, 348, 577]) {
      expect(generateHemicycleSeats(n)).toHaveLength(n);
    }
  });

  it('keeps every seat within the expected radius range', () => {
    for (const [x, y] of generateHemicycleSeats(348)) {
      const radius = Math.hypot(x, y);
      expect(radius).toBeGreaterThanOrEqual(20);
      expect(radius).toBeLessThanOrEqual(96);
      expect(y).toBeGreaterThanOrEqual(-0.001);
    }
  });

  it('produces no duplicate coordinates', () => {
    const coords = generateHemicycleSeats(348);
    const unique = new Set(
      coords.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`),
    );
    expect(unique.size).toBe(coords.length);
  });
});
