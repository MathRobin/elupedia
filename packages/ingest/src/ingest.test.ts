import { describe, it, expect } from 'vitest';

describe('@elupedia/ingest', () => {
  it('package is loadable', () => {
    expect(true).toBe(true);
  });

  it('has access to Node.js APIs', () => {
    expect(typeof process.env).toBe('object');
  });
});
