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

function parseSenatDate(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return null;
}

export async function fetchSenatGroupes(
  fetchFn: typeof fetch = fetch,
): Promise<SenatAffiliation[]> {
  const res = await fetchFn(HISTOGROUPES_URL);
  if (!res.ok) {
    throw new Error(`Sénat groupes error: ${res.status}`);
  }

  const raw = await res.json();
  const records = z.array(HistoGroupeSchema).parse(raw);

  const affiliations: SenatAffiliation[] = records.map((r) => ({
    matricule: r.Matricule,
    group_name: r.Nom_court_du_groupe_politique,
    start_date: parseSenatDate(r.Date_de_debut_d_appartenance),
    end_date: parseSenatDate(r.Date_de_fin_d_appartenance),
  }));

  logger.info(`Sénat groupes: ${affiliations.length} affiliations`);
  return affiliations;
}
