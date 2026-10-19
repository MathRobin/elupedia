import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { and, eq, isNull } from 'drizzle-orm';
import { mandates, officials } from '@elupedia/shared';
import {
  SITE_URL,
  formatDateLabel,
  type ChartBar,
  type ShortFacts,
} from '../script-facts.js';
import type { ShortScript } from '../script-schema.js';
import {
  NON_INSCRITS,
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
 * Thème « age-deputes » : l'âge des députés en fonction. Faits : dates de
 * naissance des députés (données ouvertes de l'Assemblée, table `officials`)
 * × mandats de député en cours, âge calculé à la date du jour ; âge
 * d'éligibilité repris de la fiche de synthèse n°3 de l'Assemblée.
 *
 * Pièges : l'âge est calculé à la date de génération (`asOf`), qui figure
 * dans la vidéo ; les non-inscrits ne forment pas un groupe (hors graphique
 * par groupe, dans les totaux).
 */

/** Âge minimal pour être candidat (Code électoral, art. LO 127, depuis 2011). */
export const MIN_AGE_TO_RUN = 18;

export const SOURCES = [
  {
    label:
      "Assemblée nationale, fiche de synthèse n°3 « L'élection des députés » (conditions d'éligibilité)",
    url: 'https://www.assemblee-nationale.fr/dyn/synthese/deputes-groupes-parlementaires/l-election-des-deputes',
  },
  {
    label:
      "Données ouvertes de l'Assemblée nationale, députés en exercice (état civil)",
    url: 'https://data.assemblee-nationale.fr/acteurs/deputes-en-exercice',
  },
];

export interface DeputyBirth {
  politicalGroup: string | null;
  birthDate: string;
}

export interface DeputiesAgeRows {
  deputies: DeputyBirth[];
  asOf: string;
}

const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: 'moins de 30 ans', min: 0, max: 29 },
  { label: '30 à 39 ans', min: 30, max: 39 },
  { label: '40 à 49 ans', min: 40, max: 49 },
  { label: '50 à 59 ans', min: 50, max: 59 },
  { label: '60 à 69 ans', min: 60, max: 69 },
  { label: '70 ans et plus', min: 70, max: Infinity },
];

export function ageAt(birthDate: string, asOf: string): number {
  const b = new Date(`${birthDate}T00:00:00Z`);
  const a = new Date(`${asOf}T00:00:00Z`);
  let age = a.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    a.getUTCMonth() < b.getUTCMonth() ||
    (a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export async function loadDeputiesAge(
  db: NeonHttpDatabase,
): Promise<DeputiesAgeRows> {
  const rows = await db
    .select({
      politicalGroup: mandates.politicalGroup,
      birthDate: officials.birthDate,
    })
    .from(mandates)
    .innerJoin(officials, eq(officials.id, mandates.officialId))
    .where(and(eq(mandates.type, 'depute'), isNull(mandates.endDate)));
  return {
    deputies: rows.filter((r): r is DeputyBirth => r.birthDate !== null),
    asOf: new Date().toISOString().slice(0, 10),
  };
}

export function buildDeputiesAgeFacts(
  shortId: string,
  rows: DeputiesAgeRows,
): ShortFacts {
  const ages = rows.deputies.map((d) => ({
    group: d.politicalGroup,
    age: ageAt(d.birthDate, rows.asOf),
  }));
  const mean = ages.length
    ? ages.reduce((s, a) => s + a.age, 0) / ages.length
    : 0;
  const distribution: ChartBar[] = BUCKETS.map((b) => ({
    label: b.label,
    spokenLabel: b.label,
    value: ages.filter((a) => a.age >= b.min && a.age <= b.max).length,
    group: null,
    count: null,
  }));
  const byGroup = new Map<string, { n: number; sum: number }>();
  for (const a of ages) {
    if (!a.group || NON_INSCRITS.test(a.group)) continue;
    const g = byGroup.get(a.group) ?? { n: 0, sum: 0 };
    g.n += 1;
    g.sum += a.age;
    byGroup.set(a.group, g);
  }
  const groups = sortBars(
    [...byGroup.entries()].map(([name, g]) =>
      groupBar(name, round(g.sum / g.n, 1), g.n),
    ),
  );
  return {
    shortId,
    ballots: [],
    topic: {
      kind: 'age-deputes',
      chamber: 'Assemblée nationale',
      dateLabel: formatDateLabel(rows.asOf),
      asOf: rows.asOf,
      title: "L'âge des députés",
      numbers: {
        deputies: ages.length,
        meanAge: round(mean, 1),
        youngest: Math.min(...ages.map((a) => a.age)),
        oldest: Math.max(...ages.map((a) => a.age)),
        minAgeToRun: MIN_AGE_TO_RUN,
      },
      charts: [
        {
          id: 'age-buckets',
          title: 'Députés par tranche d’âge',
          unit: '',
          decimals: 0,
          countUnit: 'députés',
          bars: distribution,
        },
        {
          id: 'mean-age-by-group',
          title: 'Âge moyen par groupe',
          unit: ' ans',
          decimals: 1,
          countUnit: 'députés',
          bars: groups,
        },
      ],
      url: `${SITE_URL}/elus`,
      elupediaLabel:
        'La date de naissance et le parcours de chaque député, sur sa fiche Elupedia',
      dataSourceLabel: 'Assemblée nationale',
      sources: SOURCES,
    },
  };
}

export function deputiesAgeScript(facts: ShortFacts): ShortScript {
  const t = facts.topic;
  if (!t || t.kind !== 'age-deputes')
    throw new Error('faits « age-deputes » attendus');
  const n = t.numbers;
  const buckets = t.charts[0]!.bars;
  const [top] = byValueDesc(buckets);
  const youngestBucket = buckets[0]!;
  const oldestBucket = buckets[buckets.length - 1]!;
  const byAge = [...t.charts[1]!.bars].sort((a, b) => a.value - b.value);
  const low = byAge[0]!;
  const high = byAge[byAge.length - 1]!;
  const years = (v: number) => formatDecimal(v, 1, true);

  const scenes = withDurations([
    {
      id: 's1',
      kind: 'hook',
      voiceover: `Qui siège à l'Assemblée nationale ? Un regard sur l'âge des ${formatInt(n.deputies!)} députés en fonction, d'après les données ouvertes de l'Assemblée au ${t.dateLabel}.`,
      onScreenText: t.title,
      visual: 'title',
      chart: null,
      lowerThird: null,
    },
    {
      id: 's2',
      kind: 'context',
      voiceover: `Il faut avoir ${n.minAgeToRun} ans pour être candidat. Le plus jeune député a ${n.youngest} ans, le plus âgé ${n.oldest}. L'âge moyen est de ${years(n.meanAge!)} ans.`,
      onScreenText: `De ${n.youngest} à ${n.oldest} ans`,
      visual: 'title',
      chart: null,
      lowerThird: null,
    },
    {
      id: 's3',
      kind: 'result',
      voiceover: `Par tranche d'âge, la plus nombreuse est celle des ${top!.label} : ${formatInt(top!.value)} députés. Les ${youngestBucket.label} sont ${formatInt(youngestBucket.value)}, les ${oldestBucket.label} sont ${formatInt(oldestBucket.value)}.`,
      onScreenText: t.charts[0]!.title,
      visual: 'chart',
      chart: t.charts[0]!.id,
      lowerThird: null,
    },
    {
      id: 's4',
      kind: 'groups',
      voiceover: `Par groupe, l'âge moyen va de ${years(low.value)} ans pour ${low.spokenLabel} à ${years(high.value)} ans pour ${high.spokenLabel}.`,
      onScreenText: t.charts[1]!.title,
      visual: 'chart',
      chart: t.charts[1]!.id,
      lowerThird: null,
    },
    {
      id: 's5',
      kind: 'outro',
      voiceover:
        'La fiche de chaque député, avec son parcours, est sur Elupedia. Sources en description.',
      onScreenText: t.url,
      visual: 'source',
      chart: null,
      lowerThird: null,
    },
  ]);

  return {
    title: 'Quel âge ont les députés ?',
    scenes,
    description: `Il faut avoir ${n.minAgeToRun} ans pour être candidat aux élections législatives. Au ${t.dateLabel}, les ${formatInt(n.deputies!)} députés en fonction ont entre ${n.youngest} et ${n.oldest} ans, ${formatDecimal(n.meanAge!, 1)} ans en moyenne ; la tranche la plus nombreuse est celle des ${top!.label} (${formatInt(top!.value)} députés) et l'âge moyen par groupe va de ${formatDecimal(low.value, 1)} ans (${low.spokenLabel}) à ${formatDecimal(high.value, 1)} ans (${high.spokenLabel}).`,
    hashtags: ['#AssembléeNationale', '#Députés', '#Âge', '#Transparence'],
  };
}

export const deputiesAgeTopic: TopicDefinition<DeputiesAgeRows> = {
  key: 'age-deputes',
  summary:
    "l'âge des députés en fonction : tranches d'âge, âge moyen par groupe",
  load: loadDeputiesAge,
  build: buildDeputiesAgeFacts,
  script: deputiesAgeScript,
};
