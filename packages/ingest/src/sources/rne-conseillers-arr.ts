/**
 * Conseillers d'arrondissement (Paris, Lyon, Marseille) — lecteur du fichier
 * RNE (Répertoire national des élus) publié sur data.gouv.fr.
 *
 * Format brut : CSV `;` sans guillemets, UTF-8, CRLF, première ligne = en-tête,
 * 14 colonnes dans cet ordre :
 *   0 Code du département · 1 Libellé du département · 2 Code de la commune
 *   (code INSEE de la ville entière, ex. 13055) · 3 Libellé de la commune
 *   4 Libellé du secteur (« Marseille Secteur 1 », seule clé de rattachement :
 *   le RNE ne fournit pas de code INSEE d'arrondissement) · 5 Nom · 6 Prénom
 *   7 Code sexe (M/F) · 8 Date de naissance (AAAA-MM-JJ) · 9 Code CSP
 *   10 Libellé CSP · 11 Date de début du mandat · 12 Libellé de la fonction
 *   (facultatif, ex. « Maire d'arrondissement ») · 13 Date de début de la fonction.
 *
 * Mise à jour trimestrielle, pas de pagination. Les lignes incomplètes (champs
 * clés vides) sont ignorées silencieusement. Appelé par run-conseillers-arr.ts,
 * consommé par upsert/conseillers-arr.ts. Voir docs/DOMAINS.md.
 */
import { logger } from '../logger.js';

const RNE_CONSEILLERS_ARR_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/3b6b2281-b9d9-4959-ae9d-c2c166dff118';

/** Nombre de colonnes attendu par ligne ; en deçà, la ligne est rejetée. */
const EXPECTED_COLUMNS = 14;

export interface RneConseillerArr {
  departmentCode: string;
  departmentName: string;
  communeCode: string;
  communeName: string;
  sectorLabel: string;
  lastName: string;
  firstName: string;
  gender: 'M' | 'F';
  birthDate: string;
  mandateStartDate: string;
  functionLabel: string;
  functionStartDate: string;
}

/**
 * Parse une ligne de données (hors en-tête). Retourne undefined si la ligne
 * est trop courte ou si un champ clé (commune, secteur, nom, prénom, naissance)
 * est vide. Tout code sexe autre que « F » est lu comme « M ».
 */
export function parseCsvRow(line: string): RneConseillerArr | undefined {
  const cols = line.split(';');
  if (cols.length < EXPECTED_COLUMNS) return undefined;

  const communeCode = cols[2]?.trim();
  const sectorLabel = cols[4]?.trim();
  const lastName = cols[5]?.trim();
  const firstName = cols[6]?.trim();
  const birthDate = cols[8]?.trim();
  const mandateStart = cols[11]?.trim();
  const functionLabel = cols[12]?.trim() ?? '';
  // Dernière colonne : trim() retire déjà le CR d'une fin de ligne CRLF,
  // le replace est une ceinture supplémentaire.
  const functionStartDate = cols[13]?.trim().replace(/\r?\n$/, '') ?? '';

  if (!communeCode || !sectorLabel || !lastName || !firstName || !birthDate) {
    return undefined;
  }

  return {
    departmentCode: cols[0]?.trim() ?? '',
    departmentName: cols[1]?.trim() ?? '',
    communeCode,
    communeName: cols[3]?.trim() ?? '',
    sectorLabel,
    lastName,
    firstName,
    gender: cols[7]?.trim() === 'F' ? 'F' : 'M',
    birthDate,
    mandateStartDate: mandateStart ?? '',
    functionLabel,
    functionStartDate,
  };
}

/**
 * Télécharge le CSV complet (un GET) et retourne les lignes valides.
 * Lève une erreur sur réponse HTTP non 2xx.
 */
export async function fetchRneConseillersArr(
  fetchFn: typeof fetch = fetch,
): Promise<RneConseillerArr[]> {
  const response = await fetchFn(RNE_CONSEILLERS_ARR_URL);
  if (!response.ok) {
    throw new Error(
      `RNE conseillers d'arrondissement error: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  const lines = text.split('\n');
  const results: RneConseillerArr[] = [];

  // Ligne 0 = en-tête.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const conseiller = parseCsvRow(line);
    if (conseiller) {
      results.push(conseiller);
    }
  }

  logger.info(
    `RNE conseillers d'arrondissement: ${results.length} conseillers parsed`,
  );
  return results;
}
