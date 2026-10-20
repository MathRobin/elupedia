import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { mandates, parliamentaryActivity } from '@elupedia/shared';
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
  formatInt,
  groupBar,
  sortBars,
  withDurations,
  type TopicDefinition,
} from './common.js';

/**
 * Thème « questions-ecrites » : les questions écrites des députés au
 * gouvernement sur la législature en cours. Faits : `parliamentary_activity`
 * (type `written_question`, source Assemblée) × mandats de député en cours ;
 * règles reprises de la fiche de synthèse n°63 de l'Assemblée (délai de deux
 * mois, questions signalées sous dix jours, plafond par session).
 *
 * Pièges : la part de réponses dépend de l'ancienneté des questions (les plus
 * récentes n'ont pas encore eu le temps d'une réponse), la description le
 * dit ; le plafond de 52 questions par session date d'une décision de la
 * Conférence des présidents reconduite depuis 2015, à vérifier si elle
 * change ; les non-inscrits ne forment pas un groupe (hors graphique par
 * groupe, dans les totaux).
 */

/** Délai de réponse prévu par le Règlement de l'Assemblée (mois). */
export const ANSWER_DELAY_MONTHS = 2;
/** Délai de réponse d'une question signalée par un président de groupe (jours). */
export const SIGNALED_DELAY_DAYS = 10;
/** Plafond de questions écrites par député et par session (Conférence des présidents, depuis 2015). */
export const CAP_PER_SESSION = 52;

export const SOURCES = [
  {
    label:
      'Assemblée nationale, fiche de synthèse n°63 « Les questions » (délai de deux mois, questions signalées, plafond par session)',
    url: 'https://www.assemblee-nationale.fr/dyn/synthese/fonctionnement-assemblee-nationale/evaluation-politiques-publiques-controle-gouvernement/les-questions',
  },
  {
    label:
      'Assemblée nationale, questions écrites et orales de la 17e législature (texte de chaque question et réponse)',
    url: 'https://www.assemblee-nationale.fr/dyn/17/questions',
  },
  {
    label:
      'Assemblée nationale, statistiques officielles du taux de réponse du Gouvernement',
    url: 'https://www.assemblee-nationale.fr/dyn/statistiques/17/question/taux-reponse?ministere=GOUVERNEMENT',
  },
];

export interface DeputyQuestions {
  politicalGroup: string | null;
  questions: number;
  answered: number;
}

export interface WrittenQuestionsRows {
  deputies: DeputyQuestions[];
  /** Délai médian de réponse des questions répondues (jours). */
  medianDelayDays: number;
  asOf: string;
}

const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '0', min: 0, max: 0 },
  { label: '1 à 9', min: 1, max: 9 },
  { label: '10 à 49', min: 10, max: 49 },
  { label: '50 à 99', min: 50, max: 99 },
  { label: '100 et plus', min: 100, max: Infinity },
];

export async function loadWrittenQuestions(
  db: NeonHttpDatabase,
): Promise<WrittenQuestionsRows> {
  const isAnQuestion = and(
    eq(parliamentaryActivity.officialId, mandates.officialId),
    eq(parliamentaryActivity.type, 'written_question'),
    eq(parliamentaryActivity.source, 'assemblee_nationale'),
  );
  const deputies = await db
    .select({
      politicalGroup: mandates.politicalGroup,
      questions: sql<number>`count(${parliamentaryActivity.id})::int`,
      answered: sql<number>`count(${parliamentaryActivity.responseDate})::int`,
    })
    .from(mandates)
    .leftJoin(parliamentaryActivity, isAnQuestion)
    .where(and(eq(mandates.type, 'depute'), isNull(mandates.endDate)))
    .groupBy(mandates.officialId, mandates.politicalGroup);
  const [stats] = await db
    .select({
      medianDelayDays: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${parliamentaryActivity.responseDate} - ${parliamentaryActivity.date}), 0)::int`,
      asOf: sql<string>`max(${parliamentaryActivity.date})::text`,
    })
    .from(parliamentaryActivity)
    .where(
      and(
        eq(parliamentaryActivity.type, 'written_question'),
        eq(parliamentaryActivity.source, 'assemblee_nationale'),
      ),
    );
  return {
    deputies,
    medianDelayDays: stats?.medianDelayDays ?? 0,
    asOf: stats?.asOf ?? new Date().toISOString().slice(0, 10),
  };
}

export function buildWrittenQuestionsFacts(
  shortId: string,
  rows: WrittenQuestionsRows,
): ShortFacts {
  const { deputies } = rows;
  const questions = deputies.reduce((n, d) => n + d.questions, 0);
  const answered = deputies.reduce((n, d) => n + d.answered, 0);

  const distribution: ChartBar[] = BUCKETS.map((b) => ({
    label: b.label,
    spokenLabel: b.label,
    value: deputies.filter((d) => d.questions >= b.min && d.questions <= b.max)
      .length,
    group: null,
    count: null,
  }));

  const byGroup = new Map<string, { questions: number; answered: number }>();
  for (const d of deputies) {
    if (!d.politicalGroup || NON_INSCRITS.test(d.politicalGroup)) continue;
    const g = byGroup.get(d.politicalGroup) ?? { questions: 0, answered: 0 };
    g.questions += d.questions;
    g.answered += d.answered;
    byGroup.set(d.politicalGroup, g);
  }
  const groups = sortBars(
    [...byGroup.entries()]
      .filter(([, g]) => g.questions > 0)
      .map(([name, g]) =>
        groupBar(
          name,
          Math.round((g.answered / g.questions) * 100),
          g.questions,
        ),
      ),
  );

  return {
    shortId,
    ballots: [],
    topic: {
      kind: 'questions-ecrites',
      chamber: 'Assemblée nationale',
      dateLabel: formatDateLabel(rows.asOf),
      asOf: rows.asOf,
      title: 'Les questions écrites au gouvernement',
      numbers: {
        deputies: deputies.length,
        questions,
        answered,
        answeredPercent:
          questions > 0 ? Math.round((answered / questions) * 100) : 0,
        delayMonths: ANSWER_DELAY_MONTHS,
        signaledDays: SIGNALED_DELAY_DAYS,
        capPerSession: CAP_PER_SESSION,
        medianDelayDays: rows.medianDelayDays,
        zero: deputies.filter((d) => d.questions === 0).length,
      },
      charts: [
        {
          id: 'questions-per-deputy',
          title: 'Questions écrites par député',
          unit: '',
          decimals: 0,
          countUnit: 'députés',
          bars: distribution,
        },
        {
          id: 'answered-by-group',
          title: 'Part des questions répondues, par groupe',
          unit: ' %',
          decimals: 0,
          countUnit: 'questions',
          bars: groups,
        },
      ],
      url: `${SITE_URL}/elus`,
      elupediaLabel:
        'Les questions écrites de chaque député et leurs réponses, sur sa fiche Elupedia',
      dataSourceLabel: 'Assemblée nationale',
      sources: SOURCES,
    },
  };
}

export function writtenQuestionsScript(facts: ShortFacts): ShortScript {
  const t = facts.topic;
  if (!t || t.kind !== 'questions-ecrites')
    throw new Error('faits « questions-ecrites » attendus');
  const n = t.numbers;
  const [top] = byValueDesc(t.charts[0]!.bars);
  const byShare = [...t.charts[1]!.bars].sort((a, b) => a.value - b.value);
  const low = byShare[0]!;
  const high = byShare[byShare.length - 1]!;

  const scenes = withDurations([
    {
      id: 's1',
      kind: 'hook',
      voiceover:
        'Un député peut interroger le gouvernement par écrit. Chaque question écrite est publiée au Journal officiel, avec la réponse du ministre.',
      onScreenText: t.title,
      visual: 'title',
      chart: null,
      lowerThird: null,
    },
    {
      id: 's2',
      kind: 'context',
      voiceover: `Le règlement de l'Assemblée donne deux mois au gouvernement pour répondre, et plafonne à ${n.capPerSession} questions par député et par session. Une question signalée par un président de groupe doit être traitée sous dix jours.`,
      onScreenText: `${n.delayMonths} mois pour répondre`,
      visual: 'title',
      chart: null,
      lowerThird: null,
    },
    {
      id: 's3',
      kind: 'result',
      voiceover: `Au ${t.dateLabel}, les ${formatInt(n.deputies!)} députés en fonction ont posé ${formatInt(n.questions!)} questions écrites depuis le début de la législature. Le plus souvent entre ${top!.label.replace(' à ', ' et ')} : ${formatInt(top!.value)} députés. ${formatInt(n.zero!)} n'en ont posé aucune.`,
      onScreenText: t.charts[0]!.title,
      visual: 'chart',
      chart: t.charts[0]!.id,
      lowerThird: null,
    },
    {
      id: 's4',
      kind: 'groups',
      voiceover: `${n.answeredPercent} % de ces questions ont reçu une réponse, avec un délai médian de ${n.medianDelayDays} jours. Par groupe, la part de réponses va de ${low.value} % pour ${low.spokenLabel} à ${high.value} % pour ${high.spokenLabel}.`,
      onScreenText: t.charts[1]!.title,
      visual: 'chart',
      chart: t.charts[1]!.id,
      lowerThird: null,
    },
    {
      id: 's5',
      kind: 'outro',
      voiceover:
        'Les questions de chaque député, et leurs réponses, sont sur sa fiche Elupedia. Sources en description.',
      onScreenText: t.url,
      visual: 'source',
      chart: null,
      lowerThird: null,
    },
  ]);

  return {
    title: 'Questions écrites : qui interroge le gouvernement ?',
    scenes,
    description: `Les députés peuvent interroger le gouvernement par questions écrites, publiées au Journal officiel ; le Règlement de l'Assemblée prévoit une réponse sous ${n.delayMonths} mois et un plafond de ${n.capPerSession} questions par député et par session. Au ${t.dateLabel}, les ${formatInt(n.deputies!)} députés en fonction ont posé ${formatInt(n.questions!)} questions depuis le début de la législature, dont ${n.answeredPercent} % ont reçu une réponse (délai médian ${n.medianDelayDays} jours) ; les questions les plus récentes n'ont pas encore eu le temps d'une réponse.`,
    hashtags: [
      '#AssembléeNationale',
      '#Députés',
      '#QuestionsÉcrites',
      '#Gouvernement',
    ],
  };
}

export const writtenQuestionsTopic: TopicDefinition<WrittenQuestionsRows> = {
  key: 'questions-ecrites',
  summary:
    'les questions écrites des députés au gouvernement : règles, questions par député, part de réponses par groupe',
  load: loadWrittenQuestions,
  build: buildWrittenQuestionsFacts,
  script: writtenQuestionsScript,
};
