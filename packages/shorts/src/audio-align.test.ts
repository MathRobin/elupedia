import { describe, it, expect } from 'vitest';
import {
  alignWords,
  internalPauses,
  parseSilences,
  speechSpan,
} from './audio-align.js';

const stderr = `
[silencedetect @ 0x1] silence_start: 0
[silencedetect @ 0x1] silence_end: 0.82 | silence_duration: 0.82
[silencedetect @ 0x1] silence_start: 2.5
[silencedetect @ 0x1] silence_end: 2.95 | silence_duration: 0.45
[silencedetect @ 0x1] silence_start: 5.4
`;

describe('parseSilences / speechSpan', () => {
  it('reads silence boundaries and trims head and tail', () => {
    const silences = parseSilences(stderr);
    expect(silences).toEqual([
      { start: 0, end: 0.82 },
      { start: 2.5, end: 2.95 },
      { start: 5.4, end: null },
    ]);
    const span = speechSpan(silences, 6);
    expect(span).toEqual({ start: 0.82, end: 5.4 });
    expect(internalPauses(silences, span)).toEqual([{ start: 2.5, end: 2.95 }]);
  });

  it('keeps the whole file when there is no edge silence', () => {
    expect(speechSpan([], 4)).toEqual({ start: 0, end: 4 });
  });

  it('ignores micro-pauses shorter than the minimum', () => {
    const span = { start: 0, end: 5 };
    expect(internalPauses([{ start: 2, end: 2.1 }], span)).toEqual([]);
  });
});

describe('alignWords', () => {
  const text = 'Le texte est rejeté. Cent quarante et une voix pour.';

  it('anchors each sentence between detected pauses', () => {
    const words = alignWords(text, { start: 0.2, end: 6 }, [
      { start: 2.4, end: 3.0 },
    ]);
    expect(words.map((w) => w.word)).toEqual(text.split(' '));
    const lastOfFirst = words[3];
    const firstOfSecond = words[4];
    expect(lastOfFirst.end).toBeLessThanOrEqual(2.4);
    expect(firstOfSecond.start).toBeGreaterThanOrEqual(3.0);
    expect(words[0].start).toBeCloseTo(0.2);
    expect(words[words.length - 1].end).toBeLessThanOrEqual(6);
  });

  it('falls back to proportional timing with a gap after sentences', () => {
    const words = alignWords(text, { start: 0, end: 6 }, []);
    expect(words).toHaveLength(10);
    for (let i = 1; i < words.length; i++) {
      expect(words[i].start).toBeGreaterThanOrEqual(words[i - 1].start);
    }
    expect(words[4].start - words[3].end).toBeGreaterThan(0.2);
    expect(words[9].end).toBeLessThanOrEqual(6);
  });

  it('returns nothing for an empty text', () => {
    expect(alignWords('  ', { start: 0, end: 1 }, [])).toEqual([]);
  });
});
