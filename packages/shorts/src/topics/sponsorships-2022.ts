import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { eq, sql } from 'drizzle-orm';
import { sponsorships } from '@elupedia/shared';
import {
  SITE_URL,
  formatDateLabel,
  type ChartBar,
  type ShortFacts,
} from '../script-facts.js';
import type { ShortScript } from '../script-schema.js';
import {
  NUMBER_WORDS,
  byValueDesc,
  formatInt,
  sortBars,
  withDurations,
  type TopicDefinition,
} from './common.js';

/**
 * Thème « parrainages-2022 » : les parrainages de l'élection présidentielle
 * de 2022. Faits : table `sponsorships` (liste publiée par le Conseil
 * constitutionnel, reprise par l'ingestion), agrégée par fonction du
 * parrain et par candidat ; règles de la loi du 6 novembre 1962 (500
 * parrainages, 30 départements ou collectivités, au plus un dixième d'un
 * même département) ; totaux officiels du communiqué du Conseil
 * constitutionnel (constantes `OFFICIAL_*`).
 *
 * Pièges : la liste en base peut différer de quelques dizaines de lignes du
 * total officiel (doublons, lignes non lues) : la voix cite le total
 * officiel, les barres montrent la liste telle que reprise, la description
 * donne les deux ; seuls les candidats ayant atteint 500 parrainages sont
 * tracés, par ordre alphabétique, pour ne mettre personne en avant.
 */

export const REQUIRED_SPONSORSHIPS = 500;
export const MIN_DEPARTMENTS = 30;
/** Depuis la loi organique du 18 juin 1976 (100 parrainages auparavant). */
export const RULE_SINCE_YEAR = 1976;
/** Communiqué du Conseil constitutionnel, 7 mars 2022 : 13 672 reçus, 13 427 validés, 65 noms, 12 candidats. */
export const OFFICIAL_VALIDATED = 13427;
export const OFFICIAL_RECEIVED = 13672;
export const OFFICIAL_NAMES_PROPOSED = 65;
export const ELECTION_YEAR = 2022;

export const SOURCES = [
  {
    label:
      'Conseil constitutionnel, élection présidentielle 2022 : tous les parrainages validés (liste nominative)',
    url: 'https://presidentielle2022.conseil-constitutionnel.fr/les-parrainages/tous-les-parrainages-valides.html',
  },
  {
    label:
      'Conseil constitutionnel, communiqué : liste des candidats au premier tour (13 427 parrainages validés, 65 noms proposés, 12 candidats)',
    url: 'https://presidentielle2022.conseil-constitutionnel.fr/les-communiques/liste-candidats-1ertour.html',
  },
  {
    label:
      "Loi n° 62-1292 du 6 novembre 1962 relative à l'élection du Président de la République (article 3 : 500 présentations, 30 départements ou collectivités, un dixième au plus d'un même département)",
    url: 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000684037',
  },
];

export interface SponsorshipsRows {
  functions: { rawFunction: string; n: number }[];
  candidates: { candidateName: string; n: number }[];
  asOf: string;
}

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

export function categoryOf(rawFunction: string): string {
  return (
    FUNCTION_CATEGORIES.find((c) => c.test.test(rawFunction))?.label ??
    OTHER_LABEL
  );
}

/** « PÉCRESSE Valérie » → { last: 'Pécresse', full: 'Valérie Pécresse' }. */
export function splitCandidateName(raw: string): {
  last: string;
  full: string;
} {
  const tokens = raw.trim().split(/\s+/);
  const isUpper = (t: string) =>
    t === t.toLocaleUpperCase('fr') && /\p{L}/u.test(t);
  const lastTokens = tokens.filter(isUpper);
  const firstTokens = tokens.filter((t) => !isUpper(t));
  const title = (t: string) =>
    t
      .toLocaleLowerCase('fr')
      .replace(
        /(^|[-\s'])(\p{L})/gu,
        (_m, sep: string, c: string) => sep + c.toLocaleUpperCase('fr'),
      );
  const last = lastTokens.map(title).join(' ');
  const first = firstTokens.join(' ');
  return { last, full: first ? `${first} ${last}` : last };
}

export async function loadSponsorships(
  db: NeonHttpDatabase,
): Promise<SponsorshipsRows> {
  const where = eq(sponsorships.electionYear, ELECTION_YEAR);
  const functions = await db
    .select({
      rawFunction: sql<string>`coalesce(${sponsorships.rawFunction}, '')`,
      n: sql<number>`count(*)::int`,
    })
    .from(sponsorships)
    .where(where)
    .groupBy(sponsorships.rawFunction);
  const candidates = await db
    .select({
      candidateName: sponsorships.candidateName,
      n: sql<number>`count(*)::int`,
    })
    .from(sponsorships)
    .where(where)
    .groupBy(sponsorships.candidateName);
  const [{ asOf }] = await db
    .select({ asOf: sql<string>`max(${sponsorships.publicationDate})::text` })
    .from(sponsorships)
    .where(where);
  return { functions, candidates, asOf: asOf ?? `${ELECTION_YEAR}-03-07` };
}

export function buildSponsorshipsFacts(
  shortId: string,
  rows: SponsorshipsRows,
): ShortFacts {
  const inBase = rows.functions.reduce((n, f) => n + f.n, 0);
  const byCategory = new Map<string, number>();
  for (const f of rows.functions) {
    const c = categoryOf(f.rawFunction);
    byCategory.set(c, (byCategory.get(c) ?? 0) + f.n);
  }
  const functions: ChartBar[] = byValueDesc(
    [...byCategory.entries()].map(([label, value]) => ({
      label,
      spokenLabel: label,
      value,
      group: null,
      count: null,
    })),
  );
  const mayors = byCategory.get('Maires') ?? 0;

  const qualified = sortBars(
    rows.candidates
      .filter((c) => c.n >= REQUIRED_SPONSORSHIPS)
      .map((c) => {
        const { last, full } = splitCandidateName(c.candidateName);
        return {
          label: last,
          spokenLabel: full,
          value: c.n,
          group: null,
          count: null,
        };
      }),
  );

  return {
    shortId,
    ballots: [],
    topic: {
      kind: 'parrainages-2022',
      chamber: `Présidentielle ${ELECTION_YEAR}`,
      dateLabel: formatDateLabel(rows.asOf),
      asOf: rows.asOf,
      title: "Les 500 parrainages de l'élection présidentielle",
      numbers: {
        required: REQUIRED_SPONSORSHIPS,
        minDepartments: MIN_DEPARTMENTS,
        ruleSinceYear: RULE_SINCE_YEAR,
        electionYear: ELECTION_YEAR,
        officialValidated: OFFICIAL_VALIDATED,
        officialReceived: OFFICIAL_RECEIVED,
        officialNamesProposed: OFFICIAL_NAMES_PROPOSED,
        inBase,
        mayors,
        mayorsPercent: inBase > 0 ? Math.round((mayors / inBase) * 100) : 0,
        qualified: qualified.length,
      },
      charts: [
        {
          id: 'by-function',
          title: 'Qui a parrainé en 2022',
          unit: '',
          decimals: 0,
          countUnit: 'parrainages',
          bars: functions,
        },
        {
          id: 'qualified-candidates',
          title: `Candidats ayant atteint ${REQUIRED_SPONSORSHIPS} parrainages`,
          unit: '',
          decimals: 0,
          countUnit: 'parrainages',
          bars: qualified,
        },
      ],
      url: `${SITE_URL}/elus`,
      elupediaLabel:
        'Le parrainage signé par chaque élu, présidentielle par présidentielle, sur sa fiche Elupedia',
      dataSourceLabel: 'Conseil constitutionnel',
      sources: SOURCES,
    },
  };
}

export function sponsorshipsScript(facts: ShortFacts): ShortScript {
  const t = facts.topic;
  if (!t || t.kind !== 'parrainages-2022')
    throw new Error('faits « parrainages-2022 » attendus');
  const n = t.numbers;
  const functions = t.charts[0]!.bars;
  const second = functions[1];
  const third = functions[2];
  const byCount = [...t.charts[1]!.bars].sort((a, b) => a.value - b.value);
  const low = byCount[0]!;
  const high = byCount[byCount.length - 1]!;

  const scenes = withDurations([
    {
      id: 's1',
      kind: 'hook',
      voiceover: `Pour se présenter à l'élection présidentielle, il faut être parrainé par ${n.required} élus. La règle vaut depuis ${n.ruleSinceYear}, et chaque parrainage est public.`,
      onScreenText: t.title,
      visual: 'title',
      chart: null,
      lowerThird: null,
    },
    {
      id: 's2',
      kind: 'context',
      voiceover: `Maires, conseillers départementaux et régionaux, parlementaires : chaque élu habilité ne peut parrainer qu'un seul candidat. Les ${n.required} parrainages doivent venir d'au moins ${n.minDepartments} départements ou collectivités, sans qu'un seul en apporte plus d'un dixième.`,
      onScreenText: `${n.required} parrainages, ${n.minDepartments} départements`,
      visual: 'title',
      chart: null,
      lowerThird: null,
    },
    {
      id: 's3',
      kind: 'result',
      voiceover: `En ${n.electionYear}, le Conseil constitutionnel a validé ${formatInt(n.officialValidated!)} parrainages. Les maires en ont signé ${formatInt(n.mayors!)}, soit ${n.mayorsPercent} % du total. Viennent ensuite les ${second?.spokenLabel.toLocaleLowerCase('fr') ?? ''} et les ${third?.spokenLabel.toLocaleLowerCase('fr') ?? ''}.`,
      onScreenText: t.charts[0]!.title,
      visual: 'chart',
      chart: t.charts[0]!.id,
      lowerThird: null,
    },
    {
      id: 's4',
      kind: 'groups',
      voiceover: `${NUMBER_WORDS[n.qualified!] ?? n.qualified} candidats ont franchi la barre des ${n.required}, sur ${n.officialNamesProposed} noms proposés : de ${formatInt(low.value)} parrainages pour ${low.spokenLabel} à ${formatInt(high.value)} pour ${high.spokenLabel}.`,
      onScreenText: t.charts[1]!.title,
      visual: 'chart',
      chart: t.charts[1]!.id,
      lowerThird: null,
    },
    {
      id: 's5',
      kind: 'outro',
      voiceover:
        'Qui a parrainé qui, élu par élu, est sur Elupedia. Sources en description.',
      onScreenText: t.url,
      visual: 'source',
      chart: null,
      lowerThird: null,
    },
  ]);
  // Majuscule en tête de phrase pour le nombre en lettres.
  scenes[3]!.voiceover =
    scenes[3]!.voiceover.charAt(0).toLocaleUpperCase('fr') +
    scenes[3]!.voiceover.slice(1);

  return {
    title: `Présidentielle ${n.electionYear} : qui a signé les ${n.required} parrainages ?`,
    scenes,
    description: `Pour être candidat à l'élection présidentielle, il faut ${n.required} parrainages d'élus habilités, venus d'au moins ${n.minDepartments} départements ou collectivités, un même département ne pouvant en fournir plus d'un dixième ; chaque élu ne parraine qu'un candidat et la liste est publiée par le Conseil constitutionnel. En ${n.electionYear}, ${formatInt(n.officialValidated!)} parrainages ont été validés sur ${formatInt(n.officialReceived!)} reçus (${formatInt(n.inBase!)} lignes dans la liste publiée telle que reprise par Elupedia), les maires en représentant ${n.mayorsPercent} % ; ${n.qualified} candidats sur ${n.officialNamesProposed} noms proposés ont atteint le seuil.`,
    hashtags: [
      '#Présidentielle',
      '#Parrainages',
      '#ConseilConstitutionnel',
      '#Élus',
    ],
  };
}

export const sponsorshipsTopic: TopicDefinition<SponsorshipsRows> = {
  key: 'parrainages-2022',
  summary:
    'les parrainages de la présidentielle 2022 : règle des 500, qui a parrainé, candidats qualifiés',
  load: loadSponsorships,
  build: buildSponsorshipsFacts,
  script: sponsorshipsScript,
};
