import { describe, expect, it } from 'vitest';
import {
  buildAgeTable,
  buildCampaignTable,
  buildGroupTable,
  buildSponsorshipsTable,
  sponsorCategoryOf,
} from './facts.js';
import { formatDecimal, formatInt, formatPercent } from './format.js';

const NBSP = ' ';

describe('format', () => {
  it('formate les entiers avec une espace insécable', () => {
    expect(formatInt(13427)).toBe(`13${NBSP}427`);
  });
  it('utilise la virgule décimale', () => {
    expect(formatDecimal(3.624, 2)).toBe('3,62');
  });
  it('formate les pourcentages et gère un total nul', () => {
    expect(formatPercent(9169, 13377)).toBe(`69${NBSP}%`);
    expect(formatPercent(1, 0)).toBe('');
  });
});

describe('sponsorCategoryOf', () => {
  it('classe les fonctions de parrains', () => {
    expect(sponsorCategoryOf('Maire')).toBe('Maires');
    expect(sponsorCategoryOf('Conseillère départementale')).toBe(
      'Conseillers départementaux',
    );
    expect(sponsorCategoryOf('Député')).toBe('Parlementaires');
    expect(sponsorCategoryOf('Conseiller de Paris')).toBe('Autres élus');
  });
});

describe('buildSponsorshipsTable', () => {
  it('agrège par catégorie, une colonne par année, avec le total officiel', () => {
    const t = buildSponsorshipsTable([
      { year: 2017, rawFunction: 'Maire', n: 3 },
      { year: 2017, rawFunction: 'Député', n: 1 },
      { year: 2022, rawFunction: 'Maire délégué', n: 2 },
    ]);
    expect(t.headers).toEqual(['Fonction du parrain', '2017', '2022']);
    expect(t.rows[0]).toEqual([
      'Maires',
      `3 (75,0${NBSP}%)`,
      `2 (100,0${NBSP}%)`,
    ]);
    expect(t.rows.at(-2)).toEqual(['Total en base', '4', '2']);
    expect(t.rows.at(-1)).toEqual([
      'Total officiel',
      `14${NBSP}296`,
      `13${NBSP}427`,
    ]);
  });
});

describe('buildCampaignTable', () => {
  it('calcule la dépense moyenne et libelle les élections', () => {
    const t = buildCampaignTable([
      {
        electionType: 'legislatives_2024',
        accounts: 2,
        expensesRetained: 20000,
        accountsWithExpenses: 2,
        reimbursement: 5_000_000,
        rejected: 1,
        notFiled: 0,
        reimbursed: 1,
      },
    ]);
    expect(t.headers).toEqual(['', 'Législatives 2024']);
    expect(t.rows[2]).toEqual([
      'Dépense retenue moyenne',
      `10${NBSP}000${NBSP}€`,
    ]);
    expect(t.rows[3]).toEqual(['Remboursement (total)', `5,0${NBSP}M€`]);
  });
});

describe('buildGroupTable', () => {
  it('trie par total décroissant et calcule la moyenne par député', () => {
    const t = buildGroupTable(
      [
        { group: 'A', deputies: 2, count: 3 },
        { group: 'B', deputies: 1, count: 10 },
      ],
      'Questions',
    );
    expect(t.headers).toEqual(['Groupe', 'Députés', 'Questions', 'Par député']);
    expect(t.rows.map((r) => r[0])).toEqual(['B', 'A']);
    expect(t.rows[1]![3]).toBe('1,5');
  });
});

describe('buildAgeTable', () => {
  it('met en forme les indicateurs', () => {
    const t = buildAgeTable({
      n: 565,
      mean: 52.04,
      median: 53,
      min: 25,
      max: 83,
    });
    expect(t.rows[1]).toEqual(['Âge moyen', '52,0 ans']);
    expect(t.rows[2]).toEqual(['Âge médian', '53 ans']);
  });
});
