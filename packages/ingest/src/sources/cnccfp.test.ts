/**
 * Tests de cnccfp.ts : découpage nom/prénom des libellés « M. NOM Prénom ».
 */
import { describe, it, expect } from 'vitest';
import { parseCandidateName } from './cnccfp.js';

describe('parseCandidateName', () => {
  it('parses standard male name', () => {
    const parsed = parseCandidateName('M. BRETON Xavier');
    expect(parsed).toEqual({ lastName: 'BRETON', firstName: 'Xavier' });
  });

  it('parses standard female name', () => {
    const parsed = parseCandidateName('Mme ARMENJON Eliane');
    expect(parsed).toEqual({ lastName: 'ARMENJON', firstName: 'Eliane' });
  });

  it('parses compound last name', () => {
    const parsed = parseCandidateName('Mme RACT-MADOUX Daphné');
    expect(parsed).toEqual({ lastName: 'RACT-MADOUX', firstName: 'Daphné' });
  });

  it('parses compound first name', () => {
    const parsed = parseCandidateName('M. GUÉRAUD Sébastien');
    expect(parsed).toEqual({ lastName: 'GUÉRAUD', firstName: 'Sébastien' });
  });

  it('parses multi-word last name', () => {
    const parsed = parseCandidateName('M. DE LA ROCHE Jean Pierre');
    expect(parsed).toEqual({
      lastName: 'DE LA ROCHE',
      firstName: 'Jean Pierre',
    });
  });
});
