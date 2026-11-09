import { describe, expect, it } from 'vitest';
import {
  buildAgeTable,
  buildCampaignTable,
  buildDirectory,
  buildGroupTable,
  buildSenate2026Summary,
  buildSenateNuanceTable,
  buildSponsorshipsTable,
  displayLastName,
  normalizeNuance,
  groupShortName,
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

describe('groupShortName', () => {
  it('prend le sigle entre parenthèses, sinon le nom sans « Groupe »', () => {
    expect(groupShortName('Rassemblement National (RN)')).toBe('RN');
    expect(groupShortName('Groupe Les Républicains')).toBe('Les Républicains');
    expect(groupShortName('Groupe du RDSE')).toBe('RDSE');
    expect(groupShortName('Groupe CRCE - Kanaky')).toBe('CRCE-K');
    expect(groupShortName("Sénateurs n'appartenant à aucun groupe")).toBe(
      'Sans groupe',
    );
    expect(groupShortName(null)).toBe('');
  });
});

describe('buildDirectory', () => {
  const base = {
    department: null,
    district: null,
    politicalGroup: null,
    groupAffiliation: null,
    europeanGroup: null,
    nationalParty: null,
  };
  const d = buildDirectory([
    {
      ...base,
      type: 'depute',
      lastName: 'Zola',
      firstName: 'Émile',
      department: 'Vendée',
      district: '2e circonscription',
      politicalGroup: 'Horizons & Indépendants (HOR)',
    },
    {
      ...base,
      type: 'depute',
      lastName: 'Éluard',
      firstName: 'Paul',
      politicalGroup: 'Horizons & Indépendants (HOR)',
    },
    {
      ...base,
      type: 'senateur',
      lastName: 'Buval',
      firstName: 'Frédéric',
      department: 'Martinique',
      groupAffiliation: 'Groupe du RDSE',
    },
    {
      ...base,
      type: 'eurodepute',
      lastName: 'Martin',
      firstName: 'Anne',
      europeanGroup: 'PfE',
      nationalParty: 'RN',
    },
  ]);
  it('trie par nom en ignorant les accents', () => {
    expect(d.deputes.rows.map((r) => r[0])).toEqual([
      'Éluard, Paul',
      'Zola, Émile',
    ]);
  });
  it('met en forme circonscription, groupe et territoire', () => {
    expect(d.deputes.rows[1]).toEqual([
      'Zola, Émile',
      'HOR',
      'Vendée · 2e circ.',
    ]);
    expect(d.senateurs.rows[0]).toEqual([
      'Buval, Frédéric',
      'RDSE',
      'Martinique',
    ]);
    expect(d.eurodeputes.rows[0]).toEqual(['Martin, Anne', 'PfE', 'RN']);
  });
  it('produit la légende des groupes de l’Assemblée', () => {
    expect(d.groupesAssemblee.rows).toEqual([
      ['HOR', 'Horizons & Indépendants', '2'],
    ]);
  });
  it("n'expose ni contact ni date de naissance", () => {
    expect(d.deputes.headers).toEqual(['Député', 'Groupe', 'Circonscription']);
  });
});

describe('displayLastName', () => {
  it('ramène les noms tout en majuscules en casse de titre', () => {
    expect(displayLastName('HORTEFEUX')).toBe('Hortefeux');
    expect(displayLastName('LE PEN')).toBe('Le Pen');
    expect(displayLastName('Dupont-Aignan')).toBe('Dupont-Aignan');
    expect(displayLastName('X')).toBe('X');
  });
});

describe('normalizeNuance', () => {
  it('fusionne les libellés qui ne diffèrent que par le préfixe « Liste »', () => {
    expect(normalizeNuance('Liste des Républicains')).toBe('Les Républicains');
    expect(normalizeNuance('Les Républicains')).toBe('Les Républicains');
    expect(normalizeNuance('Liste divers droite')).toBe('Divers droite');
    expect(normalizeNuance("Liste d'union à gauche")).toBe('Union à gauche');
    expect(normalizeNuance('Liste du Parti socialiste')).toBe(
      'Parti socialiste',
    );
  });
});

describe('buildSenateNuanceTable', () => {
  it('additionne les libellés fusionnés et regroupe le reste', () => {
    const t = buildSenateNuanceTable(
      [
        { nuance: 'Liste divers droite', candidates: 10, elected: 3 },
        { nuance: 'Divers droite', candidates: 2, elected: 1 },
        { nuance: 'Parti socialiste', candidates: 4, elected: 2 },
        { nuance: 'Divers', candidates: 5, elected: 0 },
      ],
      2,
    );
    expect(t.rows).toEqual([
      ['Divers droite', '12', '4'],
      ['Parti socialiste', '4', '2'],
      ['Autres nuances', '5', '0'],
    ]);
  });
});

describe('buildSenate2026Summary', () => {
  it('résume sièges, tours et sortants réélus', () => {
    const t = buildSenate2026Summary([
      {
        round: 1,
        scrutinType: 'majoritaire',
        circumscriptions: 2,
        seats: 3,
        voters: 100,
        candidates: 9,
        elected: 2,
        outgoing: 3,
        outgoingElected: 2,
      },
      {
        round: 1,
        scrutinType: 'proportionnel',
        circumscriptions: 1,
        seats: 4,
        voters: 200,
        candidates: 20,
        elected: 4,
        outgoing: 1,
        outgoingElected: 1,
      },
      {
        round: 2,
        scrutinType: 'majoritaire',
        circumscriptions: 1,
        seats: 1,
        voters: 50,
        candidates: 3,
        elected: 1,
        outgoing: 0,
        outgoingElected: 0,
      },
    ]);
    const get = (label: string) => t.rows.find((r) => r[0] === label)?.[1];
    expect(get('Sièges à pourvoir')).toBe('7');
    expect(get('Élus au premier tour')).toBe('6');
    expect(get('Élus au second tour')).toBe('1 (1 circonscription)');
    expect(get('… élus au premier tour')).toMatch(/^3 \(75/);
  });
});
