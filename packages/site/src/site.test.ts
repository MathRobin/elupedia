/**
 * Test de fumée du workspace `@elupedia/site` : vérifie que Vitest tourne
 * bien dans ce package avec un environnement Node (les tests des composants
 * lisent le système de fichiers et importent les modules `.tsx`).
 */
import { describe, it, expect } from 'vitest';

describe('@elupedia/site', () => {
  it('package is loadable', () => {
    expect(true).toBe(true);
  });

  it('has access to Node.js APIs', () => {
    expect(typeof process.env).toBe('object');
  });
});
