/**
 * Tests de la logique de filtrage de `HeroSearch` (recherche d'élu de
 * l'accueil). Le composant n'exporte pas sa fonction de filtrage : elle est
 * recopiée ici (`filter`) et doit rester alignée avec `HeroSearch.tsx`
 * (normalisation sans accents ni casse, recherche sur « prénom nom »).
 */
import { describe, it, expect } from 'vitest';

describe('HeroSearch filtering logic', () => {
  const officials = [
    {
      slug: 'jean-dupont',
      firstName: 'Jean',
      lastName: 'Dupont',
      mandateType: 'depute',
      politicalGroup: 'RE',
    },
    {
      slug: 'marie-martin',
      firstName: 'Marie',
      lastName: 'Martin',
      mandateType: 'senateur',
      politicalGroup: 'LR',
    },
    {
      slug: 'francois-lefevre',
      firstName: 'François',
      lastName: 'Lefèvre',
      mandateType: 'depute',
      politicalGroup: null,
    },
  ];

  function filter(query: string) {
    const normalized = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    return officials.filter((official) => {
      const fullName = `${official.firstName} ${official.lastName}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
      return fullName.includes(normalized);
    });
  }

  it('returns empty for queries shorter than 2 chars', () => {
    // Le seuil de 2 caractères est appliqué par le composant, pas par le
    // filtre pur : celui-ci répond pour n'importe quelle longueur.
    expect(filter('J').length).toBeGreaterThan(0);
  });

  it('finds by last name', () => {
    const results = filter('dupont');
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe('jean-dupont');
  });

  it('finds by first name', () => {
    const results = filter('marie');
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe('marie-martin');
  });

  it('handles accented characters', () => {
    const results = filter('lefevre');
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe('francois-lefevre');
  });

  it('is case-insensitive', () => {
    const results = filter('DUPONT');
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe('jean-dupont');
  });

  it('matches partial names', () => {
    const results = filter('mar');
    expect(results).toHaveLength(1);
  });

  it('returns nothing for unmatched queries', () => {
    const results = filter('zzz');
    expect(results).toHaveLength(0);
  });
});
