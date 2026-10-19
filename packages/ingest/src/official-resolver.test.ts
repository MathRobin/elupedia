/** Tests de official-resolver.ts : index, règles de rapprochement, découpage des noms. */
import { describe, it, expect } from 'vitest';
import {
  buildOfficialIndex,
  resolveOfficial,
  splitUppercaseLastName,
} from './official-resolver.js';

const index = buildOfficialIndex(
  [
    { id: 'bony', firstName: 'Jean-Yves', lastName: 'Bony' },
    { id: 'martin-13', firstName: 'Pierre', lastName: 'Martin' },
    { id: 'martin-69', firstName: 'Pierre', lastName: 'Martin' },
    { id: 'durand', firstName: 'Alice', lastName: 'Durand' },
    { id: 'petit', firstName: 'Paul', lastName: 'Petit' },
  ],
  [
    { officialId: 'bony', department: 'Cantal' },
    { officialId: 'martin-13', department: 'Bouches-Du-Rhône' },
    { officialId: 'martin-69', department: 'Rhône' },
    { officialId: 'petit', department: 'Nord' },
  ],
);

describe('resolveOfficial', () => {
  it('matches on normalized name whatever the spelling, confirmed by department', () => {
    expect(resolveOfficial(index, 'BONY', 'Jean Yves', 'Cantal')).toEqual({
      officialId: 'bony',
    });
  });
  it('falls back on the first given name', () => {
    expect(resolveOfficial(index, 'BONY', 'Jean', 'Cantal')).toEqual({
      officialId: 'bony',
    });
  });
  it('uses the department to pick among homonyms', () => {
    expect(
      resolveOfficial(index, 'MARTIN', 'Pierre', 'Bouches-du-Rhône'),
    ).toEqual({ officialId: 'martin-13' });
    expect(resolveOfficial(index, 'MARTIN', 'Pierre', 'Loire')).toBe(
      'ambiguous',
    );
    expect(resolveOfficial(index, 'MARTIN', 'Pierre', null)).toBe('ambiguous');
  });
  it('accepts a single candidate when no department can be compared', () => {
    expect(resolveOfficial(index, 'DURAND', 'Alice', 'Gers')).toEqual({
      officialId: 'durand',
    });
    expect(resolveOfficial(index, 'PETIT', 'Paul', null)).toEqual({
      officialId: 'petit',
    });
  });
  it('flags a single candidate whose department disagrees', () => {
    expect(resolveOfficial(index, 'PETIT', 'Paul', 'Gers')).toBe('ambiguous');
  });
  it('reports no_match when nobody has that name', () => {
    expect(resolveOfficial(index, 'INCONNU', 'Zoé', 'Nord')).toBe('no_match');
  });
});

describe('splitUppercaseLastName', () => {
  it('takes the leading uppercase words as the last name', () => {
    expect(splitUppercaseLastName('DUPONT Jean Pierre')).toEqual({
      lastName: 'DUPONT',
      firstName: 'Jean Pierre',
    });
    expect(splitUppercaseLastName('FOURNIÉ TURQUIN Brigitte')).toEqual({
      lastName: 'FOURNIÉ TURQUIN',
      firstName: 'Brigitte',
    });
  });
  it('returns null when the split is impossible', () => {
    expect(splitUppercaseLastName('DUPONT')).toBeNull();
    expect(splitUppercaseLastName('Jean Dupont')).toBeNull();
  });
});
