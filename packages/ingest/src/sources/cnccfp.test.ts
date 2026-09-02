import { describe, it, expect } from 'vitest';
import { parseCandidateName } from './cnccfp.js';

describe('parseCandidateName', () => {
  it('parses standard male name', () => {
    const r = parseCandidateName('M. BRETON Xavier');
    expect(r).toEqual({ lastName: 'BRETON', firstName: 'Xavier' });
  });

  it('parses standard female name', () => {
    const r = parseCandidateName('Mme ARMENJON Eliane');
    expect(r).toEqual({ lastName: 'ARMENJON', firstName: 'Eliane' });
  });

  it('parses compound last name', () => {
    const r = parseCandidateName('Mme RACT-MADOUX Daphné');
    expect(r).toEqual({ lastName: 'RACT-MADOUX', firstName: 'Daphné' });
  });

  it('parses compound first name', () => {
    const r = parseCandidateName('M. GUÉRAUD Sébastien');
    expect(r).toEqual({ lastName: 'GUÉRAUD', firstName: 'Sébastien' });
  });

  it('parses multi-word last name', () => {
    const r = parseCandidateName('M. DE LA ROCHE Jean Pierre');
    expect(r).toEqual({ lastName: 'DE LA ROCHE', firstName: 'Jean Pierre' });
  });
});
