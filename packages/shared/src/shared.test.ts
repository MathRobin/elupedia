/**
 * Tests unitaires minimaux de `@elupedia/shared` : vérifie que le client DB
 * est exporté et qu'il refuse de démarrer sans `DATABASE_URL`.
 *
 * Aucune connexion réelle n'est ouverte. La variable d'environnement est
 * retirée puis restaurée pour ne pas polluer les autres tests du même
 * process.
 */
import { describe, it, expect } from 'vitest';
import { createDb } from './db.js';

describe('@elupedia/shared', () => {
  it('exports createDb function', () => {
    expect(typeof createDb).toBe('function');
  });

  it('createDb throws without DATABASE_URL', () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(() => createDb()).toThrow('DATABASE_URL is not set');
    } finally {
      if (originalDatabaseUrl !== undefined) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });
});
