import {
  formatDecimal,
  formatEuros,
  formatInt,
  formatMillions,
  formatPercent,
} from './format.js';

/**
 * Construction pure des tableaux du livre à partir des lignes lues en base
 * (`queries.ts`). Chaque tableau est une liste de lignes de texte déjà
 * formatées : le gabarit Typst n'a plus qu'à les afficher.
 *
 * Appelants : `main-data.ts`.
 * Pièges : `FUNCTION_CATEGORIES` reprend celles de
 * `packages/shorts/src/topics/sponsorships-2022.ts` (à garder alignées, pour
 * que le livre et la vidéo donnent les mêmes chiffres) ; les totaux officiels
 * viennent des communiqués du Conseil constitutionnel (14 296 en 2017,
 * 13 427 en 2022).
 */

export interface Table {
  headers: string[];
  rows: string[][];
}

export const OFFICIAL_SPONSORSHIP_TOTALS: Record<number, number> = {
  2017: 14296,
  2022: 13427,
};

const FUNCTION_CATEGORIES: { label: string; test: RegExp }[] = [
  { label: 'Maires', test: /maire/i },
  { label: 'Conseillers départementaux', test: /départemental/i },
  { label: 'Conseillers régionaux', test: /régional/i },
  { label: 'Parlementaires', test: /député|sénat|parlement européen/i },
  {
    label: "Élus des Français de l'étranger",
    test: /français de l'étranger|conseil consulaire/i,
  },
];
const OTHER_LABEL = 'Autres élus';

export function sponsorCategoryOf(rawFunction: string): string {
  return (
    FUNCTION_CATEGORIES.find((c) => c.test.test(rawFunction))?.label ??
    OTHER_LABEL
  );
}

export interface SponsorshipFunctionRow {
  year: number;
  rawFunction: string;
  n: number;
}

/** Parrainages par fonction du parrain, une colonne par élection. */
export function buildSponsorshipsTable(rows: SponsorshipFunctionRow[]): Table {
  const years = [...new Set(rows.map((r) => r.year))].sort();
  const byYear = new Map<number, Map<string, number>>();
  for (const y of years) byYear.set(y, new Map());
  for (const r of rows) {
    const m = byYear.get(r.year)!;
    const c = sponsorCategoryOf(r.rawFunction);
    m.set(c, (m.get(c) ?? 0) + r.n);
  }
  const totals = new Map(
    years.map((y) => [
      y,
      [...byYear.get(y)!.values()].reduce((a, b) => a + b, 0),
    ]),
  );
  const labels = [...FUNCTION_CATEGORIES.map((c) => c.label), OTHER_LABEL];
  return {
    headers: ['Fonction du parrain', ...years.map(String)],
    rows: [
      ...labels.map((label) => [
        label,
        ...years.map((y) => {
          const n = byYear.get(y)!.get(label) ?? 0;
          return `${formatInt(n)} (${formatPercent(n, totals.get(y)!, 1)})`;
        }),
      ]),
      ['Total en base', ...years.map((y) => formatInt(totals.get(y)!))],
      [
        'Total officiel',
        ...years.map((y) =>
          OFFICIAL_SPONSORSHIP_TOTALS[y]
            ? formatInt(OFFICIAL_SPONSORSHIP_TOTALS[y])
            : '',
        ),
      ],
    ],
  };
}

export interface CampaignRow {
  electionType: string;
  accounts: number;
  expensesRetained: number;
  /** Comptes dont les dépenses retenues sont renseignées (base de la moyenne). */
  accountsWithExpenses: number;
  reimbursement: number;
  rejected: number;
  notFiled: number;
  reimbursed: number;
}

const ELECTION_LABELS: Record<string, string> = {
  legislatives_2022: 'Législatives 2022',
  legislatives_2024: 'Législatives 2024',
  senatoriales_2023: 'Sénatoriales 2023',
};

/** Comptes de campagne CNCCFP, une colonne par élection. */
export function buildCampaignTable(rows: CampaignRow[]): Table {
  const cols = [...rows].sort((a, b) =>
    a.electionType.localeCompare(b.electionType),
  );
  return {
    headers: [
      '',
      ...cols.map((c) => ELECTION_LABELS[c.electionType] ?? c.electionType),
    ],
    rows: [
      ['Comptes', ...cols.map((c) => formatInt(c.accounts))],
      [
        'Dépenses retenues (total)',
        ...cols.map((c) => formatMillions(c.expensesRetained)),
      ],
      [
        'Dépense retenue moyenne',
        ...cols.map((c) =>
          formatEuros(c.expensesRetained / c.accountsWithExpenses),
        ),
      ],
      [
        'Remboursement (total)',
        ...cols.map((c) => formatMillions(c.reimbursement)),
      ],
      ['Comptes rejetés', ...cols.map((c) => formatInt(c.rejected))],
      ['Comptes non déposés', ...cols.map((c) => formatInt(c.notFiled))],
      ['Candidats remboursés', ...cols.map((c) => formatInt(c.reimbursed))],
    ],
  };
}

export interface GroupCountRow {
  group: string;
  deputies: number;
  count: number;
}

/** Tableau « groupe, députés, total, moyenne par député » (collaborateurs, questions). */
export function buildGroupTable(
  rows: GroupCountRow[],
  countHeader: string,
): Table {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  return {
    headers: ['Groupe', 'Députés', countHeader, 'Par député'],
    rows: sorted.map((r) => [
      r.group,
      formatInt(r.deputies),
      formatInt(r.count),
      formatDecimal(r.count / r.deputies, 1),
    ]),
  };
}

export interface AgeRow {
  n: number;
  mean: number;
  median: number;
  min: number;
  max: number;
}

export function buildAgeTable(a: AgeRow): Table {
  return {
    headers: ['Indicateur', 'Valeur'],
    rows: [
      ['Députés en fonction (date de naissance connue)', formatInt(a.n)],
      ['Âge moyen', `${formatDecimal(a.mean, 1)} ans`],
      ['Âge médian', `${formatInt(a.median)} ans`],
      ['Plus jeune', `${formatInt(a.min)} ans`],
      ['Plus âgé', `${formatInt(a.max)} ans`],
    ],
  };
}

export interface DirectoryRow {
  type: 'depute' | 'senateur' | 'eurodepute';
  lastName: string;
  firstName: string;
  department: string | null;
  district: string | null;
  politicalGroup: string | null;
  /** Dernier groupe parlementaire ouvert (Sénat) ; voir le piège dans `queries.ts`. */
  groupAffiliation: string | null;
  europeanGroup: string | null;
  nationalParty: string | null;
}

export interface Directory {
  deputes: Table;
  senateurs: Table;
  eurodeputes: Table;
  /** Légende des sigles des groupes de l'Assemblée. */
  groupesAssemblee: Table;
}

/**
 * Nom court d'un groupe : sigle entre parenthèses s'il existe (« … (RN) » →
 * « RN »), sinon nom sans le préfixe « Groupe » ; « CRCE-K » regroupe les
 * deux libellés du groupe communiste du Sénat.
 */
export function groupShortName(raw: string | null): string {
  if (!raw) return '';
  const sigle = /\(([^)]+)\)\s*$/.exec(raw)?.[1];
  if (sigle) return sigle;
  if (/CRCE/.test(raw)) return 'CRCE-K';
  if (/aucun groupe/i.test(raw)) return 'Sans groupe';
  return raw.replace(/^Groupe (du |de |des )?/i, '').trim();
}

const collator = new Intl.Collator('fr', { sensitivity: 'base' });

function byName(a: DirectoryRow, b: DirectoryRow): number {
  return (
    collator.compare(a.lastName, b.lastName) ||
    collator.compare(a.firstName, b.firstName)
  );
}

/** Nom tout en majuscules (quelques fiches) ramené en casse de titre : « HORTEFEUX » → « Hortefeux ». */
export function displayLastName(raw: string): string {
  if (raw.length < 2 || raw !== raw.toLocaleUpperCase('fr')) return raw;
  return raw
    .toLocaleLowerCase('fr')
    .replace(
      /(^|[-\s'])(\p{L})/gu,
      (_m, sep: string, c: string) => sep + c.toLocaleUpperCase('fr'),
    );
}

function personName(r: DirectoryRow): string {
  return `${displayLastName(r.lastName)}, ${r.firstName}`;
}

function districtLabel(district: string | null): string {
  return (district ?? '').replace(/circonscription/i, 'circ.');
}

/** Annuaire des parlementaires en fonction : nom, groupe, territoire. Ni contact, ni photo, ni date de naissance. */
export function buildDirectory(rows: DirectoryRow[]): Directory {
  const of = (type: DirectoryRow['type']) =>
    rows.filter((r) => r.type === type).sort(byName);
  const deputies = of('depute');

  const groupCounts = new Map<string, { name: string; n: number }>();
  for (const d of deputies) {
    const sigle = groupShortName(d.politicalGroup);
    const name = (d.politicalGroup ?? '').replace(/\s*\([^)]+\)\s*$/, '');
    const g = groupCounts.get(sigle) ?? { name, n: 0 };
    g.n += 1;
    groupCounts.set(sigle, g);
  }

  return {
    deputes: {
      headers: ['Député', 'Groupe', 'Circonscription'],
      rows: deputies.map((r) => [
        personName(r),
        groupShortName(r.politicalGroup),
        [r.department, districtLabel(r.district)].filter(Boolean).join(' · '),
      ]),
    },
    senateurs: {
      headers: ['Sénateur', 'Groupe', 'Département'],
      rows: of('senateur').map((r) => [
        personName(r),
        groupShortName(r.groupAffiliation),
        r.department ?? '',
      ]),
    },
    eurodeputes: {
      headers: ['Eurodéputé', 'Groupe européen', 'Parti national'],
      rows: of('eurodepute').map((r) => [
        personName(r),
        r.europeanGroup ?? '',
        r.nationalParty ?? '',
      ]),
    },
    groupesAssemblee: {
      headers: ['Sigle', 'Groupe', 'Députés'],
      rows: [...groupCounts.entries()]
        .sort((a, b) => b[1].n - a[1].n)
        .map(([sigle, g]) => [sigle, g.name, formatInt(g.n)]),
    },
  };
}
