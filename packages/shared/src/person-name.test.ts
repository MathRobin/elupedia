/** Tests de person-name.ts : même clé pour les écritures AN/Sénat et RNE. */
import { describe, it, expect } from 'vitest';
import { normalizePersonName } from './person-name.js';

describe('normalizePersonName', () => {
  it('ignores case, accents, hyphens and spacing', () => {
    expect(normalizePersonName('Jean-Yves')).toBe('jean yves');
    expect(normalizePersonName('Jean Yves')).toBe('jean yves');
    expect(normalizePersonName('BÉNARD')).toBe('benard');
    expect(normalizePersonName('Bénard')).toBe('benard');
    expect(normalizePersonName('  Bessot-Ballot ')).toBe('bessot ballot');
    expect(normalizePersonName('K/Bidi')).toBe('k bidi');
    expect(normalizePersonName("d'Armor")).toBe('d armor');
  });
  it('still separates different names', () => {
    expect(normalizePersonName('Bonneau')).not.toBe(
      normalizePersonName('Bonnet'),
    );
  });
});
