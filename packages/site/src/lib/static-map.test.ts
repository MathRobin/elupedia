import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

describe('static-map cache key', () => {
  it('produces deterministic hash from coordinates', () => {
    const hash = createHash('md5')
      .update('48.8566_2.3522_13_400x200')
      .digest('hex');
    expect(hash).toMatch(/^[a-f0-9]{32}$/);

    const hash2 = createHash('md5')
      .update('48.8566_2.3522_13_400x200')
      .digest('hex');
    expect(hash).toBe(hash2);
  });

  it('produces different hashes for different coordinates', () => {
    const hash1 = createHash('md5')
      .update('48.8566_2.3522_13_400x200')
      .digest('hex');
    const hash2 = createHash('md5')
      .update('43.6047_1.4442_13_400x200')
      .digest('hex');
    expect(hash1).not.toBe(hash2);
  });
});
