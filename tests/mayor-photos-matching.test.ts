import { describe, it, expect } from 'vitest';
import {
  normalize,
  matchKey,
  matchKeyBirthDate,
} from '../packages/ingest/src/upsert/mayor-photos.js';

describe('normalize', () => {
  it('removes accents', () => {
    expect(normalize('Éloïse')).toBe('eloise');
    expect(normalize('François')).toBe('francois');
    expect(normalize('Jérôme')).toBe('jerome');
  });

  it('lowercases', () => {
    expect(normalize('DUPONT')).toBe('dupont');
    expect(normalize('Martin')).toBe('martin');
  });

  it('normalizes apostrophes', () => {
    expect(normalize("d'Artagnan")).toBe("d'artagnan");
    expect(normalize('d’Artagnan')).toBe("d'artagnan");
    expect(normalize('d‘Artagnan')).toBe("d'artagnan");
  });

  it('replaces hyphens with spaces', () => {
    expect(normalize('Jean-Pierre')).toBe('jean pierre');
  });

  it('trims whitespace', () => {
    expect(normalize('  Martin  ')).toBe('martin');
  });

  it('handles combined diacritics', () => {
    expect(normalize('Ça été bénéfique')).toBe('ca ete benefique');
  });
});

describe('matchKey', () => {
  it('produces same key for accented/unaccented names', () => {
    const k1 = matchKey('François', 'Baroin', '10033');
    const k2 = matchKey('Francois', 'Baroin', '10033');
    expect(k1).toBe(k2);
  });

  it('produces same key for hyphenated/split first names', () => {
    const k1 = matchKey('Jean-Pierre', 'Dupont', '75056');
    const k2 = matchKey('Jean Pierre', 'Dupont', '75056');
    expect(k1).toBe(k2);
  });

  it('produces different keys for different commune codes', () => {
    const k1 = matchKey('Marie', 'Martin', '75056');
    const k2 = matchKey('Marie', 'Martin', '13055');
    expect(k1).not.toBe(k2);
  });

  it('handles case variations', () => {
    const k1 = matchKey('JEAN', 'DUPONT', '75056');
    const k2 = matchKey('jean', 'dupont', '75056');
    expect(k1).toBe(k2);
  });
});

describe('matchKeyBirthDate', () => {
  it('uses first 10 chars of birth date', () => {
    const k = matchKeyBirthDate('Jean', 'Dupont', '1965-03-15T00:00:00Z');
    expect(k).toBe('jean|dupont|1965-03-15');
  });

  it('matches same person with different date formats', () => {
    const k1 = matchKeyBirthDate('Marie', 'Martin', '1970-01-01');
    const k2 = matchKeyBirthDate('Marie', 'Martin', '1970-01-01T00:00:00.000Z');
    expect(k1).toBe(k2);
  });

  it('differentiates by birth date', () => {
    const k1 = matchKeyBirthDate('Marie', 'Martin', '1970-01-01');
    const k2 = matchKeyBirthDate('Marie', 'Martin', '1980-06-15');
    expect(k1).not.toBe(k2);
  });
});
