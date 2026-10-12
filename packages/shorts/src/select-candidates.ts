import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { and, gte, inArray, ne, sql } from 'drizzle-orm';
import {
  ballots,
  votes,
  ballotGroupPositions,
  videoShorts,
  videoShortBallots,
} from '@elupedia/shared';
import { logger } from './logger.js';

/**
 * Sélection des scrutins candidats à un short vidéo.
 *
 * Déterministe et traçable : chaque critère produit un sous-score conservé
 * dans `video_shorts.score_details`. Aucun LLM ici — la pertinence doit
 * pouvoir être expliquée et rejouée à l'identique.
 *
 * Critères (voir `scoreBallot`) :
 * - objet du scrutin, lu dans le titre (ensemble d'un texte, motion de
 *   censure, article, amendement…) — le poids dominant
 * - type de scrutin (solennel, motion de censure)
 * - participation (part de l'assemblée ayant exprimé un vote)
 * - écart pour/contre (un vote serré est plus parlant)
 * - division interne des groupes (AN uniquement : le Sénat ne publie pas de
 *   position par groupe)
 *
 * Les scrutins du Parlement européen sont exclus : seule la délégation
 * française est ingérée, le résultat ne peut pas en être déduit.
 */

/** Effectif de référence quand la source ne donne pas la taille de l'assemblée. */
export const CHAMBER_SIZE_FALLBACK: Record<'an' | 'senat', number> = {
  an: 577,
  senat: 348,
};

const CLOSENESS_FULL_WEIGHT_VOTERS = 150;

export interface BallotForScoring {
  id: string;
  anId: string | null;
  title: string;
  date: string;
  type: string;
  result: string | null;
  counts: { for: number; against: number; abstain: number; absent: number };
  groups: {
    groupName: string;
    memberCount: number | null;
    votesFor: number;
    votesAgainst: number;
    votesAbstain: number;
  }[];
}

export interface ScoreDetails {
  subject: { label: string; points: number };
  ballotType: { label: string; points: number };
  participation: { ratio: number; points: number };
  closeness: { margin: number | null; points: number };
  division: { group: string | null; minorityShare: number; points: number };
  total: number;
}

export function chamberOf(anId: string | null): 'an' | 'senat' {
  return anId?.startsWith('senat-') ? 'senat' : 'an';
}

interface SubjectRule {
  label: string;
  pattern: RegExp;
  points: number;
}

/** Première règle qui matche gagne : du plus spécifique au plus général. */
const SUBJECT_RULES: SubjectRule[] = [
  { label: 'motion de censure', pattern: /motion de censure/i, points: 50 },
  {
    label: 'confiance / déclaration du Gouvernement',
    // « article 49 » seul serait ambigu : les textes examinés ont aussi un
    // article 49. On vise l'alinéa 3 ou l'engagement de responsabilité.
    pattern:
      /déclaration du gouvernement|question de confiance|49[\s.,-]*(alinéa\s*)?3\b|engag\w* (de )?(la |sa )?responsabilité/i,
    points: 45,
  },
  {
    label: 'ensemble du texte',
    pattern:
      /l'ensemble (du|de la|de l')\s*(projet|proposition|texte)|ensemble du texte/i,
    points: 40,
  },
  {
    label: 'proposition de résolution',
    pattern: /proposition de résolution/i,
    points: 35,
  },
  {
    label: 'motion de rejet / renvoi',
    pattern: /motion de (rejet|renvoi)/i,
    points: 30,
  },
  { label: 'sous-amendement', pattern: /sous-amendement/i, points: -5 },
  { label: 'amendement', pattern: /amendement/i, points: 0 },
  { label: 'article', pattern: /\bl'article\b|\barticle \d/i, points: 10 },
];

export function scoreSubject(title: string): ScoreDetails['subject'] {
  for (const rule of SUBJECT_RULES) {
    if (rule.pattern.test(title)) {
      return { label: rule.label, points: rule.points };
    }
  }
  return { label: 'autre', points: 15 };
}

export function scoreBallotType(type: string): ScoreDetails['ballotType'] {
  const t = type.toLowerCase();
  if (t.includes('motion de censure')) return { label: type, points: 15 };
  if (t.includes('solennel')) return { label: type, points: 15 };
  return { label: type, points: 0 };
}

export function scoreBallot(ballot: BallotForScoring): ScoreDetails {
  const subject = scoreSubject(ballot.title);
  const ballotType = scoreBallotType(ballot.type);

  const expressed =
    ballot.counts.for + ballot.counts.against + ballot.counts.abstain;
  const fromGroups = ballot.groups.reduce(
    (s, g) => s + (g.memberCount ?? 0),
    0,
  );
  const recorded = expressed + ballot.counts.absent;
  const chamberSize = Math.max(
    fromGroups,
    recorded,
    fromGroups === 0 && recorded === 0
      ? CHAMBER_SIZE_FALLBACK[chamberOf(ballot.anId)]
      : 0,
  );
  const ratio = chamberSize > 0 ? expressed / chamberSize : 0;
  const participation = {
    ratio: round(ratio),
    points: Math.round(20 * Math.min(ratio, 1)),
  };

  const decided = ballot.counts.for + ballot.counts.against;
  const margin =
    decided > 0
      ? Math.abs(ballot.counts.for - ballot.counts.against) / decided
      : null;
  // Un vote serré n'est parlant que s'il y a eu des votants : un 25-25 sur un
  // amendement en séance clairsemée ne vaut pas un 280-260. Saturation à
  // CLOSENESS_FULL_WEIGHT_VOTERS votants exprimés.
  const weight = Math.min(1, expressed / CLOSENESS_FULL_WEIGHT_VOTERS);
  const closeness = {
    margin: margin === null ? null : round(margin),
    points: margin === null ? 0 : Math.round(20 * (1 - margin) * weight),
  };

  let division: ScoreDetails['division'] = {
    group: null,
    minorityShare: 0,
    points: 0,
  };
  for (const g of ballot.groups) {
    const total = g.votesFor + g.votesAgainst + g.votesAbstain;
    // Les petits groupes (non-inscrits, etc.) divergent par nature : ignorés.
    if (total < 10) continue;
    const majority = Math.max(g.votesFor, g.votesAgainst, g.votesAbstain);
    const minorityShare = 1 - majority / total;
    if (minorityShare > division.minorityShare) {
      division = {
        group: g.groupName,
        minorityShare: round(minorityShare),
        // 50 % de dissidents (division maximale) = 15 points.
        points: Math.round(15 * Math.min(minorityShare / 0.5, 1)),
      };
    }
  }

  const total =
    subject.points +
    ballotType.points +
    participation.points +
    closeness.points +
    division.points;

  return { subject, ballotType, participation, closeness, division, total };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export interface SelectionOptions {
  /** Fenêtre glissante, en jours, sur `ballots.date`. */
  days: number;
  /** Nombre maximal de candidats créés par exécution. */
  maxShorts: number;
  /** Score minimal pour devenir candidat. */
  minScore: number;
  dryRun: boolean;
  now?: Date;
}

export interface RankedBallot {
  ballot: BallotForScoring;
  details: ScoreDetails;
  alreadyUsed: boolean;
}

export async function loadRecentBallots(
  db: NeonHttpDatabase,
  since: string,
): Promise<BallotForScoring[]> {
  const rows = await db
    .select({
      id: ballots.id,
      anId: ballots.anId,
      title: ballots.title,
      date: ballots.date,
      type: ballots.type,
      result: ballots.result,
    })
    .from(ballots)
    .where(and(gte(ballots.date, since), ne(ballots.type, 'europarl')));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  const countRows = await db
    .select({
      ballotId: votes.ballotId,
      position: votes.position,
      n: sql<number>`count(*)::int`,
    })
    .from(votes)
    .where(inArray(votes.ballotId, ids))
    .groupBy(votes.ballotId, votes.position);

  const groupRows = await db
    .select({
      ballotId: ballotGroupPositions.ballotId,
      groupName: ballotGroupPositions.groupName,
      memberCount: ballotGroupPositions.memberCount,
      votesFor: ballotGroupPositions.votesFor,
      votesAgainst: ballotGroupPositions.votesAgainst,
      votesAbstain: ballotGroupPositions.votesAbstain,
    })
    .from(ballotGroupPositions)
    .where(inArray(ballotGroupPositions.ballotId, ids));

  const byId = new Map<string, BallotForScoring>(
    rows.map((r) => [
      r.id,
      {
        ...r,
        counts: { for: 0, against: 0, abstain: 0, absent: 0 },
        groups: [],
      },
    ]),
  );
  for (const c of countRows) {
    const b = byId.get(c.ballotId);
    if (b && c.position in b.counts) {
      b.counts[c.position as keyof typeof b.counts] = c.n;
    }
  }
  for (const g of groupRows) {
    byId.get(g.ballotId)?.groups.push(g);
  }
  return [...byId.values()];
}

export function rankBallots(
  candidates: BallotForScoring[],
  usedBallotIds: Set<string>,
): RankedBallot[] {
  return candidates
    .map((ballot) => ({
      ballot,
      details: scoreBallot(ballot),
      alreadyUsed: usedBallotIds.has(ballot.id),
    }))
    .sort(
      (a, b) =>
        b.details.total - a.details.total ||
        b.ballot.date.localeCompare(a.ballot.date),
    );
}

export async function selectShortCandidates(
  db: NeonHttpDatabase,
  options: SelectionOptions,
): Promise<{ ranked: RankedBallot[]; created: string[] }> {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - options.days * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const recent = await loadRecentBallots(db, since);
  logger.info(
    `${recent.length} scrutins AN/Sénat depuis le ${since} (${options.days} j)`,
  );

  const used = new Set<string>();
  if (recent.length > 0) {
    const usedRows = await db
      .select({ ballotId: videoShortBallots.ballotId })
      .from(videoShortBallots)
      .where(
        inArray(
          videoShortBallots.ballotId,
          recent.map((b) => b.id),
        ),
      );
    for (const r of usedRows) used.add(r.ballotId);
  }

  const ranked = rankBallots(recent, used);
  const chosen = ranked
    .filter((r) => !r.alreadyUsed && r.details.total >= options.minScore)
    .slice(0, options.maxShorts);

  const created: string[] = [];
  for (const r of chosen) {
    if (options.dryRun) {
      logger.info(
        `[dry-run] candidat : ${r.ballot.title} (${r.details.total})`,
      );
      continue;
    }
    const [short] = await db
      .insert(videoShorts)
      .values({
        status: 'candidate',
        score: r.details.total,
        scoreDetails: r.details,
      })
      .returning({ id: videoShorts.id });
    await db.insert(videoShortBallots).values({
      videoShortId: short!.id,
      ballotId: r.ballot.id,
      position: 0,
    });
    created.push(short!.id);
    logger.info(
      `candidat ${short!.id} : ${r.ballot.title} (score ${r.details.total})`,
    );
  }

  return { ranked, created };
}

export function formatRanking(ranked: RankedBallot[], limit = 15): string {
  const lines = ranked.slice(0, limit).map((r, i) => {
    const d = r.details;
    const flag = r.alreadyUsed ? ' [déjà utilisé]' : '';
    const title =
      r.ballot.title.length > 90
        ? `${r.ballot.title.slice(0, 87)}…`
        : r.ballot.title;
    return [
      `${String(i + 1).padStart(2)}. ${d.total.toString().padStart(3)}  ${r.ballot.date}  ${chamberOf(r.ballot.anId).toUpperCase().padEnd(5)} ${title}${flag}`,
      `      objet ${d.subject.points} (${d.subject.label}) · type ${d.ballotType.points} · participation ${d.participation.points} (${Math.round(d.participation.ratio * 100)} %) · écart ${d.closeness.points}${d.closeness.margin === null ? '' : ` (marge ${Math.round(d.closeness.margin * 100)} %)`} · division ${d.division.points}${d.division.group ? ` (${d.division.group}, ${Math.round(d.division.minorityShare * 100)} %)` : ''} · résultat ${r.ballot.result ?? '?'}`,
    ].join('\n');
  });
  return lines.join('\n');
}
