/**
 * Conseillers départementaux — lecteur du fichier RNE (Répertoire national
 * des élus) publié sur data.gouv.fr.
 *
 * Format brut : CSV `;` sans guillemets, UTF-8, CRLF, première ligne = en-tête,
 * 13 colonnes dans cet ordre :
 *   0 Code du département · 1 Libellé du département · 2 Code du canton
 *   (ex. 0101) · 3 Libellé du canton · 4 Nom · 5 Prénom · 6 Code sexe (M/F)
 *   7 Date de naissance (AAAA-MM-JJ) · 8 Code CSP · 9 Libellé CSP
 *   10 Date de début du mandat · 11 Libellé de la fonction (facultatif, ex.
 *   « 9ème Vice-président du conseil départemental ») · 12 Date de début de la fonction.
 *
 * Un canton élit un binôme : deux lignes par canton, à distinguer par
 * (canton, élu) en aval. Mise à jour trimestrielle, pas de pagination. Les
 * lignes incomplètes sont ignorées silencieusement. Appelé par
 * run-conseillers-dep.ts, consommé par upsert/conseillers-dep.ts. Voir docs/DOMAINS.md.
 */
import { logger } from '../logger.js';

const RNE_CONSEILLERS_DEP_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/601ef073-d986-4582-8e1a-ed14dc857fba';

/** Nombre de colonnes attendu par ligne ; en deçà, la ligne est rejetée. */
const EXPECTED_COLUMNS = 13;

export interface RneConseillerDep {
  departmentCode: string;
  departmentName: string;
  cantonCode: string;
  cantonName: string;
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
 * est trop courte ou si un champ clé (canton, nom, prénom, naissance) est
 * vide. Tout code sexe autre que « F » est lu comme « M ».
 */
export function parseCsvRow(line: string): RneConseillerDep | undefined {
  const cols = line.split(';');
  if (cols.length < EXPECTED_COLUMNS) return undefined;

  const cantonCode = cols[2]?.trim();
  const lastName = cols[4]?.trim();
  const firstName = cols[5]?.trim();
  const birthDate = cols[7]?.trim();
  const mandateStart = cols[10]?.trim();
  const functionLabel = cols[11]?.trim() ?? '';
  // Dernière colonne : trim() retire déjà le CR d'une fin de ligne CRLF,
  // le replace est une ceinture supplémentaire.
  const functionStartDate = cols[12]?.trim().replace(/\r?\n$/, '') ?? '';

  if (!cantonCode || !lastName || !firstName || !birthDate) {
    return undefined;
  }

  return {
    departmentCode: cols[0]?.trim() ?? '',
    departmentName: cols[1]?.trim() ?? '',
    cantonCode,
    cantonName: cols[3]?.trim() ?? '',
    lastName,
    firstName,
    gender: cols[6]?.trim() === 'F' ? 'F' : 'M',
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
export async function fetchRneConseillersDep(
  fetchFn: typeof fetch = fetch,
): Promise<RneConseillerDep[]> {
  const response = await fetchFn(RNE_CONSEILLERS_DEP_URL);
  if (!response.ok) {
    throw new Error(
      `RNE conseillers départementaux error: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  const lines = text.split('\n');
  const results: RneConseillerDep[] = [];

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
    `RNE conseillers départementaux: ${results.length} conseillers parsed`,
  );
  return results;
}
