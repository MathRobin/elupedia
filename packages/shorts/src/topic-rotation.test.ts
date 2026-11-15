import { describe, it, expect } from 'vitest';
import { pickTopicKey, startOfDay } from './topic-rotation.js';

describe('pickTopicKey', () => {
  const keys = ['staffers', 'questions-ecrites', 'age-deputes'];

  it('prefers a topic never used yet, in registry order', () => {
    const lastUsed = new Map([['staffers', '2026-11-01 10:00:00']]);
    expect(pickTopicKey(keys, lastUsed)).toBe('questions-ecrites');
  });

  it('falls back to the least recently used once all have served', () => {
    const lastUsed = new Map([
      ['staffers', '2026-11-10 10:00:00'],
      ['questions-ecrites', '2026-11-02 10:00:00'],
      ['age-deputes', '2026-11-08 10:00:00'],
    ]);
    expect(pickTopicKey(keys, lastUsed)).toBe('questions-ecrites');
  });

  it('does not repeat the topic used yesterday', () => {
    const lastUsed = new Map([
      ['staffers', '2026-11-14 16:10:00'],
      ['questions-ecrites', '2026-11-13 16:10:00'],
      ['age-deputes', '2026-11-12 16:10:00'],
    ]);
    const choisi = pickTopicKey(keys, lastUsed);
    expect(choisi).toBe('age-deputes');
    expect(choisi).not.toBe('staffers');
  });

  it('returns null when the registry is empty', () => {
    expect(pickTopicKey([], new Map())).toBeNull();
  });
});

describe('startOfDay', () => {
  it('rewinds to local midnight of the same day', () => {
    const minuit = startOfDay(new Date(2026, 10, 15, 16, 10, 30, 500));
    expect(minuit.getFullYear()).toBe(2026);
    expect(minuit.getMonth()).toBe(10);
    expect(minuit.getDate()).toBe(15);
    expect(minuit.getHours()).toBe(0);
    expect(minuit.getMinutes()).toBe(0);
    expect(minuit.getSeconds()).toBe(0);
    expect(minuit.getMilliseconds()).toBe(0);
  });

  it('leaves the given date untouched', () => {
    const source = new Date(2026, 10, 15, 16, 10);
    startOfDay(source);
    expect(source.getHours()).toBe(16);
  });
});
