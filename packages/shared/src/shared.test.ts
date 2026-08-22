import { describe, it, expect } from 'vitest';
import { createDb } from './db.js';

describe('@elupedia/shared', () => {
  it('exports createDb function', () => {
    expect(typeof createDb).toBe('function');
  });

  it('createDb throws without DATABASE_URL', () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(() => createDb()).toThrow('DATABASE_URL is not set');
    } finally {
      if (original !== undefined) {
        process.env.DATABASE_URL = original;
      }
    }
  });
});
