/**
 * Tests de la lecture de l'identifiant du bloc « Composition » (ticket #276).
 * Extrait de balisage relevé sur la page du RN ; aucun réseau.
 */
import { describe, it, expect } from 'vitest';
import { findCompositionNodeId } from './group-directory-member-list.js';

describe('findCompositionNodeId', () => {
  it('lit le data-node-id du bloc an_instance_composition', () => {
    const html = `
      <ul class="nav">
        <li><a data-content-type="an_instance_activite" data-node-id="193803" href="#b193803">Activité</a></li>
        <li><a data-content-type="an_instance_composition" href="#b193722" class="ajax actif"
               data-url="https://www2.assemblee-nationale.fr/17/les-groupes-politiques/rassemblement-national/(block)/193722"
               data-node-id="193722" data-vue="embed">Composition</a></li>
      </ul>`;
    expect(findCompositionNodeId(html)).toBe('193722');
  });

  it('renvoie null si le bloc est absent ou si l’identifiant n’est pas numérique', () => {
    expect(findCompositionNodeId('<p>rien</p>')).toBeNull();
    expect(
      findCompositionNodeId(
        '<a data-content-type="an_instance_composition" data-node-id="abc"></a>',
      ),
    ).toBeNull();
  });
});
