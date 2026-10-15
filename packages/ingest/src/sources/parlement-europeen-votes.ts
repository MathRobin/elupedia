/**
 * Votes nominatifs en séance plénière du Parlement européen.
 *
 * Source : API v2 `data.europarl.europa.eu` (JSON-LD) :
 * - `/meetings?year=AAAA` : les séances plénières d'une année ;
 * - `/meetings/{id}/decisions` : les décisions (votes) d'une séance, avec
 *   pour chaque vote nominatif les listes `had_voter_for / _against /
 *   _abstention` (URIs `person/{id}`).
 * Les réponses sont validées par des schémas Zod locaux.
 *
 * Extrait : les séances (`PlenarySitting`) puis, par séance, les décisions à
 * vote nominatif (`RollcallDecision`) avec la position de chaque votant.
 *
 * Pièges :
 * - Seuls les votes électroniques nominatifs ont des positions
 *   individuelles ; les autres méthodes sont filtrées.
 * - Une séance sans vote renvoie 404 sur /decisions : traité comme vide.
 * - Les absents ne figurent nulle part (pas de position « absent »).
 * - Ordre des paramètres : `fetchFn` d'abord, puis l'identifiant.
 *
 * Appelé par run-europe.ts via upsert/europe-votes.ts.
 */
import { z } from 'zod/v4';

const API_BASE = 'https://data.europarl.europa.eu/api/v2';

/** Seule méthode de vote publiant les positions individuelles. */
const ROLLCALL_METHOD = 'def/ep-decision-methods/VOTE_ELECTRONIC_ROLLCALL';
const UNTITLED_LABEL = '(sans titre)';

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
 * Lève sur erreur HTTP.
 */
export async function fetchPlenarySittings(
  fetchFn: typeof fetch = fetch,
  year: number,
): Promise<PlenarySitting[]> {
  const response = await fetchFn(jsonLdUrl(`/meetings?year=${year}`));
  if (!response.ok) {
    throw new Error(
      `Parlement européen /meetings?year=${year} error: ${response.status}`,
    );
  }
  const json = await response.json();
  const parsed = MeetingListSchema.parse(json);
  return parsed.data.map((meeting) => ({
    id: meeting.activity_id,
    date: meeting.activity_date,
  }));
}

/** Libellé par code langue (fr, en, mul…). */
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

/** Libellé français, sinon anglais, sinon multilingue, sinon le premier. */
function pickLabel(label: Record<string, string> | undefined): string {
  if (!label) return UNTITLED_LABEL;
  return (
    label.fr ??
    label.en ??
    label.mul ??
    Object.values(label)[0] ??
    UNTITLED_LABEL
  );
}

/**
 * Ne garde que les décisions à vote nominatif (VOTE_ELECTRONIC_ROLLCALL) :
 * les autres méthodes de vote (main levée...) ne publient qu'un résultat
 * agrégé, sans position individuelle exploitable (cf. investigation M24T4).
 * Renvoie [] sur 404 (séance sans vote), lève sur les autres erreurs HTTP.
 */
export async function fetchRollcallDecisions(
  fetchFn: typeof fetch = fetch,
  sittingId: string,
): Promise<RollcallDecision[]> {
  const response = await fetchFn(jsonLdUrl(`/meetings/${sittingId}/decisions`));
  if (response.status === 404) {
    // Une séance sans vote (ex. séance solennelle) n'a pas d'endpoint decisions.
    return [];
  }
  if (!response.ok) {
    throw new Error(
      `Parlement européen /meetings/${sittingId}/decisions error: ${response.status}`,
    );
  }
  const json = await response.json();
  const parsed = DecisionListSchema.parse(json);

  return parsed.data
    .filter((decision) => decision.decision_method === ROLLCALL_METHOD)
    .map((decision) => {
      const votersByPersonId = new Map<string, VotePosition>();
      for (const uri of decision.had_voter_for ?? []) {
        votersByPersonId.set(personIdFromUri(uri), 'for');
      }
      for (const uri of decision.had_voter_against ?? []) {
        votersByPersonId.set(personIdFromUri(uri), 'against');
      }
      for (const uri of decision.had_voter_abstention ?? []) {
        votersByPersonId.set(personIdFromUri(uri), 'abstain');
      }
      return {
        id: decision.activity_id,
        date: decision.activity_date,
        title: pickLabel(decision.activity_label),
        votersByPersonId,
      };
    });
}
