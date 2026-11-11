/**
 * Tests de la configuration des annuaires de groupes (ticket #274) : forme
 * des entrées, unicité des codes, filtre `enabled`. Aucun réseau.
 */
import { describe, it, expect } from 'vitest';
import {
  GROUP_DIRECTORY_SOURCES,
  getEnabledGroupDirectorySources,
  validateGroupDirectorySources,
  type GroupDirectorySource,
} from './group-directories.js';

function makeSource(
  overrides: Partial<GroupDirectorySource> = {},
): GroupDirectorySource {
  return {
    groupCode: 'TST',
    groupName: 'Groupe de test',
    listUrl: 'https://exemple.fr/deputes',
    listItemSelector: '.depute',
    nameSelector: '.nom',
    socialLinkSelector: 'a.reseau',
    followsToDetailPage: false,
    detailLinkSelector: null,
    enabled: true,
    ...overrides,
  };
}

describe('validateGroupDirectorySources', () => {
  it('accepte une entrée bien formée', () => {
    expect(validateGroupDirectorySources([makeSource()])).toEqual([]);
  });

  it('accepte une liste vide', () => {
    expect(validateGroupDirectorySources([])).toEqual([]);
  });

  it('refuse un groupCode en double', () => {
    const errors = validateGroupDirectorySources([
      makeSource({ groupCode: 'RN' }),
      makeSource({ groupCode: 'RN', groupName: 'Autre' }),
    ]);
    expect(errors).toEqual(['RN : groupCode en double']);
  });

  it('refuse une listUrl qui n’est pas en http(s)', () => {
    expect(
      validateGroupDirectorySources([makeSource({ listUrl: 'pas une url' })]),
    ).toHaveLength(1);
    expect(
      validateGroupDirectorySources([
        makeSource({ listUrl: 'ftp://exemple.fr/liste' }),
      ]),
    ).toHaveLength(1);
  });

  it('refuse un sélecteur vide ou blanc', () => {
    const errors = validateGroupDirectorySources([
      makeSource({ listItemSelector: '  ', nameSelector: '' }),
    ]);
    expect(errors).toEqual([
      'TST : listItemSelector vide',
      'TST : nameSelector vide',
    ]);
  });

  it('exige detailLinkSelector quand followsToDetailPage est vrai', () => {
    const errors = validateGroupDirectorySources([
      makeSource({ followsToDetailPage: true, detailLinkSelector: null }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('detailLinkSelector requis');
  });

  it('accepte detailLinkSelector quand followsToDetailPage est vrai', () => {
    expect(
      validateGroupDirectorySources([
        makeSource({
          followsToDetailPage: true,
          detailLinkSelector: 'a.fiche',
        }),
      ]),
    ).toEqual([]);
  });

  it('refuse un groupCode ou un groupName vide', () => {
    const errors = validateGroupDirectorySources([
      makeSource({ groupCode: '', groupName: ' ' }),
    ]);
    expect(errors).toEqual([
      'entrée #0 : groupCode vide',
      'entrée #0 : groupName vide',
    ]);
  });
});

describe('getEnabledGroupDirectorySources', () => {
  it('ne garde que les sources activées, dans l’ordre', () => {
    const sources = [
      makeSource({ groupCode: 'A', enabled: true }),
      makeSource({ groupCode: 'B', enabled: false }),
      makeSource({ groupCode: 'C', enabled: true }),
    ];
    expect(
      getEnabledGroupDirectorySources(sources).map((s) => s.groupCode),
    ).toEqual(['A', 'C']);
  });
});

describe('GROUP_DIRECTORY_SOURCES', () => {
  it('est une configuration valide', () => {
    expect(validateGroupDirectorySources(GROUP_DIRECTORY_SOURCES)).toEqual([]);
  });
});
