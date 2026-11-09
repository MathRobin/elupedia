import { describe, it, expect } from 'vitest';
import {
  classifyDecorationMatch,
  type DecorationMatchInput,
} from './decoration-match.js';

const base: DecorationMatchInput = {
  officialBirth: '1962-07-04',
  officialDeath: null,
  officialActive: true,
  decorationBirth: null,
  decorationDeath: null,
  decreeDate: '2015-01-01',
};

describe('classifyDecorationMatch', () => {
  it('vérifie quand les deux dates de naissance sont identiques', () => {
    expect(
      classifyDecorationMatch({ ...base, decorationBirth: '1962-07-04' }),
    ).toBe('verified');
  });
  it('rejette quand les deux dates de naissance diffèrent', () => {
    expect(
      classifyDecorationMatch({ ...base, decorationBirth: '1843-01-25' }),
    ).toBe('rejected');
  });
  it('ne confirme pas sans date de naissance publique', () => {
    expect(classifyDecorationMatch(base)).toBe('unverified');
  });
  it("ne confirme pas quand la date de l'élu manque", () => {
    expect(
      classifyDecorationMatch({
        ...base,
        officialBirth: null,
        decorationBirth: '1962-07-04',
      }),
    ).toBe('unverified');
  });
  it('rejette un décret antérieur aux 16 ans de l’élu', () => {
    expect(classifyDecorationMatch({ ...base, decreeDate: '1975-01-01' })).toBe(
      'rejected',
    );
    expect(classifyDecorationMatch({ ...base, decreeDate: '1978-07-04' })).toBe(
      'unverified',
    );
  });
  it('rejette un décès incompatible avec la fiche de l’élu', () => {
    expect(
      classifyDecorationMatch({ ...base, decorationDeath: '1950-01-01' }),
    ).toBe('rejected');
    expect(
      classifyDecorationMatch({ ...base, decorationDeath: '2001-01-01' }),
    ).toBe('rejected');
    expect(
      classifyDecorationMatch({
        ...base,
        officialActive: false,
        officialDeath: '2001-01-01',
        decorationDeath: '2001-01-01',
      }),
    ).toBe('unverified');
  });
});
