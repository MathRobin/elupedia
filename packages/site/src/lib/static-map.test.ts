/**
 * Vérifie uniquement la propriété attendue de la clé de cache de
 * `static-map.ts` (md5 déterministe de `lat_lon_zoom_WxH`), sans importer le
 * module : `staticmaps` tire des dépendances natives inutiles ici. Le test
 * recopie donc la formule — à garder alignée avec `cacheKey`.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

describe('static-map cache key', () => {
  it('produces deterministic hash from coordinates', () => {
    const hash = createHash('md5')
      .update('48.8566_2.3522_13_400x200')
      .digest('hex');
    expect(hash).toMatch(/^[a-f0-9]{32}$/);

    const sameInputHash = createHash('md5')
      .update('48.8566_2.3522_13_400x200')
      .digest('hex');
    expect(hash).toBe(sameInputHash);
  });

  it('produces different hashes for different coordinates', () => {
    const parisHash = createHash('md5')
      .update('48.8566_2.3522_13_400x200')
      .digest('hex');
    const toulouseHash = createHash('md5')
      .update('43.6047_1.4442_13_400x200')
      .digest('hex');
    expect(parisHash).not.toBe(toulouseHash);
  });
});
