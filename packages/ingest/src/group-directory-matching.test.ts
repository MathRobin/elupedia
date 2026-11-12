/**
 * Tests du rapprochement entrée d'annuaire ↔ fiche (ticket #276).
 * Fonctions pures, sans base ni réseau.
 */
import { describe, it, expect } from 'vitest';
import {
  buildGroupOfficialIndex,
  groupCodeFromLabel,
  matchOfficial,
  nameTokens,
  type GroupOfficialIndex,
} from './group-directory-matching.js';

function indexOf(
  rows: {
    id: string;
    firstName: string;
    lastName: string;
    group: string;
  }[],
): GroupOfficialIndex {
  return buildGroupOfficialIndex(
    rows.map((row) => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      partyOrGroup: `Libellé (${row.group})`,
    })),
  );
}

const INDEX = indexOf([
  { id: 'chenu', firstName: 'Sébastien', lastName: 'Chenu', group: 'RN' },
  { id: 'attal', firstName: 'Gabriel', lastName: 'Attal', group: 'EPR' },
  {
    id: 'anglade',
    firstName: 'Pieyre-Alexandre',
    lastName: 'Anglade',
    group: 'EPR',
  },
  {
    id: 'allemand',
    firstName: 'Marie-José',
    lastName: 'Allemand',
    group: 'SOC',
  },
  { id: 'ornano', firstName: 'Philippe', lastName: "d'Ornano", group: 'RN' },
  { id: 'lafont1', firstName: 'Jean', lastName: 'Lafont', group: 'DR' },
  { id: 'lafont2', firstName: 'Paul', lastName: 'Lafont', group: 'DR' },
  { id: 'dupont1', firstName: 'Claire', lastName: 'Dupont', group: 'HOR' },
  { id: 'dupont2', firstName: 'Claire', lastName: 'Dupont', group: 'HOR' },
  { id: 'martin', firstName: 'Luc', lastName: 'Martin', group: 'LIOT' },
  { id: 'vallaud', firstName: 'Boris', lastName: 'Vallaud', group: 'SOC' },
]);

describe('groupCodeFromLabel', () => {
  it('prend le sigle entre parenthèses de fin de libellé', () => {
    expect(groupCodeFromLabel('Droite Républicaine (DR)')).toBe('dr');
    expect(groupCodeFromLabel('Les Démocrates (Dem)')).toBe('dem');
    expect(groupCodeFromLabel('Sans sigle')).toBeNull();
  });
});

describe('nameTokens', () => {
  it('retire civilité, accents, ponctuation et particules', () => {
    expect(nameTokens('M. Sébastien Chenu')).toEqual(['sebastien', 'chenu']);
    expect(nameTokens("M. Philippe d'Ornano")).toEqual(['philippe', 'ornano']);
    expect(nameTokens('Mme Pieyre-Alexandre  Anglade')).toEqual([
      'pieyre',
      'alexandre',
      'anglade',
    ]);
    expect(nameTokens('Jean de la Fontaine')).toEqual(['jean', 'fontaine']);
  });
});

describe('buildGroupOfficialIndex', () => {
  it('range les fiches par sigle et ignore les libellés sans sigle', () => {
    const index = buildGroupOfficialIndex([
      { id: 'a', firstName: 'A', lastName: 'B', partyOrGroup: 'X (RN)' },
      { id: 'a', firstName: 'A', lastName: 'B', partyOrGroup: 'X (RN)' },
      { id: 'c', firstName: 'C', lastName: 'D', partyOrGroup: 'Sans sigle' },
    ]);
    expect(index.get('rn')).toHaveLength(1);
    expect(index.has('sans sigle')).toBe(false);
  });
});

describe('matchOfficial', () => {
  it('résout en exact un nom complet identique dans le groupe, ordre et casse indifférents', () => {
    expect(
      matchOfficial({ name: 'M. Sébastien Chenu', groupCode: 'RN' }, INDEX),
    ).toMatchObject({ officialId: 'chenu', confidence: 'exact' });
    expect(
      matchOfficial({ name: 'CHENU Sébastien', groupCode: 'RN' }, INDEX),
    ).toMatchObject({ officialId: 'chenu', confidence: 'exact' });
  });

  it('gère les noms composés et les particules', () => {
    expect(
      matchOfficial(
        { name: 'M. Pieyre-Alexandre Anglade', groupCode: 'EPR' },
        INDEX,
      ),
    ).toMatchObject({ officialId: 'anglade', confidence: 'exact' });
    expect(
      matchOfficial({ name: "M. Philippe d'Ornano", groupCode: 'RN' }, INDEX),
    ).toMatchObject({ officialId: 'ornano', confidence: 'exact' });
  });

  it('ne rapproche pas une fiche d’un autre groupe, même avec le même nom', () => {
    expect(
      matchOfficial({ name: 'M. Sébastien Chenu', groupCode: 'EPR' }, INDEX),
    ).toMatchObject({ officialId: null, confidence: 'unresolved' });
  });

  it('refuse de trancher entre homonymes du même groupe', () => {
    const result = matchOfficial(
      { name: 'Mme Claire Dupont', groupCode: 'HOR' },
      INDEX,
    );
    expect(result).toMatchObject({
      officialId: null,
      confidence: 'unresolved',
    });
    expect(result.reason).toContain('homonymes');
  });

  it('rapproche en probable sur le nom de famille quand la fiche est unique (nom d’usage)', () => {
    expect(
      matchOfficial(
        { name: 'Mme Marie-José Allemand Dubois', groupCode: 'SOC' },
        INDEX,
      ),
    ).toMatchObject({ officialId: 'allemand', confidence: 'probable' });
  });

  it('ne rapproche pas quand le nom contient deux noms de famille du groupe', () => {
    // Boris Vallaud est aussi au SOC : « Allemand Vallaud » ne désigne aucune fiche seule.
    expect(
      matchOfficial(
        { name: 'Mme Marie-José Allemand Vallaud', groupCode: 'SOC' },
        INDEX,
      ),
    ).toMatchObject({ officialId: null, confidence: 'unresolved' });
  });

  it('ne devine pas quand plusieurs fiches partagent le nom de famille', () => {
    const result = matchOfficial(
      { name: 'M. Jean Lafont-Paul Lafont', groupCode: 'DR' },
      INDEX,
    );
    expect(result).toMatchObject({
      officialId: null,
      confidence: 'unresolved',
    });
  });

  it('renvoie unresolved pour une personne absente du groupe', () => {
    const result = matchOfficial(
      { name: 'M. Inconnu Personne', groupCode: 'RN' },
      INDEX,
    );
    expect(result).toMatchObject({
      officialId: null,
      confidence: 'unresolved',
    });
    expect(result.reason).toContain('aucune fiche');
  });

  it('renvoie unresolved si le groupe n’a aucune fiche active', () => {
    expect(
      matchOfficial({ name: 'M. Sébastien Chenu', groupCode: 'GDR' }, INDEX),
    ).toMatchObject({ officialId: null, confidence: 'unresolved' });
  });

  it('renvoie unresolved pour un nom vide', () => {
    expect(
      matchOfficial({ name: '  M.  ', groupCode: 'RN' }, INDEX),
    ).toMatchObject({ officialId: null, confidence: 'unresolved' });
  });
});
