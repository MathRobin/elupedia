import { z } from 'zod/v4';

const API_BASE = 'https://data.europarl.europa.eu/api/v2';

function jsonLdUrl(path: string): string {
  return `${API_BASE}${path}${path.includes('?') ? '&' : '?'}format=application%2Fld%2Bjson`;
}

const MeetingSchema = z.object({
  activity_id: z.string(),
  activity_date: z.string(),
});

const MeetingListSchema = z.object({ data: z.array(MeetingSchema) });

export interface PlenarySitting {
  id: string;
  date: string;
}

/**
 * Séances plénières pour une année donnée. L'API ne permet pas de filtrer par
 * date de début de législature : le tri par législature se fait en amont, en
 * ne demandant que les années couvertes par la législature en cours.
 */
export async function fetchPlenarySittings(
  fetchFn: typeof fetch = fetch,
  year: number,
): Promise<PlenarySitting[]> {
  const res = await fetchFn(jsonLdUrl(`/meetings?year=${year}`));
  if (!res.ok) {
    throw new Error(
      `Parlement européen /meetings?year=${year} error: ${res.status}`,
    );
  }
  const json = await res.json();
  const parsed = MeetingListSchema.parse(json);
  return parsed.data.map((m) => ({ id: m.activity_id, date: m.activity_date }));
}

const LabelSchema = z.record(z.string(), z.string()).optional();

const DecisionSchema = z.object({
  activity_id: z.string(),
  activity_date: z.string(),
  activity_label: LabelSchema,
  decision_method: z.string().optional(),
  had_voter_for: z.array(z.string()).optional(),
  had_voter_against: z.array(z.string()).optional(),
  had_voter_abstention: z.array(z.string()).optional(),
});

const DecisionListSchema = z.object({ data: z.array(DecisionSchema) });

export type VotePosition = 'for' | 'against' | 'abstain';

export interface RollcallDecision {
  id: string;
  date: string;
  title: string;
  /** person/{id} -> position, uniquement pour les votants du scrutin nominatif (pas d'"absent" : cf. limite documentée dans le ticket M24T4). */
  votersByPersonId: Map<string, VotePosition>;
}

function personIdFromUri(uri: string): string {
  return uri.replace(/^person\//, '');
}

function pickLabel(label: Record<string, string> | undefined): string {
  if (!label) return '(sans titre)';
  return (
    label.fr ??
    label.en ??
    label.mul ??
    Object.values(label)[0] ??
    '(sans titre)'
  );
}

/** Ne garde que les décisions à vote nominatif (VOTE_ELECTRONIC_ROLLCALL) : les autres méthodes de vote (main levée...) ne publient qu'un résultat agrégé, sans position individuelle exploitable (cf. investigation M24T4). */
export async function fetchRollcallDecisions(
  fetchFn: typeof fetch = fetch,
  sittingId: string,
): Promise<RollcallDecision[]> {
  const res = await fetchFn(jsonLdUrl(`/meetings/${sittingId}/decisions`));
  if (res.status === 404) {
    // Une séance sans vote (ex. séance solennelle) n'a pas d'endpoint decisions.
    return [];
  }
  if (!res.ok) {
    throw new Error(
      `Parlement européen /meetings/${sittingId}/decisions error: ${res.status}`,
    );
  }
  const json = await res.json();
  const parsed = DecisionListSchema.parse(json);

  return parsed.data
    .filter(
      (d) =>
        d.decision_method ===
        'def/ep-decision-methods/VOTE_ELECTRONIC_ROLLCALL',
    )
    .map((d) => {
      const votersByPersonId = new Map<string, VotePosition>();
      for (const uri of d.had_voter_for ?? []) {
        votersByPersonId.set(personIdFromUri(uri), 'for');
      }
      for (const uri of d.had_voter_against ?? []) {
        votersByPersonId.set(personIdFromUri(uri), 'against');
      }
      for (const uri of d.had_voter_abstention ?? []) {
        votersByPersonId.set(personIdFromUri(uri), 'abstain');
      }
      return {
        id: d.activity_id,
        date: d.activity_date,
        title: pickLabel(d.activity_label),
        votersByPersonId,
      };
    });
}
