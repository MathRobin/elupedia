import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { mandates, staffers } from '@elupedia/shared';
import {
  SITE_URL,
  formatDateLabel,
  type ChartBar,
  type ShortFacts,
} from '../script-facts.js';
import type { ShortScript } from '../script-schema.js';
import {
  NON_INSCRITS,
  NUMBER_WORDS,
  byValueDesc,
  formatDecimal,
  formatInt,
  groupBar,
  round,
  sortBars,
  withDurations,
  type TopicDefinition,
} from './common.js';

/**
 * Thème « staffers » : l'enveloppe collaborateurs des députés. Faits calculés
 * depuis la base (`staffers` en poste × mandats de député en cours) et repris
 * de pages officielles de l'Assemblée (crédit collaborateur) ; script de
 * gabarit validé par `script-validate.ts` comme un script généré.
 *
 * Pièges : les constantes `CREDIT_*` viennent de la fiche de synthèse de
 * l'Assemblée (voir `SOURCES`), à vérifier à chaque revalorisation ; les
 * données ouvertes comptent parfois plus de cinq collaborateurs pour un
 * député (temps partiels, équipes en cours de changement), la barre « 6 et
 * plus » les regroupe sans les interpréter ; les non-inscrits ne forment pas
 * un groupe et n'entrent pas dans le graphique par groupe (mais comptent
 * dans les totaux).
 */

/** Crédit collaborateur mensuel brut (fiche AN « La situation matérielle du député », janvier 2026). */
export const CREDIT_MONTHLY_EUR = 11463;
/** Nombre maximal de collaborateurs par député, quel que soit leur temps de travail. */
export const MAX_STAFFERS_PER_DEPUTY = 5;

/** Même jeu de données que l'ingestion (`packages/ingest/src/sources/an-collaborateurs.ts`). */
const AN_STAFFERS_DATASET_URL =
  'https://data.assemblee-nationale.fr/static/openData/repository/17/amo/collaborateurs_csv_opendata/liste_collaborateurs_libre_office.csv';

export const SOURCES = [
  {
    label:
      'Assemblée nationale, fiche de synthèse « La situation matérielle du député » (crédit collaborateur, janvier 2026)',
    url: 'https://www.assemblee-nationale.fr/dyn/synthese/deputes-groupes-parlementaires/la-situation-materielle-du-depute',
  },
  {
    label: 'Assemblée nationale, présentation du budget 2026',
    url: 'https://www.assemblee-nationale.fr/dyn/17/divers/budget/Presentation-Budget-AN-2026.html',
  },
  {
    label:
      "Données ouvertes de l'Assemblée nationale, liste des collaborateurs de députés (CSV)",
    url: AN_STAFFERS_DATASET_URL,
  },
];

/** Un député en fonction et son nombre de collaborateurs en poste. */
export interface DeputyStaffCount {
  politicalGroup: string | null;
  staffers: number;
}

export interface StaffersRows {
  deputies: DeputyStaffCount[];
  asOf: string;
}

/** Au-delà, les députés sont regroupés dans une barre « N et plus ». */
const DISTRIBUTION_CAP = 6;

export async function loadDeputyStaffCounts(
  db: NeonHttpDatabase,
): Promise<DeputyStaffCount[]> {
  return db
    .select({
      politicalGroup: mandates.politicalGroup,
      staffers: sql<number>`count(${staffers.id})::int`,
    })
    .from(mandates)
    .leftJoin(
      staffers,
      and(
        eq(staffers.officialId, mandates.officialId),
        isNull(staffers.endDate),
      ),
    )
    .where(and(eq(mandates.type, 'depute'), isNull(mandates.endDate)))
    .groupBy(mandates.officialId, mandates.politicalGroup);
}

export async function loadStaffersAsOf(db: NeonHttpDatabase): Promise<string> {
  const [row] = await db
    .select({ at: sql<string>`max(${staffers.updatedAt})::date::text` })
    .from(staffers);
  return row?.at ?? new Date().toISOString().slice(0, 10);
}

export function buildStaffersFacts(
  shortId: string,
  deputies: DeputyStaffCount[],
  asOf: string,
): ShortFacts {
  const deputyCount = deputies.length;
  const total = deputies.reduce((n, d) => n + d.staffers, 0);
  const mean = deputyCount > 0 ? total / deputyCount : 0;

  // Répartition : combien de députés ont 0, 1, … collaborateurs.
  const distribution: ChartBar[] = [];
  for (let n = 0; n <= DISTRIBUTION_CAP; n++) {
    const count =
      n < DISTRIBUTION_CAP
        ? deputies.filter((d) => d.staffers === n).length
        : deputies.filter((d) => d.staffers >= n).length;
    const label = n < DISTRIBUTION_CAP ? String(n) : `${n} et plus`;
    distribution.push({
      label,
      spokenLabel: label,
      value: count,
      group: null,
      count: null,
    });
  }

  // Moyenne par groupe, ordre alphabétique du sigle (comme les barres de vote).
  const byGroup = new Map<string, { deputies: number; staffers: number }>();
  for (const d of deputies) {
    if (!d.politicalGroup || NON_INSCRITS.test(d.politicalGroup)) continue;
    const g = byGroup.get(d.politicalGroup) ?? { deputies: 0, staffers: 0 };
    g.deputies += 1;
    g.staffers += d.staffers;
    byGroup.set(d.politicalGroup, g);
  }
  const groups = sortBars(
    [...byGroup.entries()].map(([name, g]) =>
      groupBar(name, round(g.staffers / g.deputies, 2), g.deputies),
    ),
  );

  return {
    shortId,
    ballots: [],
    topic: {
      kind: 'staffers',
      chamber: 'Assemblée nationale',
      dateLabel: formatDateLabel(asOf),
      asOf,
      title: "L'enveloppe collaborateurs des députés",
      numbers: {
        creditMonthlyEur: CREDIT_MONTHLY_EUR,
        maxStaffersPerDeputy: MAX_STAFFERS_PER_DEPUTY,
        deputies: deputyCount,
        staffers: total,
        meanStaffers: round(mean, 1),
      },
      charts: [
        {
          id: 'staffers-per-deputy',
          title: 'Collaborateurs par député',
          unit: '',
          decimals: 0,
          countUnit: 'députés',
          bars: distribution,
        },
        {
          id: 'mean-by-group',
          title: 'Moyenne par groupe',
          unit: '',
          decimals: 1,
          countUnit: 'députés',
          bars: groups,
        },
      ],
      url: `${SITE_URL}/elus`,
      elupediaLabel:
        'Les collaborateurs de chaque député, sur sa fiche Elupedia',
      dataSourceLabel: 'Assemblée nationale',
      sources: SOURCES,
    },
  };
}

export function staffersScript(facts: ShortFacts): ShortScript {
  const t = facts.topic;
  if (!t || t.kind !== 'staffers')
    throw new Error('faits « staffers » attendus');
  const n = t.numbers;
  const distribution = t.charts[0]!.bars;
  const groups = t.charts[1]!.bars;

  const [first, second] = byValueDesc(
    distribution.filter((b) => !b.label.includes('plus')),
  );
  const capBar = distribution.find((b) => b.label.includes('plus'))!;
  const word = (label: string) => NUMBER_WORDS[Number(label)] ?? label;

  const byMean = [...groups].sort((a, b) => a.value - b.value);
  const low = byMean[0]!;
  const high = byMean[byMean.length - 1]!;
  const middle = byMean.slice(1, -1);
  const midLow = middle[0] ?? low;
  const midHigh = middle[middle.length - 1] ?? high;
  const mean = (v: number, spoken = true) => formatDecimal(v, 1, spoken);

  const scenes = withDurations([
    {
      id: 's1',
      kind: 'hook',
      voiceover:
        "Un député ne travaille pas seul. Pour recruter son équipe, l'Assemblée nationale lui ouvre chaque mois une enveloppe dédiée : le crédit collaborateur.",
      onScreenText: t.title,
      visual: 'title',
      chart: null,
      lowerThird: null,
    },
    {
      id: 's2',
      kind: 'context',
      voiceover: `Il s'élève à ${formatInt(n.creditMonthlyEur!)} euros bruts par mois, pour salarier jusqu'à ${NUMBER_WORDS[n.maxStaffersPerDeputy!]} collaborateurs, à Paris ou en circonscription. Les cotisations patronales sont prises en charge en plus par l'Assemblée.`,
      onScreenText: `${formatInt(n.creditMonthlyEur!)} € bruts par mois`,
      visual: 'title',
      chart: null,
      lowerThird: null,
    },
    {
      id: 's3',
      kind: 'result',
      voiceover: `Au ${t.dateLabel}, ${formatInt(n.deputies!)} députés déclarent ${formatInt(n.staffers!)} collaborateurs dans les données ouvertes de l'Assemblée. Le plus souvent ${word(first!.label)} : ${formatInt(first!.value)} députés. Puis ${word(second!.label)}, pour ${formatInt(second!.value)} députés. ${formatInt(capBar.value)} en déclarent ${word(String(DISTRIBUTION_CAP))} ou plus.`,
      onScreenText: t.charts[0]!.title,
      visual: 'chart',
      chart: t.charts[0]!.id,
      lowerThird: null,
    },
    {
      id: 's4',
      kind: 'groups',
      voiceover: `Par groupe, la moyenne va de ${mean(low.value)} collaborateurs pour ${low.spokenLabel} à ${mean(high.value)} pour ${high.spokenLabel}. Les autres groupes se situent entre ${mean(midLow.value)} et ${mean(midHigh.value)}.`,
      onScreenText: t.charts[1]!.title,
      visual: 'chart',
      chart: t.charts[1]!.id,
      lowerThird: null,
    },
    {
      id: 's5',
      kind: 'outro',
      voiceover:
        'Le détail, député par député, est sur la fiche de chaque élu sur Elupedia. Sources en description.',
      onScreenText: t.url,
      visual: 'source',
      chart: null,
      lowerThird: null,
    },
  ]);

  return {
    title: 'Combien de collaborateurs pour un député ?',
    scenes,
    description: `Chaque député dispose d'un crédit collaborateur de ${formatInt(n.creditMonthlyEur!)} € bruts par mois pour salarier jusqu'à ${n.maxStaffersPerDeputy} collaborateurs, les cotisations patronales étant prises en charge par l'Assemblée nationale. Au ${t.dateLabel}, les ${formatInt(n.deputies!)} députés en fonction déclarent ${formatInt(n.staffers!)} collaborateurs dans les données ouvertes de l'Assemblée, soit ${mean(n.meanStaffers!, false)} en moyenne ; la moyenne par groupe va de ${mean(low.value, false)} (${low.spokenLabel}) à ${mean(high.value, false)} (${high.spokenLabel}).`,
    hashtags: [
      '#AssembléeNationale',
      '#Députés',
      '#Collaborateurs',
      '#Transparence',
    ],
  };
}

export const staffersTopic: TopicDefinition<StaffersRows> = {
  key: 'staffers',
  summary:
    "l'enveloppe collaborateurs des députés : crédit mensuel, collaborateurs par député, moyenne par groupe",
  load: async (db) => ({
    deputies: await loadDeputyStaffCounts(db),
    asOf: await loadStaffersAsOf(db),
  }),
  build: (shortId, rows) =>
    buildStaffersFacts(shortId, rows.deputies, rows.asOf),
  script: staffersScript,
};
