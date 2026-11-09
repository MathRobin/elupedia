/**
 * Test du rattachement des décorations : `findOfficialId` ne rattache que
 * sur nom + date de naissance identiques, avec un prénom compatible et
 * sans ambiguïté.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('findOfficialId', () => {
  it('rattache sur nom, date de naissance et prénom en préfixe', async () => {
    const { findOfficialId, officialIndexKey } =
      await import('./decorations.js');
    const index = new Map([
      [
        officialIndexKey('Dupont-Léon', '1962-07-04'),
        [{ id: 'o1', firstName: 'Jean' }],
      ],
    ]);
    expect(
      findOfficialId(index, {
        lastName: 'DUPONT LEON',
        firstName: 'Jean Pierre Marie',
        birthDate: '1962-07-04',
      }),
    ).toBe('o1');
  });

  it('ne rattache pas sans date de naissance, ni avec une autre date', async () => {
    const { findOfficialId, officialIndexKey } =
      await import('./decorations.js');
    const index = new Map([
      [
        officialIndexKey('Robert', '1963-01-13'),
        [{ id: 'o1', firstName: 'Frédéric' }],
      ],
    ]);
    const base = { lastName: 'ROBERT', firstName: 'Frédéric' };
    expect(findOfficialId(index, { ...base, birthDate: null })).toBeNull();
    expect(
      findOfficialId(index, { ...base, birthDate: '1843-08-31' }),
    ).toBeNull();
  });

  it('ne rattache pas quand le prénom est incompatible ou ambigu', async () => {
    const { findOfficialId, officialIndexKey } =
      await import('./decorations.js');
    const key = officialIndexKey('Martin', '1970-01-01');
    const index = new Map([
      [
        key,
        [
          { id: 'o1', firstName: 'Anne' },
          { id: 'o2', firstName: 'Anne-Sophie' },
        ],
      ],
    ]);
    const rec = { lastName: 'Martin', birthDate: '1970-01-01' };
    expect(findOfficialId(index, { ...rec, firstName: 'Paul' })).toBeNull();
    // « Anne » et « Anne Sophie » ont le même premier prénom normalisé : ambigu.
    expect(
      findOfficialId(index, { ...rec, firstName: 'Anne Sophie' }),
    ).toBeNull();
  });
});
