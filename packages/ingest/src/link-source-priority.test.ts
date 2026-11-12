/**
 * Tests de la priorité des sources de liens (ticket #278). Fonctions pures.
 */
import { describe, it, expect } from 'vitest';
import {
  compareLinkSources,
  linkSourcePriority,
  OTHER_LINK_SOURCE_PRIORITY,
} from './link-source-priority.js';

describe('linkSourcePriority', () => {
  it('classe official > site personnel > annuaire de groupe > autres', () => {
    expect(linkSourcePriority('official')).toBeGreaterThan(
      linkSourcePriority('scraped_personal_website'),
    );
    expect(linkSourcePriority('scraped_personal_website')).toBeGreaterThan(
      linkSourcePriority('group_directory'),
    );
    expect(linkSourcePriority('group_directory')).toBeGreaterThan(
      linkSourcePriority('wikipedia_api'),
    );
  });

  it('donne la priorité « autres » à une source inconnue', () => {
    expect(linkSourcePriority('madada')).toBe(OTHER_LINK_SOURCE_PRIORITY);
    expect(linkSourcePriority('source-inventee')).toBe(
      OTHER_LINK_SOURCE_PRIORITY,
    );
  });
});

describe('compareLinkSources', () => {
  it('conflit : la source la plus prioritaire gagne, dans les deux sens', () => {
    expect(compareLinkSources('wikipedia_api', 'group_directory')).toBe(
      'candidate_wins',
    );
    expect(compareLinkSources('official', 'group_directory')).toBe(
      'existing_wins',
    );
  });

  it('égalité : pas de gagnant', () => {
    expect(compareLinkSources('group_directory', 'group_directory')).toBe(
      'tie',
    );
  });
});
