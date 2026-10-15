/**
 * Historique d'appartenance des sénateurs aux groupes politiques.
 *
 * Source : open data du Sénat, fichier ODSEN_HISTOGROUPES.json — une ligne par
 * période d'appartenance (matricule, nom court du groupe, dates de début et de
 * fin). Les dates sont au format « AAAA/MM/JJ HH:MM:SS » et converties en ISO
 * « AAAA-MM-JJ » ; une date absente ou illisible devient null (fin null =
 * appartenance en cours). Le JSON est soit un tableau nu, soit enveloppé dans
 * `{ results: [...] }`, d'où le déballage avant validation zod.
 *
 * Appelé par run-senat.ts, consommé par upsert/senat-affiliations.ts.
 */
import { z } from 'zod/v4';
import { logger } from '../logger.js';

export const HISTOGROUPES_URL =
  'https://data.senat.fr/data/senateurs/ODSEN_HISTOGROUPES.json';

const HistoGroupeSchema = z.object({
  Matricule: z.string(),
  Nom_court_du_groupe_politique: z.string(),
  Date_de_debut_d_appartenance: z.string().nullable(),
  Date_de_fin_d_appartenance: z.string().nullable(),
});

export { HistoGroupeSchema };

export interface SenatAffiliation {
  matricule: string;
  group_name: string;
  start_date: string | null;
  end_date: string | null;
}

/** « AAAA/MM/JJ HH:MM:SS » (format Sénat) → « AAAA-MM-JJ », null si absent ou illisible. */
function parseSenatDate(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return null;
}

/**
 * Télécharge l'historique des groupes (un GET) et le retourne à plat, une
 * affiliation par ligne source. Lève une erreur sur réponse HTTP non 2xx ou
 * JSON inattendu (zod).
 */
export async function fetchSenatGroupes(
  fetchFn: typeof fetch = fetch,
): Promise<SenatAffiliation[]> {
  const response = await fetchFn(HISTOGROUPES_URL);
  if (!response.ok) {
    throw new Error(`Sénat groupes error: ${response.status}`);
  }

  const raw = await response.json();
  const data =
    typeof raw === 'object' && raw !== null && 'results' in raw
      ? (raw as Record<string, unknown>).results
      : raw;
  const records = z.array(HistoGroupeSchema).parse(data);

  const affiliations: SenatAffiliation[] = records.map((record) => ({
    matricule: record.Matricule,
    group_name: record.Nom_court_du_groupe_politique,
    start_date: parseSenatDate(record.Date_de_debut_d_appartenance),
    end_date: parseSenatDate(record.Date_de_fin_d_appartenance),
  }));

  logger.info(`Sénat groupes: ${affiliations.length} affiliations`);
  return affiliations;
}
