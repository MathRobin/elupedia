import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  ballots,
  votes,
  ballotGroupPositions,
  videoShorts,
  videoShortBallots,
} from '@elupedia/shared';
import { CHAMBER_SIZE_FALLBACK, chamberOf } from './select-candidates.js';

/**
 * Faits d'un scrutin, seule matière autorisée pour le script. Tout ce que le
 * modèle écrit doit pouvoir être retrouvé ici (voir `script-validate.ts`).
 */

export const SITE_URL = 'https://www.elupedia.fr';

const POSITION_LABELS: Record<string, string> = {
  for: 'pour',
  against: 'contre',
  abstain: 'abstention',
  absent: 'absent',
};

export interface GroupFacts {
  name: string;
  memberCount: number | null;
  majorityPosition: string;
  for: number;
  against: number;
  abstain: number;
  absent: number;
}

export interface BallotFacts {
  ballotId: string;
  chamber: 'Assemblée nationale' | 'Sénat';
  date: string;
  dateLabel: string;
  title: string;
  type: string;
  result: 'adopté' | 'rejeté' | null;
  counts: {
    for: number;
    against: number;
    abstain: number;
    /** Non-votants déclarés par la source (ex. président de séance). */
    absent: number;
    /** Pour + contre + abstention. */
    expressed: number;
    /** Effectif de l'assemblée au moment du scrutin (sièges pourvus). */
    seats: number;
    /**
     * Députés/sénateurs n'ayant pas pris part au vote : sièges moins suffrages
     * exprimés. L'AN ne liste pas les absents (seulement les non-votants
     * présents), ils ne se déduisent que par différence avec l'effectif.
     */
    notVoting: number;
  };
  percentOfExpressed: { for: number; against: number; abstain: number };
  /** Part de l'effectif ayant exprimé un vote, en %. */
  participationPercent: number;
  groups: GroupFacts[];
  mostDividedGroup: {
    name: string;
    majorityPosition: string;
    minorityShare: number;
  } | null;
  url: string;
}

export interface ShortFacts {
  shortId: string;
  ballots: BallotFacts[];
}

export function formatDateLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function buildBallotFacts(input: {
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
    position: string;
    votesFor: number;
    votesAgainst: number;
    votesAbstain: number;
    votesAbsent: number;
  }[];
}): BallotFacts {
  const expressed =
    input.counts.for + input.counts.against + input.counts.abstain;
  const pct = (n: number) =>
    expressed > 0 ? Math.round((100 * n) / expressed) : 0;
  const chamber = chamberOf(input.anId);
  const fromGroups = input.groups.reduce(
    (sum, g) => sum + (g.memberCount ?? 0),
    0,
  );
  const recorded = expressed + input.counts.absent;
  const seats = Math.max(
    fromGroups,
    recorded,
    fromGroups === 0 && recorded === 0 ? CHAMBER_SIZE_FALLBACK[chamber] : 0,
  );
  const notVoting = Math.max(0, seats - expressed);

  const groups: GroupFacts[] = input.groups
    .map((g) => ({
      name: g.groupName,
      memberCount: g.memberCount,
      majorityPosition: POSITION_LABELS[g.position] ?? g.position,
      for: g.votesFor,
      against: g.votesAgainst,
      abstain: g.votesAbstain,
      absent: g.votesAbsent,
    }))
    .sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0));

  let mostDividedGroup: BallotFacts['mostDividedGroup'] = null;
  for (const g of groups) {
    const total = g.for + g.against + g.abstain;
    if (total < 10) continue;
    const minorityShare = 1 - Math.max(g.for, g.against, g.abstain) / total;
    if (!mostDividedGroup || minorityShare > mostDividedGroup.minorityShare) {
      mostDividedGroup = {
        name: g.name,
        majorityPosition: g.majorityPosition,
        minorityShare: Math.round(minorityShare * 100) / 100,
      };
    }
  }
  if (mostDividedGroup && mostDividedGroup.minorityShare < 0.1) {
    mostDividedGroup = null;
  }

  return {
    ballotId: input.id,
    chamber: chamber === 'senat' ? 'Sénat' : 'Assemblée nationale',
    date: input.date,
    dateLabel: formatDateLabel(input.date),
    title: input.title,
    type: input.type,
    result:
      input.result === 'adopted'
        ? 'adopté'
        : input.result === 'rejected'
          ? 'rejeté'
          : null,
    counts: { ...input.counts, expressed, seats, notVoting },
    percentOfExpressed: {
      for: pct(input.counts.for),
      against: pct(input.counts.against),
      abstain: pct(input.counts.abstain),
    },
    participationPercent: seats > 0 ? Math.round((100 * expressed) / seats) : 0,
    groups,
    mostDividedGroup,
    url: `${SITE_URL}/scrutins/${input.id}`,
  };
}

export async function loadShortFacts(
  db: NeonHttpDatabase,
  shortId: string,
): Promise<ShortFacts> {
  const [short] = await db
    .select({ id: videoShorts.id })
    .from(videoShorts)
    .where(eq(videoShorts.id, shortId))
    .limit(1);
  if (!short) throw new Error(`video_short ${shortId} introuvable`);

  const links = await db
    .select({
      ballotId: videoShortBallots.ballotId,
      position: videoShortBallots.position,
    })
    .from(videoShortBallots)
    .where(eq(videoShortBallots.videoShortId, shortId))
    .orderBy(videoShortBallots.position);
  if (links.length === 0) {
    throw new Error(`video_short ${shortId} n'est rattaché à aucun scrutin`);
  }
  const ids = links.map((l) => l.ballotId);

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
    .where(inArray(ballots.id, ids));

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
      position: ballotGroupPositions.position,
      votesFor: ballotGroupPositions.votesFor,
      votesAgainst: ballotGroupPositions.votesAgainst,
      votesAbstain: ballotGroupPositions.votesAbstain,
      votesAbsent: ballotGroupPositions.votesAbsent,
    })
    .from(ballotGroupPositions)
    .where(inArray(ballotGroupPositions.ballotId, ids));

  const facts = ids.map((id) => {
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error(`scrutin ${id} introuvable`);
    const counts = { for: 0, against: 0, abstain: 0, absent: 0 };
    for (const c of countRows) {
      if (c.ballotId === id && c.position in counts) {
        counts[c.position as keyof typeof counts] = c.n;
      }
    }
    return buildBallotFacts({
      ...row,
      counts,
      groups: groupRows.filter((g) => g.ballotId === id),
    });
  });

  return { shortId, ballots: facts };
}
