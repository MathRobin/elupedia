/**
 * Appartenances des sénateurs aux commissions, délégations, offices et
 * autres organes internes.
 *
 * Sources : open data du Sénat, deux fichiers JSON `{ results: [...] }` de
 * même structure mais dont la colonne « nom » diffère :
 *   - ODSEN_COMS.json   → commissions (permanentes, spéciales, d'enquête…),
 *     nom dans `Nom_commission` ;
 *   - ODSEN_OFFDEL.json → offices, délégations, missions d'information…,
 *     nom dans `Nom_organisme`.
 * Chaque ligne = une période d'appartenance (Matricule, Type_commission,
 * Debut/Fin_d_appartenance au format « AAAA/MM/JJ HH:MM:SS »). Les deux
 * fichiers sont chargés en parallèle et fusionnés par matricule ; une ligne
 * sans date de début est ignorée (donnée inexploitable).
 *
 * Le `Type_commission` du Sénat est projeté sur le vocabulaire commun AN/Sénat
 * (CommitteeItem.type) via TYPE_MAP ; tout type inconnu tombe en « delegation ».
 *
 * Appelé par run-senat.ts, consommé par upsert/senat-committees.ts.
 */
import { logger } from '../logger.js';
import type { CommitteeItem } from '../schemas.js';

export const COMMISSIONS_URL =
  'https://data.senat.fr/data/senateurs/ODSEN_COMS.json';
export const OFFDEL_URL =
  'https://data.senat.fr/data/senateurs/ODSEN_OFFDEL.json';

export interface SenateurCommittees {
  matricule: string;
  committees: CommitteeItem[];
}

/** Ligne brute commune aux deux fichiers ; seul l'un des deux champs « nom » est présent selon la source. */
interface RawRow {
  Matricule: string;
  Nom_commission?: string;
  Nom_organisme?: string;
  Type_commission: string;
  Debut_d_appartenance: string;
  Fin_d_appartenance: string;
  Fonction: string;
}

/** Libellé `Type_commission` du Sénat → type CommitteeItem. Les types non listés deviennent « delegation ». */
const TYPE_MAP: Record<string, CommitteeItem['type']> = {
  'Commission permanente': 'standing_committee',
  'Commission spéciale': 'special_committee',
  Délégation: 'delegation',
  'Groupe de travail': 'study_group',
  "Groupe d'amitié": 'friendship_group',
  'Office parlementaire': 'delegation',
  'Comité de suivi': 'delegation',
  'Comité de contrôle': 'delegation',
  "Commission d'enquête": 'special_committee',
  "Mission d'information": 'special_committee',
};

/** « AAAA/MM/JJ HH:MM:SS » (format Sénat) → « AAAA-MM-JJ », undefined si vide ou illisible. */
function parseSenatDate(raw: string): string | undefined {
  if (!raw || raw.trim() === '') return undefined;
  const match = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return undefined;
}

function mapType(raw: string): CommitteeItem['type'] {
  return TYPE_MAP[raw] ?? 'delegation';
}

/**
 * Télécharge les deux fichiers (deux GET en parallèle) et retourne les
 * appartenances regroupées par matricule. Lève une erreur si l'un des deux
 * fichiers ne répond pas en 2xx.
 */
export async function fetchSenatCommissions(
  fetchFn: typeof fetch = fetch,
): Promise<SenateurCommittees[]> {
  const byMatricule = new Map<string, CommitteeItem[]>();

  await Promise.all([
    loadSource(COMMISSIONS_URL, 'Nom_commission', fetchFn, byMatricule),
    loadSource(OFFDEL_URL, 'Nom_organisme', fetchFn, byMatricule),
  ]);

  const result: SenateurCommittees[] = [];
  for (const [matricule, committees] of byMatricule) {
    result.push({ matricule, committees });
  }

  logger.info(
    `Sénat commissions: ${result.length} sénateurs, ${[...byMatricule.values()].reduce((total, list) => total + list.length, 0)} appartenances`,
  );
  return result;
}

/**
 * Charge un des deux fichiers et ajoute ses lignes dans `byMatricule`
 * (mutation de la map partagée). `nameField` indique la colonne portant le
 * nom de l'organe dans ce fichier.
 */
async function loadSource(
  url: string,
  nameField: string,
  fetchFn: typeof fetch,
  byMatricule: Map<string, CommitteeItem[]>,
): Promise<void> {
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(
      `Sénat commissions API error (${url}): ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as { results: RawRow[] };
  const rows = data.results;
  logger.info(`  ${url.split('/').pop()}: ${rows.length} rows`);

  for (const row of rows) {
    const name =
      (row as unknown as Record<string, string>)[nameField] ??
      row.Nom_commission ??
      '';
    if (!name) continue;

    const startDate = parseSenatDate(row.Debut_d_appartenance);
    if (!startDate) continue;

    const endDate = parseSenatDate(row.Fin_d_appartenance);

    const item: CommitteeItem = {
      name,
      type: mapType(row.Type_commission),
      start_date: startDate,
      end_date: endDate,
    };

    let list = byMatricule.get(row.Matricule);
    if (!list) {
      list = [];
      byMatricule.set(row.Matricule, list);
    }
    list.push(item);
  }
}
