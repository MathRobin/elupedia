/**
 * Maires — lecteur du fichier RNE (Répertoire national des élus) publié sur
 * data.gouv.fr (~34 800 lignes, une par commune).
 *
 * Format brut : CSV `;` sans guillemets, UTF-8, CRLF, première ligne = en-tête,
 * 14 colonnes dans cet ordre :
 *   0 Code du département · 1 Libellé du département · 2-3 Code/Libellé de la
 *   collectivité à statut particulier (vides pour la quasi-totalité des lignes)
 *   4 Code de la commune (INSEE) · 5 Libellé de la commune · 6 Nom · 7 Prénom
 *   8 Code sexe (M/F) · 9 Date de naissance (AAAA-MM-JJ) · 10 Code CSP
 *   11 Libellé CSP · 12 Date de début du mandat (conseiller municipal)
 *   13 Date de début de la fonction (de maire).
 *
 * Pas de colonne « fonction » : toutes les lignes sont des maires. Mise à jour
 * trimestrielle, pas de pagination. Les lignes incomplètes sont ignorées
 * silencieusement. Appelé par run-maires.ts, consommé par upsert/mayors.ts.
 * Voir docs/DOMAINS.md.
 */
import { logger } from '../logger.js';

const RNE_MAIRES_URL =
  'https://www.data.gouv.fr/api/1/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503';

/** Nombre de colonnes attendu par ligne ; en deçà, la ligne est rejetée. */
const EXPECTED_COLUMNS = 14;

export interface RneMaire {
  departmentCode: string;
  departmentName: string;
  communeCode: string;
  communeName: string;
  lastName: string;
  firstName: string;
  gender: 'M' | 'F';
  birthDate: string;
  mandateStartDate: string;
  functionStartDate: string;
}

/**
 * Parse une ligne de données (hors en-tête). Retourne undefined si la ligne
 * est trop courte ou si un champ clé (commune, nom, prénom, naissance) est
 * vide. Tout code sexe autre que « F » est lu comme « M ».
 */
export function parseCsvRow(line: string): RneMaire | undefined {
  const cols = line.split(';');
  if (cols.length < EXPECTED_COLUMNS) return undefined;

  const communeCode = cols[4]?.trim();
  const lastName = cols[6]?.trim();
  const firstName = cols[7]?.trim();
  const birthDate = cols[9]?.trim();
  const mandateStart = cols[12]?.trim();
  // Dernière colonne : trim() retire déjà le CR d'une fin de ligne CRLF,
  // le replace est une ceinture supplémentaire.
  const functionStart = cols[13]?.trim().replace(/\r?\n$/, '');

  if (!communeCode || !lastName || !firstName || !birthDate) {
    return undefined;
  }

  return {
    departmentCode: cols[0]?.trim() ?? '',
    departmentName: cols[1]?.trim() ?? '',
    communeCode,
    communeName: cols[5]?.trim() ?? '',
    lastName,
    firstName,
    gender: cols[8]?.trim() === 'F' ? 'F' : 'M',
    birthDate,
    mandateStartDate: mandateStart ?? '',
    functionStartDate: functionStart ?? '',
  };
}

/**
 * Télécharge le CSV complet (un GET) et retourne les lignes valides.
 * Lève une erreur sur réponse HTTP non 2xx.
 */
export async function fetchRneMaires(
  fetchFn: typeof fetch = fetch,
): Promise<RneMaire[]> {
  const response = await fetchFn(RNE_MAIRES_URL);
  if (!response.ok) {
    throw new Error(
      `RNE maires error: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  const lines = text.split('\n');
  const results: RneMaire[] = [];

  // Ligne 0 = en-tête.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const maire = parseCsvRow(line);
    if (maire) {
      results.push(maire);
    }
  }

  logger.info(`RNE maires: ${results.length} maires parsed`);
  return results;
}
