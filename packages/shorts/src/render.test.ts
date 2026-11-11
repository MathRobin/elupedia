import { describe, it, expect } from 'vitest';
import { overrunWarning, MAX_VIDEO_SEC } from './render.js';

describe('overrunWarning', () => {
  it('stays silent up to the target length', () => {
    expect(overrunWarning('abc', 62.4)).toBeNull();
    expect(overrunWarning('abc', 84)).toBeNull();
    expect(overrunWarning('abc', MAX_VIDEO_SEC)).toBeNull();
  });

  it('names the short, the length and the fix beyond it', () => {
    const w = overrunWarning('abc', 92.4);
    expect(w).toContain('92.4 s');
    expect(w).toContain('make abc --rescript');
  });
});
