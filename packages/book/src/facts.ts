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
