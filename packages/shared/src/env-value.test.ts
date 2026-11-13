import { describe, expect, it } from 'vitest';
import { envValue, isUnresolvedEnvPlaceholder } from './env-value.js';

describe('envValue', () => {
  it('rend la valeur telle quelle quand elle est posée', () => {
    expect(envValue('A', { A: 'v' })).toBe('v');
    // Espaces internes et externes conservés : seul le test est fait sur la
    // valeur nettoyée (un chemin peut légitimement finir par un espace).
    expect(envValue('A', { A: ' v ' })).toBe(' v ');
  });

  it('rend undefined pour une variable absente ou vide', () => {
    expect(envValue('A', {})).toBeUndefined();
    expect(envValue('A', { A: '' })).toBeUndefined();
    expect(envValue('A', { A: '   ' })).toBeUndefined();
  });

  it('rend undefined pour un gabarit ${NOM} laissé par Dagu', () => {
    expect(envValue('A', { A: '${A}' })).toBeUndefined();
    expect(envValue('A', { A: ' ${ELEVENLABS_MODEL_ID} ' })).toBeUndefined();
  });

  it('ne confond pas un gabarit avec une valeur qui en contient un', () => {
    expect(isUnresolvedEnvPlaceholder('${A}')).toBe(true);
    expect(isUnresolvedEnvPlaceholder('${a_1}')).toBe(true);
    expect(isUnresolvedEnvPlaceholder('${1A}')).toBe(false);
    expect(isUnresolvedEnvPlaceholder('https://x/${A}')).toBe(false);
    expect(isUnresolvedEnvPlaceholder('${A} ${B}')).toBe(false);
    expect(isUnresolvedEnvPlaceholder('$A')).toBe(false);
    expect(envValue('A', { A: 'https://hooks.example/${X}' })).toBe(
      'https://hooks.example/${X}',
    );
  });
});
