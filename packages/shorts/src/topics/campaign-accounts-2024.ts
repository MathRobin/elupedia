import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { eq, sql } from 'drizzle-orm';
import { campaignAccounts } from '@elupedia/shared';
import {
  SITE_URL,
  formatDateLabel,
  type ChartBar,
  type ShortFacts,
} from '../script-facts.js';
import type { ShortScript } from '../script-schema.js';
import {
  MAX_CHART_BARS,
  formatDecimal,
  formatInt,
  round,
  sortBars,
  withDurations,
  type TopicDefinition,
} from './common.js';

/**
 * Thème « comptes-campagne-2024 » : ce que coûte une campagne législative,
 * d'après les comptes des législatives de 2024 publiés par la CNCCFP (table
 * `campaign_accounts`, `election_type = legislatives_2024`) ; règles du Code
 * électoral (plafond : 38 000 € + 0,15 € par habitant, coefficient 1,26 ;
 * remboursement forfaitaire jusqu'à 47,5 % du plafond au-dessus de 5 % des
 * suffrages) reprises du guide du candidat de la CNCCFP.
 *
 * Pièges : les dépenses « retenues » sont celles arrêtées par la Commission
 * (nulles pour les comptes sans dépense) ; les étiquettes sont les nuances
 * politiques attribuées par le ministère de l'Intérieur, pas les groupes de
 * l'Assemblée ; seules les étiquettes d'au moins `MIN_ACCOUNTS_PER_LABEL`
 * comptes sont tracées, par ordre alphabétique.
 */

export const CEILING_BASE_EUR = 38000;
export const CEILING_PER_INHABITANT_EUR = 0.15;
export const CEILING_COEFFICIENT = 1.26;
export const REIMBURSEMENT_PERCENT_OF_CEILING = 47.5;
export const REIMBURSEMENT_THRESHOLD_PERCENT = 5;
export const ELECTION_TYPE = 'legislatives_2024';
export const ELECTION_YEAR = 2024;
/** Étiquettes tracées : au moins ce nombre de comptes, et les 12 plus nombreuses. */
const MIN_ACCOUNTS_PER_LABEL = 100;

export const SOURCES = [
  {
    label:
      'CNCCFP, guide du candidat et du mandataire, élections législatives 2024 (plafond de dépenses, remboursement forfaitaire)',
    url: 'https://cnccfp.fr/wp-content/uploads/2024/06/cnccfp-guide_legislatives_2024.pdf',
  },
  {
    label:
      'CNCCFP, publication simplifiée des comptes de campagne des élections législatives 2024',
    url: 'https://cnccfp.fr/wp-content/uploads/2025/09/cnccfp_publication-legislatives-2024.pdf',
  },
  {
    label:
      "Code électoral, article L. 52-11 (plafond des dépenses électorales) et L. 52-11-1 (remboursement forfaitaire de l'État)",
    url: 'https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070239/LEGISCTA000006148459/',
  },
];

export interface CampaignAccountRow {
  politicalLabel: string | null;
  expensesRetained: number | null;
  reimbursement: number | null;
}

export interface CampaignAccountsRows {
  accounts: CampaignAccountRow[];
  asOf: string;
}

const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: 'moins de 1 000 €', min: 0, max: 999.99 },
  { label: '1 000 à 10 000 €', min: 1000, max: 9999.99 },
  { label: '10 000 à 25 000 €', min: 10000, max: 24999.99 },
  { label: '25 000 à 50 000 €', min: 25000, max: 49999.99 },
  { label: '50 000 € et plus', min: 50000, max: Infinity },
];

export async function loadCampaignAccounts(
  db: NeonHttpDatabase,
): Promise<CampaignAccountsRows> {
  const rows = await db
    .select({
      politicalLabel: campaignAccounts.politicalLabel,
      expensesRetained: sql<
        number | null
      >`${campaignAccounts.expensesRetained}::float8`,
      reimbursement: sql<
        number | null
      >`${campaignAccounts.reimbursement}::float8`,
      updatedAt: sql<string>`${campaignAccounts.updatedAt}::date::text`,
    })
    .from(campaignAccounts)
    .where(eq(campaignAccounts.electionType, ELECTION_TYPE));
  const asOf =
    rows
      .map((r) => r.updatedAt)
      .sort()
      .at(-1) ?? new Date().toISOString().slice(0, 10);
  return { accounts: rows, asOf };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** « Ensemble ! (Majorité présidentielle) » → écran « Ensemble ! », voix « Ensemble, majorité présidentielle ». */
export function labelNames(label: string): { short: string; spoken: string } {
  const short = label.replace(/\s*\(.*\)\s*$/, '').trim();
  const spoken = label
    .replace(
      /\s*\((.*)\)\s*$/,
      (_m, inner: string) =>
        `, ${inner.charAt(0).toLocaleLowerCase('fr')}${inner.slice(1)}`,
    )
    .replace(/\s*!/g, '')
    .trim();
  return { short, spoken };
}

export function buildCampaignAccountsFacts(
  shortId: string,
  rows: CampaignAccountsRows,
): ShortFacts {
  const { accounts } = rows;
  const withExpenses = accounts.filter(
    (a): a is CampaignAccountRow & { expensesRetained: number } =>
      a.expensesRetained !== null,
  );
  const expenses = withExpenses.map((a) => a.expensesRetained);
  const totalExpenses = expenses.reduce((s, v) => s + v, 0);
  const totalReimbursement = accounts.reduce(
    (s, a) => s + (a.reimbursement ?? 0),
    0,
  );

  const distribution: ChartBar[] = BUCKETS.map((b) => ({
    label: b.label,
    spokenLabel: b.label.replace(/€/g, 'euros'),
    value: expenses.filter((v) => v >= b.min && v <= b.max).length,
    group: null,
    count: null,
  }));

  const byLabel = new Map<
    string,
    { n: number; sum: number; accounts: number }
  >();
  for (const a of accounts) {
    if (!a.politicalLabel) continue;
    const g = byLabel.get(a.politicalLabel) ?? { n: 0, sum: 0, accounts: 0 };
    g.accounts += 1;
    if (a.expensesRetained !== null) {
      g.n += 1;
      g.sum += a.expensesRetained;
    }
    byLabel.set(a.politicalLabel, g);
  }
  const labels = sortBars(
    [...byLabel.entries()]
      .filter(([, g]) => g.accounts >= MIN_ACCOUNTS_PER_LABEL && g.n > 0)
      .sort((a, b) => b[1].accounts - a[1].accounts)
      .slice(0, MAX_CHART_BARS)
      .map(([label, g]) => {
        const { short, spoken } = labelNames(label);
        return {
          label: short,
          spokenLabel: spoken,
          value: Math.round(g.sum / g.n),
          group: null,
          count: g.accounts,
        };
      }),
  );

  return {
    shortId,
    ballots: [],
    topic: {
      kind: 'comptes-campagne-2024',
      chamber: 'Législatives 2024',
      dateLabel: formatDateLabel(rows.asOf),
      asOf: rows.asOf,
      title: 'Ce que coûte une campagne législative',
      numbers: {
        electionYear: ELECTION_YEAR,
        accounts: accounts.length,
        withExpenses: withExpenses.length,
        reimbursed: accounts.filter((a) => (a.reimbursement ?? 0) > 0).length,
        medianExpenses: Math.round(median(expenses)),
        maxExpenses: Math.round(Math.max(0, ...expenses)),
        totalExpensesMillions: round(totalExpenses / 1e6, 1),
        totalReimbursementMillions: round(totalReimbursement / 1e6, 1),
        ceilingBase: CEILING_BASE_EUR,
        perInhabitant: CEILING_PER_INHABITANT_EUR,
        coefficient: CEILING_COEFFICIENT,
        reimbursementPercent: REIMBURSEMENT_PERCENT_OF_CEILING,
        thresholdPercent: REIMBURSEMENT_THRESHOLD_PERCENT,
      },
      charts: [
        {
          id: 'expenses-buckets',
          title: 'Dépenses retenues par candidat',
          unit: '',
          decimals: 0,
          countUnit: 'candidats',
          bars: distribution,
        },
        {
          id: 'mean-by-label',
          title: 'Dépense moyenne par étiquette',
          unit: ' €',
          decimals: 0,
          countUnit: 'comptes',
          bars: labels,
        },
      ],
      url: `${SITE_URL}/elus`,
      elupediaLabel:
        'Les comptes de campagne de chaque élu, sur sa fiche Elupedia',
      dataSourceLabel: 'CNCCFP',
      sources: SOURCES,
    },
  };
}

export function campaignAccountsScript(facts: ShortFacts): ShortScript {
  const t = facts.topic;
  if (!t || t.kind !== 'comptes-campagne-2024')
    throw new Error('faits « comptes-campagne-2024 » attendus');
  const n = t.numbers;
  const buckets = t.charts[0]!.bars;
  const mid = buckets[1]!;
  const top = buckets[buckets.length - 1]!;
  const byMean = [...t.charts[1]!.bars].sort((a, b) => a.value - b.value);
  const low = byMean[0]!;
  const high = byMean[byMean.length - 1]!;

  const scenes = withDurations([
    {
      id: 's1',
      kind: 'hook',
      voiceover: `Combien coûte une campagne pour devenir député ? Les comptes des législatives de ${n.electionYear} sont publics, contrôlés par la Commission nationale des comptes de campagne.`,
      onScreenText: t.title,
      visual: 'title',
      chart: null,
      lowerThird: null,
    },
    {
      id: 's2',
      kind: 'context',
      voiceover: `Les dépenses sont plafonnées : ${formatInt(n.ceilingBase!)} euros par candidat, plus ${formatDecimal(n.perInhabitant!, 2)} euro par habitant, le tout multiplié par ${formatDecimal(n.coefficient!, 2)}. L'État rembourse jusqu'à ${formatDecimal(n.reimbursementPercent!, 1)} % du plafond aux candidats ayant obtenu au moins ${n.thresholdPercent} % des voix.`,
      onScreenText: 'Plafond et remboursement',
      visual: 'title',
      chart: null,
      lowerThird: null,
    },
    {
      id: 's3',
      kind: 'result',
      voiceover: `${formatInt(n.accounts!)} comptes ont été déposés. Pour les ${formatInt(n.withExpenses!)} candidats avec des dépenses, la médiane est de ${formatInt(n.medianExpenses!)} euros. ${formatInt(mid.value)} se situent entre ${mid.spokenLabel.replace(' à ', ' et ')}, ${formatInt(top.value)} au-dessus de ${top.spokenLabel.replace(' et plus', '')}.`,
      onScreenText: t.charts[0]!.title,
      visual: 'chart',
      chart: t.charts[0]!.id,
      lowerThird: null,
    },
    {
      id: 's4',
      kind: 'groups',
      voiceover: `En moyenne par étiquette, de ${formatInt(low.value)} euros pour ${low.spokenLabel} à ${formatInt(high.value)} euros pour ${high.spokenLabel}. Au total, ${formatDecimal(n.totalExpensesMillions!, 1, true)} millions d'euros dépensés, ${formatDecimal(n.totalReimbursementMillions!, 1, true)} millions remboursés par l'État.`,
      onScreenText: t.charts[1]!.title,
      visual: 'chart',
      chart: t.charts[1]!.id,
      lowerThird: null,
    },
    {
      id: 's5',
      kind: 'outro',
      voiceover:
        'Le compte de campagne de chaque élu est sur sa fiche Elupedia. Sources en description.',
      onScreenText: t.url,
      visual: 'source',
      chart: null,
      lowerThird: null,
    },
  ]);

  return {
    title: `Législatives ${n.electionYear} : ce que coûte une campagne`,
    scenes,
    description: `Aux élections législatives, les dépenses de campagne sont plafonnées (${formatInt(n.ceilingBase!)} € par candidat plus ${formatDecimal(n.perInhabitant!, 2)} € par habitant, multipliés par ${formatDecimal(n.coefficient!, 2)}) et l'État rembourse jusqu'à ${formatDecimal(n.reimbursementPercent!, 1)} % du plafond aux candidats ayant obtenu au moins ${n.thresholdPercent} % des suffrages, après contrôle de la CNCCFP. Pour les législatives de ${n.electionYear}, ${formatInt(n.accounts!)} comptes ont été déposés, ${formatInt(n.withExpenses!)} avec des dépenses retenues (médiane ${formatInt(n.medianExpenses!)} €, maximum ${formatInt(n.maxExpenses!)} €), ${formatDecimal(n.totalExpensesMillions!, 1)} millions d'euros au total dont ${formatDecimal(n.totalReimbursementMillions!, 1)} millions remboursés ; les étiquettes sont les nuances politiques du ministère de l'Intérieur.`,
    hashtags: [
      '#Législatives',
      '#ComptesDeCampagne',
      '#CNCCFP',
      '#Transparence',
    ],
  };
}

export const campaignAccountsTopic: TopicDefinition<CampaignAccountsRows> = {
  key: 'comptes-campagne-2024',
  summary:
    'les comptes de campagne des législatives 2024 : plafond, remboursement, dépenses par candidat et par étiquette',
  load: loadCampaignAccounts,
  build: buildCampaignAccountsFacts,
  script: campaignAccountsScript,
};
