/**
 * Registre de présence des séances plénières du Parlement européen : qui a
 * signé, qui était excusé, pour une séance donnée.
 *
 * Source : API v2 `data.europarl.europa.eu` (JSON-LD), endpoint
 * `/meetings/{id}`, qui publie pour chaque séance :
 * - `had_participant_person` : les signataires du registre de présence
 *   (URIs `person/{id}`), c'est-à-dire exactement l'annexe « Liste de
 *   présence » du procès-verbal ;
 * - `had_excused_person` : les absents excusés ;
 * - `number_of_attendees` : le nombre de signataires annoncé ;
 * - `recorded_in_a_realization_of` : les documents de la séance, dont
 *   l'annexe `PV-10-AAAA-MM-JJ-ATT`, conservée comme URL de provenance.
 * Les réponses sont validées par des schémas Zod locaux.
 *
 * Pourquoi pas le PDF : l'annexe de présence existe aussi en PDF sur
 * `www.europarl.europa.eu/doceo/`, mais ce site répond 202 sans corps aux
 * clients non navigateurs (mur anti-robot) et il faudrait rapprocher des noms
 * imprimés. L'API publie la même liste sous forme d'identifiants de personnes,
 * directement comparables à `officials.europarl_id` : aucun rapprochement de
 * nom, donc aucun homonyme possible. Vérifié sur les 126 séances de la
 * législature 10 : `had_participant_person` est présent partout et sa taille
 * égale `number_of_attendees`.
 *
 * Pièges :
 * - Les listes couvrent TOUS les eurodéputés (~700), pas seulement les
 *   français : le filtrage se fait à l'écriture (upsert/europe-presence.ts).
 * - Une séance future ou sans fiche renvoie 404 : traité comme absent (null).
 * - Une séance peut n'avoir aucun signataire publié (liste absente) : la
 *   séance est alors renvoyée avec une liste vide, et l'upsert ne la marque
 *   pas comme traitée.
 * - Ordre des paramètres : `fetchFn` d'abord, puis l'identifiant.
 *
 * Appelé par run-europe.ts (étape « eurodeputes-presence ») via
 * upsert/europe-presence.ts.
 */
import { z } from 'zod/v4';

const API_BASE = 'https://data.europarl.europa.eu/api/v2';

/**
 * Racine des fichiers publiés par l'API (URL stable, sans authentification),
 * utilisée comme provenance de l'annexe de présence. Format vérifié :
 * `.../distribution/doc/PV-10-2024-10-21-ATT_fr.pdf` répond 200.
 */
const DISTRIBUTION_BASE = 'https://data.europarl.europa.eu/distribution/doc';

/** Suffixe de l'annexe « Liste de présence » dans les documents d'une séance. */
const ATTENDANCE_DOC_SUFFIX = '-ATT';

function jsonLdUrl(path: string): string {
  return `${API_BASE}${path}${path.includes('?') ? '&' : '?'}format=application%2Fld%2Bjson`;
}

const MeetingSchema = z.object({
  activity_id: z.string(),
  activity_date: z.string(),
  had_participant_person: z.array(z.string()).optional(),
  had_excused_person: z.array(z.string()).optional(),
  number_of_attendees: z.number().optional(),
  recorded_in_a_realization_of: z.array(z.string()).optional(),
});

const MeetingResponseSchema = z.object({
  data: z.array(MeetingSchema).min(1),
});

export interface SittingAttendance {
  /** Identifiant de la séance (`MTG-PL-AAAA-MM-JJ`). */
  sittingId: string;
  /** Jour de la séance, `AAAA-MM-JJ`. */
  date: string;
  /** Identifiants EP des signataires du registre, sans préfixe `person/`. */
  signedPersonIds: string[];
  /** Identifiants EP des absents excusés, sans préfixe `person/`. */
  excusedPersonIds: string[];
  /** Nombre de signataires annoncé par la source, null si absent. */
  attendeeCount: number | null;
  /** PDF de l'annexe « Liste de présence » (français), null si absente. */
  attendanceListUrl: string | null;
}

function personIdFromUri(uri: string): string {
  return uri.replace(/^person\//, '');
}

/**
 * URL du PDF de l'annexe de présence, déduite de la liste des documents de la
 * séance (`eli/dl/doc/PV-10-2024-10-21-ATT`). Null si la séance ne publie pas
 * d'annexe de présence : on n'invente pas d'URL à partir de la date.
 */
export function attendanceListUrl(
  documentIds: readonly string[],
): string | null {
  const doc = documentIds.find((id) => id.endsWith(ATTENDANCE_DOC_SUFFIX));
  if (!doc) return null;
  const identifier = doc.replace(/^.*\//, '');
  return `${DISTRIBUTION_BASE}/${identifier}_fr.pdf`;
}

/**
 * Registre de présence d'une séance. Renvoie null sur 404 (séance future ou
 * sans fiche) ; lève sur les autres erreurs HTTP.
 */
export async function fetchSittingAttendance(
  fetchFn: typeof fetch = fetch,
  sittingId: string,
): Promise<SittingAttendance | null> {
  const response = await fetchFn(jsonLdUrl(`/meetings/${sittingId}`));
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Parlement européen /meetings/${sittingId} error: ${response.status}`,
    );
  }
  const json = await response.json();
  const meeting = MeetingResponseSchema.parse(json).data[0]!;

  return {
    sittingId: meeting.activity_id,
    date: meeting.activity_date,
    signedPersonIds: (meeting.had_participant_person ?? []).map(
      personIdFromUri,
    ),
    excusedPersonIds: (meeting.had_excused_person ?? []).map(personIdFromUri),
    attendeeCount: meeting.number_of_attendees ?? null,
    attendanceListUrl: attendanceListUrl(
      meeting.recorded_in_a_realization_of ?? [],
    ),
  };
}
