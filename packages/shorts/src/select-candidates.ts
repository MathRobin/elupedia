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
 * - critères spécifiques et rares (voir `scoreBonuses`) : écart en voix,
 *   Gouvernement mis en minorité sur son propre amendement, unanimité,
 *   ensemble d'un texte budgétaire. Ils se cumulent, n'apparaissent dans
 *   `score_details.bonuses` que lorsqu'ils s'appliquent, et rattrapent ce que
 *   les cinq critères généraux manquent : un vote à deux voix près en séance
 *   clairsemée, que le ratio d'écart sature à quelques points, et un vote
 *   unanime, que ce même ratio met à zéro alors qu'il se raconte.
 *
 * Les scrutins du Parlement européen sont exclus : seule la délégation
 * française est ingérée, le résultat ne peut pas en être déduit.
 *
 * Seuil dégressif : le DAG `ingest-votes` attend un short par jour, mais une
 * semaine sans vote marquant ne produit que des amendements et des articles,
 * tous sous le seuil nominal (constaté : meilleur scrutin à 19 points pour un
 * seuil à 50, donc aucun candidat). Quand rien n'atteint `minScore`, le seuil
 * redescend donc par paliers de SCORE_LADDER_STEP jusqu'à `minScoreFloor`, et
 * le premier palier qui donne un scrutin l'emporte — un seul, le meilleur :
 * un jour creux ne doit pas remplir la file de scrutins anecdotiques. Le
 * palier retenu est consigné dans `score_details.selection`, pour qu'un short
 * faible se reconnaisse à la relecture. Égaliser `minScoreFloor` et
 * `minScore` rétablit l'ancien comportement, tout ou rien.
 *
 * Un palier dégradé exige en plus un scrutin encore d'actualité, mais la
 * limite dépend du score : DEGRADED_AGE_LADDER (voir `maxAgeHours`). Un
 * amendement à 20 points ne se raconte que deux jours, un scrutin à 48 points
 * tient cinq jours. L'ancienne limite unique de 36 h, pensée quand un repli
 * « thème » prenait la journée à défaut, laissait des semaines entières sans
 * vidéo dès que l'Assemblée ne votait plus pendant deux jours : constaté le
 * 23 et le 24/11/2026, où un article de loi à 48 points attendait, libre et
 * inutilisé (anomalie corrigée le 24/11/2026). Le seuil nominal n'est
 * toujours pas concerné : un vote marquant reste racontable sur toute la
 * fenêtre `days`.
 */

/** Effectif de référence quand la source ne donne pas la taille de l'assemblée. */
export const CHAMBER_SIZE_FALLBACK: Record<'an' | 'senat', number> = {
  an: 577,
  senat: 348,
};

const CLOSENESS_FULL_WEIGHT_VOTERS = 150;

/** Écart en voix d'un scrutin « à quelques voix près » (voir `scoreBonuses`). */
export const TIGHT_MARGIN_VOTES = 5;
/** Écart en voix d'un scrutin joué à presque rien. */
export const VERY_TIGHT_MARGIN_VOTES = 2;
/**
 * Voix « pour » minimales pour qu'une unanimité compte : sous ce seuil, un vote
 * sans opposition n'est qu'une séance clairsemée, pas un accord de l'assemblée.
 */
export const UNANIMITY_MIN_VOTES = 50;

/**
 * Vote sur l'ensemble d'un texte. Sert deux fois : au critère d'objet et au
 * critère budgétaire, qui doivent rester d'accord sur ce qu'est un vote
 * d'ensemble.
 */
const ENSEMBLE_PATTERN =
  /l'ensemble (du|de la|de l')\s*(projet|proposition|texte)|ensemble du texte/i;

/** Textes financiers : loi de finances, loi de financement de la sécurité sociale. */
const BUDGET_PATTERN = /loi de finances|financement de la sécurité sociale/i;

/**
 * Amendement déposé ou repris par le Gouvernement. Un titre peut citer
 * plusieurs amendements identiques : le Gouvernement cosignataire d'un
 * amendement rejeté compte aussi comme mis en minorité.
 */
const GOVERNMENT_AMENDMENT = /amendements?\b[\s\S]*\bdu Gouvernement\b/i;

/** Pas de la descente du seuil quand aucun scrutin n'atteint `minScore`. */
export const SCORE_LADDER_STEP = 10;

/** Âge maximal, en heures, d'un scrutin retenu par un palier dégradé. */
export const MAX_DEGRADED_AGE_HOURS = 36;

/**
 * Âge maximal accepté hors du seuil nominal, selon le score du scrutin : plus
 * il est noté, plus il reste racontable longtemps. Lu du plus exigeant au plus
 * permissif, le premier palier dont `minTotal` est atteint gagne.
 */
export const DEGRADED_AGE_LADDER: { minTotal: number; hours: number }[] = [
  { minTotal: 40, hours: 120 },
  { minTotal: 30, hours: 72 },
  { minTotal: 0, hours: MAX_DEGRADED_AGE_HOURS },
];

/** Âge maximal, en heures, pour un scrutin de ce score hors seuil nominal. */
export function maxAgeHours(total: number): number {
  return (
    DEGRADED_AGE_LADDER.find((p) => total >= p.minTotal)?.hours ??
    MAX_DEGRADED_AGE_HOURS
  );
}

/**
 * Date la plus ancienne qu'un palier dégradé accepte, au format
 * `YYYY-MM-DD` (comme `ballots.date`).
 *
 * Piège : `ballots.date` est une date sans heure, les sources ne publiant pas
 * l'horaire du scrutin. L'âge est donc compté depuis la fin de la journée du
 * scrutin — l'instant le plus tardif où il a pu avoir lieu —, ce qui revient
 * à comparer les dates. Un scrutin de la veille reste donc admis jusqu'à midi
 * le lendemain avec 36 heures, et l'avant-veille jusqu'à minuit passé.
 */
export function freshnessFloorDate(
  now: Date,
  hours = MAX_DEGRADED_AGE_HOURS,
): string {
  return new Date(now.getTime() - hours * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Seuils à essayer, du plus exigeant au plus permissif : `minScore`, puis les
 * multiples de SCORE_LADDER_STEP strictement en dessous, puis le plancher.
 * Un plancher supérieur ou égal au seuil demandé ne donne qu'un palier.
 */
export function thresholdLadder(minScore: number, floor: number): number[] {
  const ladder = [minScore];
  if (floor >= minScore) return ladder;
  let next = Math.floor((minScore - 1) / SCORE_LADDER_STEP) * SCORE_LADDER_STEP;
  for (; next > floor; next -= SCORE_LADDER_STEP) ladder.push(next);
  ladder.push(floor);
  return ladder;
}

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

/**
 * Critère spécifique déclenché par un scrutin. Rare par construction : la
 * liste est vide pour la grande majorité des scrutins, et un ancien
 * `score_details` n'a pas le champ du tout (lecture tolérante attendue).
 */
export interface ScoreBonus {
  label: string;
  points: number;
}

export interface ScoreDetails {
  subject: { label: string; points: number };
  ballotType: { label: string; points: number };
  participation: { ratio: number; points: number };
  closeness: { margin: number | null; points: number };
  division: { group: string | null; minorityShare: number; points: number };
  bonuses: ScoreBonus[];
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
  { label: 'ensemble du texte', pattern: ENSEMBLE_PATTERN, points: 40 },
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

/**
 * Critères spécifiques, cumulables, qui ne s'appliquent presque jamais (sur les
 * 1 079 scrutins AN/Sénat de septembre à novembre 2026 : 115 scrutins à cinq
 * voix près dont 56 à deux, 44 unanimités, 8 amendements du Gouvernement
 * rejetés, 2 votes sur l'ensemble d'un texte budgétaire).
 *
 * Ils existent parce que les critères généraux manquent deux situations :
 * l'écart en ratio sature un vote serré joué à deux voix dans un hémicycle
 * clairsemé (25 contre 23 ne vaut que quelques points), et il met à zéro un
 * vote unanime, qui est pourtant un fait en soi.
 */
export function scoreBonuses(ballot: BallotForScoring): ScoreBonus[] {
  const bonuses: ScoreBonus[] = [];
  const decided = ballot.counts.for + ballot.counts.against;
  const gap = Math.abs(ballot.counts.for - ballot.counts.against);
  if (decided > 0 && gap <= TIGHT_MARGIN_VOTES) {
    bonuses.push({
      label: gap === 0 ? 'égalité des voix' : `écart de ${gap} voix`,
      points: gap <= VERY_TIGHT_MARGIN_VOTES ? 15 : 10,
    });
  }
  // Le Gouvernement battu sur son propre amendement : un fait notable que le
  // critère d'objet note 0, « amendement » étant la matière ordinaire.
  if (ballot.result === 'rejected' && GOVERNMENT_AMENDMENT.test(ballot.title)) {
    bonuses.push({
      label: 'amendement du Gouvernement rejeté',
      points: 20,
    });
  }
  if (ballot.counts.against === 0 && ballot.counts.for >= UNANIMITY_MIN_VOTES) {
    bonuses.push({
      label: `unanimité (${ballot.counts.for} voix pour, aucune contre)`,
      points: 10,
    });
  }
  if (
    ENSEMBLE_PATTERN.test(ballot.title) &&
    BUDGET_PATTERN.test(ballot.title)
  ) {
    bonuses.push({ label: "ensemble d'un texte budgétaire", points: 15 });
  }
  return bonuses;
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

  const bonuses = scoreBonuses(ballot);
  const total =
    subject.points +
    ballotType.points +
    participation.points +
    closeness.points +
    division.points +
    bonuses.reduce((sum, b) => sum + b.points, 0);

  return {
    subject,
    ballotType,
    participation,
    closeness,
    division,
    bonuses,
    total,
  };
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
  /**
   * Plancher sous lequel le seuil ne descend pas quand rien n'atteint
   * `minScore`. Égal à `minScore` : pas de descente.
   */
  minScoreFloor: number;
  dryRun: boolean;
  now?: Date;
}

/** Comment le seuil a été atteint, consigné dans `score_details.selection`. */
export interface SelectionTrace {
  /** Seuil demandé (`--min-score`). */
  requested: number;
  /** Seuil qui a effectivement retenu ce scrutin. */
  applied: number;
  /** true quand le scrutin n'aurait pas passé le seuil demandé. */
  degraded: boolean;
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

/**
 * Scrutins retenus et seuil qui les a retenus. Au seuil demandé, jusqu'à
 * `maxShorts` ; en dessous, un seul (le mieux noté), parce qu'un jour creux
 * n'a pas à remplir la file de scrutins secondaires, et seulement s'il tient
 * dans la limite d'âge de son score (`maxAgeHours`).
 */
export function chooseCandidates(
  ranked: RankedBallot[],
  options: Pick<
    SelectionOptions,
    'minScore' | 'minScoreFloor' | 'maxShorts' | 'now'
  >,
): { chosen: RankedBallot[]; applied: number } {
  const available = ranked.filter((r) => !r.alreadyUsed);
  const now = options.now ?? new Date();
  const ladder = thresholdLadder(options.minScore, options.minScoreFloor);
  for (const [index, threshold] of ladder.entries()) {
    // Palier dégradé : le scrutin doit encore être d'actualité, et la limite
    // se desserre avec son score (DEGRADED_AGE_LADDER).
    const pool =
      index === 0
        ? available
        : available.filter(
            (r) =>
              r.ballot.date >=
              freshnessFloorDate(now, maxAgeHours(r.details.total)),
          );
    const eligible = pool.filter((r) => r.details.total >= threshold);
    if (eligible.length === 0) continue;
    return {
      chosen: eligible.slice(0, index === 0 ? options.maxShorts : 1),
      applied: threshold,
    };
  }
  return { chosen: [], applied: options.minScore };
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
  const { chosen, applied } = chooseCandidates(ranked, { ...options, now });
  if (applied < options.minScore) {
    logger.warn(
      `aucun scrutin à ${options.minScore} points : seuil ramené à ${applied}, 1 short retenu`,
    );
  } else if (
    chosen.length === 0 &&
    options.minScoreFloor < options.minScore &&
    ranked.some((r) => !r.alreadyUsed)
  ) {
    logger.warn(
      `aucun scrutin à ${options.minScore} points, et aucun assez récent pour son score sous le seuil (${DEGRADED_AGE_LADDER.map(
        (p) => `${p.hours} h à partir de ${p.minTotal}`,
      ).join(', ')}) : rien retenu`,
    );
  }
  const trace: SelectionTrace = {
    requested: options.minScore,
    applied,
    degraded: applied < options.minScore,
  };

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
        scoreDetails: { ...r.details, selection: trace },
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
      `      objet ${d.subject.points} (${d.subject.label}) · type ${d.ballotType.points} · participation ${d.participation.points} (${Math.round(d.participation.ratio * 100)} %) · écart ${d.closeness.points}${d.closeness.margin === null ? '' : ` (marge ${Math.round(d.closeness.margin * 100)} %)`} · division ${d.division.points}${d.division.group ? ` (${d.division.group}, ${Math.round(d.division.minorityShare * 100)} %)` : ''}${(d.bonuses ?? []).map((b) => ` · +${b.points} ${b.label}`).join('')} · résultat ${r.ballot.result ?? '?'}`,
    ].join('\n');
  });
  return lines.join('\n');
}
